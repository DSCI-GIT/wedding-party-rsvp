// Local-only UI fixture. The server never reads production records or invitation tokens.
import http from "node:http";
import { makeBackend } from "./jam-backend.test.mjs";

const { call } = makeBackend();
const server = http.createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5174");
  response.setHeader("Content-Type", "application/json");
  if (request.method === "OPTIONS") { response.setHeader("Access-Control-Allow-Headers", "Content-Type"); response.end(); return; }
  let body = "";
  for await (const chunk of request) body += chunk;
  try { const { token, action, ...values } = JSON.parse(body); response.end(JSON.stringify(call(token, action, values))); }
  catch { response.statusCode = 400; response.end(JSON.stringify({ ok: false, error: "Bad fixture request" })); }
});
server.listen(8770, "127.0.0.1", () => console.log("Invented guest fixture: http://127.0.0.1:8770"));
