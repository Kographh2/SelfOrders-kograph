// Isolated read-only backend for HTTP browser checks. Never reaches a live database.
import { createServer } from "node:http";
createServer((request, response) => {
  if (request.url === "/health") { response.writeHead(200); response.end("ok"); return; }
  response.setHeader("Content-Type", "application/json");
  if (request.method === "GET" && request.url.startsWith("/rest/v1/kiosk_stations?")) {
    response.writeHead(200); response.end("[]"); return;
  }
  response.writeHead(403); response.end(JSON.stringify({ message: "Unmocked database request blocked" }));
}).listen(3128, "127.0.0.1");
