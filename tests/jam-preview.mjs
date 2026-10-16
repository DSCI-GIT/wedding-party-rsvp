// Local-only UI fixture. The server never reads production records or invitation tokens.
import http from "node:http";
import { makeBackend } from "./jam-backend.test.mjs";

const { call } = makeBackend();
const messages = [];
const server = http.createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5174");
  response.setHeader("Content-Type", "application/json");
  if (request.method === "OPTIONS") { response.setHeader("Access-Control-Allow-Headers", "Content-Type"); response.end(); return; }
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    const { token, action, ...values } = request.method === "GET" ? Object.fromEntries(new URL(request.url, "http://localhost").searchParams) : JSON.parse(body);
    if (action === "community") {
      response.end(JSON.stringify({ ok: true, community: { channel: "jam", unlocked: true, profile: { displayName: "Alex S.", mutedUntil: "" }, topic: "Wedding jam", announcements: [], messages } })); return;
    }
    if (action === "postMessage" && values.channel === "jam") {
      const message = { id: String(messages.length), channel: "jam", displayName: "Alex S.", kind: "chat", body: values.body, createdAt: new Date().toISOString() };
      messages.push(message); response.end(JSON.stringify({ ok: true, message })); return;
    }
    if (process.env.JAM_FIXTURE_INVALID_SUCCESS === "1" && action === "batch") { response.end(JSON.stringify({ ok: true, ackRevision: values.revision })); return; }
    response.end(JSON.stringify(call(token, action, values)));
  }
  catch { response.statusCode = 400; response.end(JSON.stringify({ ok: false, error: "Bad fixture request" })); }
});
server.listen(8770, "127.0.0.1", () => console.log("Invented guest fixture: http://127.0.0.1:8770"));
