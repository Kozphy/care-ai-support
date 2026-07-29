"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Role = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  meta?: string;
};

type ServiceStatus = {
  ai: boolean;
  tickets: boolean;
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是 Kozphy Care。你可以問我帳號、方案、付款、退款或資料安全相關問題。",
    meta: "現在",
  },
];

const quickQuestions = [
  {
    label: "方案與價格",
    prompt: "請介紹你們的方案與價格。",
    code: "01",
  },
  {
    label: "付款與退款",
    prompt: "付款方式和退款政策是什麼？",
    code: "02",
  },
  {
    label: "帳號協助",
    prompt: "我無法登入帳號，需要協助。",
    code: "03",
  },
  {
    label: "資料安全",
    prompt: "你們如何保護我的資料？",
    code: "04",
  },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSessionId() {
  const key = "kozphy-care-session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<ServiceStatus>({
    ai: false,
    tickets: true,
  });
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [ticketState, setTicketState] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setStatus({ ai: Boolean(data.ai), tickets: Boolean(data.tickets) });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  async function sendMessage(quickPrompt?: string) {
    const content = (quickPrompt ?? input).trim();
    if (!content || isSending) return;

    const userMessage: ChatMessage = {
      id: makeId("user"),
      role: "user",
      content,
      meta: "現在",
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
          messages: nextMessages.map(({ role, content: text }) => ({
            role,
            content: text,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.reply) {
        throw new Error(data.error ?? "Unable to reply");
      }
      setMessages((current) => [
        ...current,
        {
          id: makeId("assistant"),
          role: "assistant",
          content: data.reply,
          meta: data.source === "ai" ? "AI 回覆" : "知識庫回覆",
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: makeId("assistant"),
          role: "assistant",
          content:
            "目前連線有些忙碌。你可以稍後再試，或選擇「轉接真人」留下問題，我們會接手處理。",
          meta: "系統訊息",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  async function handleTicketSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTicketState("sending");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          category: form.get("category"),
          message: form.get("message"),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ticketId) throw new Error();
      setTicketId(String(data.ticketId));
      setTicketState("success");
    } catch {
      setTicketState("error");
    }
  }

  function closeHandoff() {
    setHandoffOpen(false);
    setTicketState("idle");
    setTicketId(null);
  }

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="主要導覽">
        <a className="brand" href="#top" aria-label="Kozphy Care 首頁">
          <span className="brand-mark" aria-hidden="true">
            K
          </span>
          <span>
            <strong>Kozphy</strong> Care
          </span>
        </a>
        <div className="nav-actions">
          <a href="#capabilities">服務能力</a>
          <button
            className="status-button"
            type="button"
            onClick={() => setHandoffOpen(true)}
          >
            <span className="live-dot" aria-hidden="true" />
            真人支援
          </button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span aria-hidden="true">✦</span>
            AI 客服中心
          </div>
          <h1>
            快速解答，
            <br />
            <em>也知道何時交給真人。</em>
          </h1>
          <p className="hero-description">
            Kozphy Care 結合精準知識庫與 AI，全天候處理常見問題；遇到需要判斷或個人資料的情況，立即建立真人服務單。
          </p>

          <div className="question-grid" aria-label="常見問題捷徑">
            {quickQuestions.map((question) => (
              <button
                type="button"
                className="question-card"
                key={question.label}
                onClick={() => void sendMessage(question.prompt)}
              >
                <span className="question-code">{question.code}</span>
                <span>{question.label}</span>
                <span className="arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
          </div>

          <div className="trust-row">
            <div className="avatar-stack" aria-hidden="true">
              <span>AI</span>
              <span>KC</span>
              <span>人</span>
            </div>
            <p>
              <strong>24 / 7 即時支援</strong>
              <span>保留轉接真人的最後一哩</span>
            </p>
          </div>
        </div>

        <section className="chat-card" aria-label="AI 客服對話">
          <header className="chat-header">
            <div className="agent">
              <div className="agent-avatar" aria-hidden="true">
                K
                <span />
              </div>
              <div>
                <strong>Kozphy Care</strong>
                <span>
                  <i aria-hidden="true" />
                  通常立即回覆
                </span>
              </div>
            </div>
            <span className={`mode-badge ${status.ai ? "is-ai" : ""}`}>
              {status.ai ? "AI 已連線" : "知識庫模式"}
            </span>
          </header>

          <div className="chat-messages" aria-live="polite">
            <div className="day-label">今天</div>
            {messages.map((message) => (
              <article
                className={`message ${message.role}`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <span className="message-avatar" aria-hidden="true">
                    K
                  </span>
                )}
                <div>
                  <p>{message.content}</p>
                  <small>{message.meta}</small>
                </div>
              </article>
            ))}
            {isSending && (
              <article className="message assistant" aria-label="正在輸入">
                <span className="message-avatar" aria-hidden="true">
                  K
                </span>
                <div className="typing">
                  <span />
                  <span />
                  <span />
                </div>
              </article>
            )}
            <div ref={messageEndRef} />
          </div>

          <div className="suggestion-row">
            {quickQuestions.slice(0, 3).map((question) => (
              <button
                type="button"
                key={question.label}
                onClick={() => void sendMessage(question.prompt)}
                disabled={isSending}
              >
                {question.label}
              </button>
            ))}
          </div>

          <form className="chat-input" onSubmit={handleChatSubmit}>
            <label className="sr-only" htmlFor="chat-message">
              輸入訊息
            </label>
            <textarea
              id="chat-message"
              rows={1}
              maxLength={1200}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="輸入你的問題…"
            />
            <button
              className="send-button"
              type="submit"
              disabled={!input.trim() || isSending}
              aria-label="送出訊息"
            >
              ↑
            </button>
          </form>
          <button
            type="button"
            className="handoff-link"
            onClick={() => setHandoffOpen(true)}
          >
            需要更多協助？轉接真人服務
            <span aria-hidden="true">→</span>
          </button>
        </section>
      </section>

      <section className="capability-strip" id="capabilities">
        <article>
          <span className="capability-index">01</span>
          <div>
            <strong>有根據的回答</strong>
            <p>優先使用核准的產品與政策知識，不確定時不猜測。</p>
          </div>
        </article>
        <article>
          <span className="capability-index">02</span>
          <div>
            <strong>隱私優先</strong>
            <p>API 金鑰只留在伺服器端，對話不寫入瀏覽器永久儲存。</p>
          </div>
        </article>
        <article>
          <span className="capability-index">03</span>
          <div>
            <strong>真人接手</strong>
            <p>高風險或個人化問題可建立服務單，保留完整處理脈絡。</p>
          </div>
        </article>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            K
          </span>
          <span>
            <strong>Kozphy</strong> Care
          </span>
        </a>
        <p>AI first. Human when it matters.</p>
      </footer>

      {handoffOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="handoff-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="handoff-title"
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeHandoff}
              aria-label="關閉"
            >
              ×
            </button>
            {ticketState === "success" ? (
              <div className="success-state">
                <span className="success-mark" aria-hidden="true">
                  ✓
                </span>
                <p className="modal-kicker">服務單已建立</p>
                <h2 id="handoff-title">真人客服會接手處理</h2>
                <p>
                  你的服務單編號是 <strong>#{ticketId}</strong>。請保留這個編號以便後續查詢。
                </p>
                <button type="button" className="primary-button" onClick={closeHandoff}>
                  返回對話
                </button>
              </div>
            ) : (
              <>
                <p className="modal-kicker">Human handoff</p>
                <h2 id="handoff-title">交給真人客服</h2>
                <p className="modal-intro">
                  留下聯絡方式與問題摘要，我們會建立服務單並延續這次對話。
                </p>
                <form className="ticket-form" onSubmit={handleTicketSubmit}>
                  <div className="form-row">
                    <label>
                      稱呼
                      <input name="name" required maxLength={80} placeholder="你的名字" />
                    </label>
                    <label>
                      Email
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={180}
                        placeholder="name@example.com"
                      />
                    </label>
                  </div>
                  <label>
                    問題類型
                    <select name="category" defaultValue="account">
                      <option value="account">帳號與登入</option>
                      <option value="billing">付款與退款</option>
                      <option value="product">產品使用</option>
                      <option value="security">安全與隱私</option>
                      <option value="other">其他</option>
                    </select>
                  </label>
                  <label>
                    問題摘要
                    <textarea
                      name="message"
                      required
                      maxLength={2000}
                      rows={5}
                      defaultValue={
                        messages.filter((message) => message.role === "user").at(-1)
                          ?.content ?? ""
                      }
                      placeholder="請描述你遇到的狀況"
                    />
                  </label>
                  {ticketState === "error" && (
                    <p className="form-error" role="alert">
                      服務單暫時無法送出，請稍後再試。
                    </p>
                  )}
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={ticketState === "sending" || !status.tickets}
                  >
                    {ticketState === "sending" ? "正在建立…" : "建立服務單"}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
