import assert from "node:assert/strict";
import test from "node:test";

async function fetchWorker(path, init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("status reports no live model and no ticket database", async () => {
  const response = await fetchWorker("/api/status");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ai: false, tickets: false });
});

test("chat falls back to the knowledge base without an API key", async () => {
  const response = await fetchWorker("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: "demo-session",
      messages: [{ role: "user", content: "請介紹你們的方案與價格。" }],
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.source, "knowledge_base");
  assert.match(body.reply, /Starter/);
});

test("chat rejects an empty message", async () => {
  const response = await fetchWorker("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(response.status, 400);
});

test("tickets stay disabled when D1 is not bound", async () => {
  const response = await fetchWorker("/api/tickets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Demo",
      email: "demo@example.com",
      category: "billing",
      message: "Please review this request.",
    }),
  });
  assert.equal(response.status, 503);
});
