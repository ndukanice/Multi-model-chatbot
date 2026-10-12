import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { askProvider, findProvider, listProviders } from "./lib/providers.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");

const envPath = join(root, ".env");
loadEnvFile(envPath);

const preferredPort = Number(process.env.PORT || 5177);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      return sendText(res, 204, "", "text/plain", corsHeaders);
    }

    if (req.method === "GET" && url.pathname === "/api/providers") {
      return sendJson(res, 200, { providers: listProviders() });
    }

    const chatMatch = url.pathname.match(/^\/api\/chat\/([\w-]+)$/);
    if (req.method === "POST" && chatMatch) {
      const provider = findProvider(chatMatch[1]);
      if (!provider) {
        return sendJson(res, 404, { error: "Unknown provider." });
      }

      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || "{}");
      const prompt = String(parsed.prompt || "").trim();

      if (!prompt) {
        return sendJson(res, 400, { error: "Prompt is required." });
      }

      return sendJson(res, 200, await askProvider(provider, prompt));
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
});

listenWithFallback(preferredPort);

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (key && (process.env[key] == null || String(process.env[key]).trim() === "")) {
      process.env[key] = value;
    }
  }
}

function listenWithFallback(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port > 0) {
      const fallbackPort = 0;
      console.warn(`Port ${port} is already in use. Trying an open port instead.`);
      listenWithFallback(fallbackPort);
      return;
    }

    throw error;
  });

  server.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`Multi-model chatbot is running at http://localhost:${actualPort}`);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    return sendText(res, 403, "Forbidden", "text/plain");
  }

  try {
    const file = await readFile(filePath);
    sendText(res, 200, file, contentType(extname(filePath)));
  } catch {
    sendText(res, 404, "Not found", "text/plain");
  }
}

function sendJson(res, status, payload, extraHeaders = {}) {
  sendText(res, status, JSON.stringify(payload), "application/json", extraHeaders);
}

function sendText(res, status, payload, type, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...corsHeaders,
    ...extraHeaders
  });
  res.end(payload);
}

function contentType(extension) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  }[extension] || "application/octet-stream";
}
