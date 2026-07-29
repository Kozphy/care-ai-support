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
      "Hello, I’m Kozphy Care. Ask me about accounts, plans, billing, refunds, or data security.",
    meta: "Now",
  },
];

const quickQuestions = [
  {
    label: "Plans & pricing",
    prompt: "Tell me about your plans and pricing.",
    code: "01",
  },
  {
    label: "Billing & refunds",
    prompt: "What payment methods and refund policies do you offer?",
    code: "02",
  },
  {
    label: "Account help",
    prompt: "I can’t sign in to my account and need help.",
    code: "03",
  },
  {
    label: "Data security",
    prompt: "How do you protect my data?",
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
      meta: "Now",
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
          meta: data.source === "ai" ? "AI reply" : "Knowledge base reply",
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: makeId("assistant"),
          role: "assistant",
          content:
            "We’re having trouble connecting right now. Please try again in a moment, or choose “Talk to a person” and we’ll take it from there.",
          meta: "System message",
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
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Kozphy Care home">
          <span className="brand-mark" aria-hidden="true">
            K
          </span>
          <span>
            <strong>Kozphy</strong> Care
          </span>
        </a>
        <div className="nav-actions">
          <a href="#capabilities">Capabilities</a>
          <button
            className="status-button"
            type="button"
            onClick={() => setHandoffOpen(true)}
          >
            <span className="live-dot" aria-hidden="true" />
            Human support
          </button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span aria-hidden="true">✦</span>
            AI SUPPORT CENTER
          </div>
          <h1>
            Fast answers,
            <br />
            <em>with a human when it matters.</em>
          </h1>
          <p className="hero-description">
            Kozphy Care combines a trusted knowledge base with AI to handle
            everyday questions around the clock. When a case needs judgment or
            personal data, it creates a human support ticket.
          </p>

          <div className="question-grid" aria-label="Common question shortcuts">
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
              <span>H</span>
            </div>
            <p>
              <strong>24 / 7 instant support</strong>
              <span>Human handoff is always within reach</span>
            </p>
          </div>
        </div>

        <section className="chat-card" aria-label="AI support conversation">
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
                  Typically replies instantly
                </span>
              </div>
            </div>
            <span className={`mode-badge ${status.ai ? "is-ai" : ""}`}>
              {status.ai ? "AI connected" : "Knowledge base mode"}
            </span>
          </header>

          <div className="chat-messages" aria-live="polite">
            <div className="day-label">Today</div>
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
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
              <article className="message assistant" aria-label="Typing">
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
              Enter your message
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
              placeholder="Ask a question…"
            />
            <button
              className="send-button"
              type="submit"
              disabled={!input.trim() || isSending}
              aria-label="Send message"
            >
              ↑
            </button>
          </form>
          <button
            type="button"
            className="handoff-link"
            onClick={() => setHandoffOpen(true)}
          >
            Need more help? Talk to a person
            <span aria-hidden="true">→</span>
          </button>
        </section>
      </section>

      <section className="capability-strip" id="capabilities">
        <article>
          <span className="capability-index">01</span>
          <div>
            <strong>Grounded answers</strong>
            <p>
              Uses approved product and policy knowledge first, and never
              guesses when the answer is unclear.
            </p>
          </div>
        </article>
        <article>
          <span className="capability-index">02</span>
          <div>
            <strong>Privacy first</strong>
            <p>
              API keys stay on the server, and conversations are not stored
              permanently in your browser.
            </p>
          </div>
        </article>
        <article>
          <span className="capability-index">03</span>
          <div>
            <strong>Human handoff</strong>
            <p>
              High-risk or account-specific cases become support tickets with
              the context your team needs.
            </p>
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
              aria-label="Close"
            >
              ×
            </button>
            {ticketState === "success" ? (
              <div className="success-state">
                <span className="success-mark" aria-hidden="true">
                  ✓
                </span>
                <p className="modal-kicker">Ticket created</p>
                <h2 id="handoff-title">
                  A support specialist will take it from here
                </h2>
                <p>
                  Your ticket number is <strong>#{ticketId}</strong>. Keep it
                  handy for follow-up.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={closeHandoff}
                >
                  Back to chat
                </button>
              </div>
            ) : (
              <>
                <p className="modal-kicker">Human handoff</p>
                <h2 id="handoff-title">Talk to a support specialist</h2>
                <p className="modal-intro">
                  Leave your contact details and a short summary. We’ll create a
                  ticket and continue from this conversation.
                </p>
                <form className="ticket-form" onSubmit={handleTicketSubmit}>
                  <div className="form-row">
                    <label>
                      Name
                      <input
                        name="name"
                        required
                        maxLength={80}
                        placeholder="Your name"
                      />
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
                    Issue type
                    <select name="category" defaultValue="account">
                      <option value="account">Account &amp; sign-in</option>
                      <option value="billing">Billing &amp; refunds</option>
                      <option value="product">Using the product</option>
                      <option value="security">Security &amp; privacy</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label>
                    Issue summary
                    <textarea
                      name="message"
                      required
                      maxLength={2000}
                      rows={5}
                      defaultValue={
                        messages.filter((message) => message.role === "user").at(-1)
                          ?.content ?? ""
                      }
                      placeholder="Tell us what happened"
                    />
                  </label>
                  {ticketState === "error" && (
                    <p className="form-error" role="alert">
                      We couldn’t create your ticket. Please try again in a
                      moment.
                    </p>
                  )}
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={ticketState === "sending" || !status.tickets}
                  >
                    {ticketState === "sending"
                      ? "Creating…"
                      : "Create support ticket"}
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
