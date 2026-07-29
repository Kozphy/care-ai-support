/** Cloudflare Worker entry point for Kozphy Care. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
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
Kozphy Care demo knowledge base
- Plans: Starter is for individuals and small projects; Growth is for growing teams; Enterprise includes custom integrations and dedicated support. A support specialist must confirm current pricing and contract terms.
- Billing: Major credit cards are accepted. Enterprise customers can request invoice billing, subject to review.
- Refunds: Refund requests may be submitted within 14 days of an initial purchase. Eligibility depends on usage and must be confirmed by a support specialist.
- Accounts: Use "Forgot password" on the sign-in page. If the reset email does not arrive, check spam before creating a ticket.
- Security: API keys remain server-side. Support will never ask for a password, full card number, or one-time verification code.
- Data: Users may request an export or deletion of account data. Identity verification and fulfillment are handled by a support specialist.
- Support: AI handles common questions around the clock. Billing disputes, account ownership, security incidents, legal matters, contracts, exports, and deletion requests require human review.
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

  if (
    /agent|human|person|representative|specialist|support ticket|talk to someone/.test(
      text,
    )
  ) {
    return "Of course. Choose “Talk to a person” below and leave your contact details and a short summary. We’ll create a support ticket and take it from there.";
  }
  if (
    /forgot.*password|reset.*password|can.?t sign in|cannot sign in|login|log in|account/.test(
      text,
    )
  ) {
    return "Use “Forgot password” on the sign-in page to reset your password. If the email doesn’t arrive, check your spam folder; if you still can’t sign in, create a human support ticket so we can verify the account. Never share your password or verification code.";
  }
  if (/refund|money back/.test(text)) {
    return "You may submit a refund request within 14 days of an initial purchase. Eligibility depends on usage and must be confirmed by a support specialist. Choose “Talk to a person” to create a refund ticket.";
  }
  if (/billing|payment|credit card|invoice|charge/.test(text)) {
    return "We accept major credit cards. Enterprise customers can request invoice billing, subject to review. For a disputed charge, please create a human support ticket.";
  }
  if (/price|pricing|plan|cost|subscription/.test(text)) {
    return "Kozphy Care offers Starter for individuals and small projects, Growth for growing teams, and Enterprise for custom integrations and dedicated support. A support specialist must confirm current pricing and contract terms.";
  }
  if (/security|privacy|data|delete|deletion|export/.test(text)) {
    return "API keys remain on the server, and support will never ask for your password, full card number, or one-time verification code. You may request an export or deletion of account data; a support specialist will verify your identity and complete the request.";
  }

  return "I can only answer questions covered by the approved knowledge base: plans, billing, refunds, accounts, and data security. I don’t have enough product information to answer that confidently. Try rephrasing, or choose “Talk to a person.”";
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
    return json({ error: "Invalid request format." }, 400);
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
    return json({ error: "Please enter a question." }, 400);
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
        instructions: `You are Kozphy Care’s customer support assistant. Answer directly in a clear, calm, empathetic tone.
Use only facts in the knowledge base below. Never guess pricing, policy, deadlines, or account status.
Reply in English unless the user explicitly asks for another language.
Recommend human handoff for billing disputes, account ownership, security incidents, legal or contract matters, data exports, or deletions.
Never request passwords, full card numbers, or one-time verification codes.
If the knowledge base is insufficient, say so and invite the user to create a human support ticket.
Keep replies to 2–5 sentences and do not use Markdown tables.

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
  if (!env.DB) return json({ error: "Ticketing is not enabled." }, 503);

  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 12_000);
  } catch {
    return json({ error: "Invalid request format." }, 400);
  }

  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 180).toLowerCase();
  const category = cleanText(body.category, 40) || "other";
  const message = cleanText(body.message, 2_000);

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(
      { error: "Enter valid contact details and an issue summary." },
      400,
    );
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
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
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
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
