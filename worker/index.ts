/** Cloudflare Worker entry point for Kozphy Care. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type Message = {
  role: "assistant" | "user";
  content: string;
};

const DEFAULT_MODEL = "gpt-5.6-luna";

const knowledgeBase = `
Kozphy Care 示範知識庫
- 方案：Starter 適合個人與小型專案；Growth 適合成長團隊；Enterprise 提供客製整合與專屬支援。實際價格與合約內容需由真人確認。
- 付款：支援主要信用卡。企業客戶可申請發票付款，需由真人審核。
- 退款：首次購買後 14 天內可提出退款申請；是否符合資格需由真人依使用情況確認。
- 帳號：忘記密碼可使用登入頁的「忘記密碼」。若無法收到重設信，先檢查垃圾郵件，再建立服務單。
- 安全：API 金鑰只存在伺服器端。客服不會要求提供密碼、完整信用卡號或一次性驗證碼。
- 資料：使用者可以申請匯出或刪除帳號資料；身分確認與執行由真人處理。
- 支援：AI 全天候提供常見問題協助。付款爭議、帳號所有權、安全事件、法律或合約問題必須轉交真人。
`.trim();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readJson(request: Request, maxLength = 48_000) {
  const raw = await request.text();
  if (raw.length > maxLength) throw new Error("payload_too_large");
  return JSON.parse(raw) as Record<string, unknown>;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function fallbackReply(message: string) {
  const text = message.toLowerCase();

  if (/真人|專人|客服人員|agent|human|服務單/.test(text)) {
    return "沒問題。請點選下方「轉接真人服務」，留下聯絡方式與問題摘要，我們會建立服務單接手處理。";
  }
  if (/忘記密碼|無法登入|登入|帳號|password|login/.test(text)) {
    return "如果忘記密碼，請先使用登入頁的「忘記密碼」重設。若收不到重設信，請檢查垃圾郵件；仍無法登入時，我可以幫你轉接真人確認帳號。請不要提供密碼或驗證碼。";
  }
  if (/退款|退費|refund/.test(text)) {
    return "首次購買後 14 天內可以提出退款申請；實際資格需要依使用情況由真人確認。你可以點選「轉接真人服務」建立退款服務單。";
  }
  if (/付款|信用卡|發票|billing|payment|invoice/.test(text)) {
    return "目前支援主要信用卡；企業客戶可申請發票付款，但需要人工審核。若是扣款爭議，建議直接轉接真人處理。";
  }
  if (/價格|方案|費用|price|pricing|plan/.test(text)) {
    return "目前規劃 Starter、Growth 與 Enterprise 三種方案，分別對應個人、小型團隊與需要客製整合的企業。實際價格與合約內容請轉接真人確認。";
  }
  if (/安全|隱私|資料|刪除|匯出|security|privacy|data/.test(text)) {
    return "API 金鑰只保存在伺服器端。客服不會要求你的密碼、完整信用卡號或一次性驗證碼。你也可以申請匯出或刪除帳號資料，這類申請會轉交真人完成身分確認。";
  }

  return "我目前只能根據已核准的知識庫回答方案、付款、退款、帳號與資料安全問題。這個問題需要更多產品資訊；你可以換個方式描述，或點選「轉接真人服務」。";
}

async function safetyIdentifier(sessionId: string) {
  const bytes = new TextEncoder().encode(sessionId || "anonymous");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `support_${Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function outputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text.trim();
      }
    }
  }
  return "";
}

async function handleChat(request: Request, env: Env) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return json({ error: "請求格式不正確。" }, 400);
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: Message[] = rawMessages
    .slice(-16)
    .map((item) => {
      const entry = item as { role?: unknown; content?: unknown };
      return {
        role: entry.role === "assistant" ? "assistant" : "user",
        content: cleanText(entry.content, 2_000),
      } satisfies Message;
    })
    .filter((message) => message.content);

  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ??
    "";
  if (!lastUserMessage) {
    return json({ error: "請輸入問題。" }, 400);
  }

  if (!env.OPENAI_API_KEY) {
    return json({
      reply: fallbackReply(lastUserMessage),
      source: "knowledge_base",
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions: `你是 Kozphy Care 的客服助理。直接回答問題，語氣清楚、冷靜、有同理心。
只使用下方知識庫中的事實，不要猜測價格、政策、期限或帳號狀態。
使用者使用什麼語言，就用相同語言回答。
付款爭議、帳號所有權、安全事件、法律、合約、資料匯出或刪除必須建議轉接真人。
永遠不要索取密碼、完整信用卡號或一次性驗證碼。
若知識庫不足，坦白說明並邀請使用者建立真人服務單。
每次回答以 2 到 5 句為主，不要使用 Markdown 表格。

${knowledgeBase}`,
        input: messages,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        max_output_tokens: 500,
        safety_identifier: await safetyIdentifier(
          cleanText(body.sessionId, 200),
        ),
        store: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      return json({
        reply: fallbackReply(lastUserMessage),
        source: "knowledge_base",
      });
    }

    const data = (await response.json()) as Record<string, unknown>;
    const reply = outputText(data);
    return json({
      reply: reply || fallbackReply(lastUserMessage),
      source: reply ? "ai" : "knowledge_base",
    });
  } catch {
    return json({
      reply: fallbackReply(lastUserMessage),
      source: "knowledge_base",
    });
  }
}

async function ensureTicketsTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new'
      )`,
    )
    .run();
}

async function handleTicket(request: Request, env: Env) {
  if (!env.DB) return json({ error: "服務單功能尚未啟用。" }, 503);

  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 12_000);
  } catch {
    return json({ error: "請求格式不正確。" }, 400);
  }

  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 180).toLowerCase();
  const category = cleanText(body.category, 40) || "other";
  const message = cleanText(body.message, 2_000);

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "請填寫有效的聯絡資料與問題摘要。" }, 400);
  }

  await ensureTicketsTable(env.DB);
  const result = (await env.DB.prepare(
    "INSERT INTO tickets (name, email, category, message) VALUES (?, ?, ?, ?)",
  )
    .bind(name, email, category, message)
    .run()) as { meta?: { last_row_id?: number } };

  return json({ ticketId: result.meta?.last_row_id ?? "NEW" }, 201);
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/status" && request.method === "GET") {
      return json({
        ai: Boolean(env.OPENAI_API_KEY),
        tickets: Boolean(env.DB),
      });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, env);
    }

    if (url.pathname === "/api/tickets" && request.method === "POST") {
      return handleTicket(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
