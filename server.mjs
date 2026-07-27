import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

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

const providers = [
  {
    id: "mistral",
    name: "Mistral",
    model: process.env.MISTRAL_MODEL || "mistral-small-latest",
    apiKey: process.env.MISTRAL_API_KEY,
    baseUrl: "https://api.mistral.ai/v1/chat/completions"
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    model: process.env.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-nano-8b-v1",
    apiKey: process.env.NVIDIA_API_KEY,
    baseUrl: "https://integrate.api.nvidia.com/v1/chat/completions"
  },
  {
    id: "grok",
    name: "Grok",
    model: process.env.XAI_MODEL || "grok-4.3",
    apiKey: process.env.XAI_API_KEY,
    baseUrl: "https://api.x.ai/v1/chat/completions"
  }
];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      return sendText(res, 204, "", "text/plain", corsHeaders);
    }

    if (req.method === "GET" && url.pathname === "/api/providers") {
      return sendJson(res, 200, {
        providers: providers.map(({ id, name, model, apiKey }) => ({
          id,
          name,
          model,
          configured: Boolean(apiKey)
        }))
      });
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || "{}");
      const prompt = String(parsed.prompt || "").trim();
      const history = Array.isArray(parsed.history) ? parsed.history : [];

      if (!prompt) {
        return sendJson(res, 400, { error: "Please enter a message." });
      }

      const messages = buildMessages(history, prompt);
      const results = await Promise.all(providers.map((provider) => askProvider(provider, messages)));
      return sendJson(res, 200, { results });
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



function buildMessages(history, prompt) {
  const cleanHistory = history
    .filter((message) => ["user", "assistant"].includes(message?.role) && typeof message.content === "string")
    .slice(-8)
    .map(({ role, content }) => ({ role, content }));

  return [
    {
      role: "system",
      content: "You are a concise, helpful chatbot. Answer clearly and directly."
    },
    ...cleanHistory,
    { role: "user", content: prompt }
  ];
}

async function askProvider(provider, messages) {
  const startedAt = Date.now();

  if (!provider.apiKey) {
    return {
      id: provider.id,
      name: provider.name,
      model: provider.model,
      status: "missing-key",
      answer: "",
      elapsedMs: 0,
      error: `Add ${provider.name}'s API key to .env, then restart the app.`
    };
  }

  try {
    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.7,
        max_tokens: 700,
        stream: false
      }),
      signal: AbortSignal.timeout(45000)
    });

    const text = await response.text();
    const data = tryParseJson(text);

    if (!response.ok) {
      throw new Error(extractError(data) || text || `${response.status} ${response.statusText}`);
    }

    return {
      id: provider.id,
      name: provider.name,
      model: provider.model,
      status: "ok",
      answer: extractAnswer(data),
      elapsedMs: Date.now() - startedAt,
      error: ""
    };
  } catch (error) {
    return {
      id: provider.id,
      name: provider.name,
      model: provider.model,
      status: "error",
      answer: "",
      elapsedMs: Date.now() - startedAt,
      error: error.message || "Request failed."
    };
  }
}

function extractAnswer(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text || part.content || "").join("").trim();
  }
  return String(content || "").trim() || "No text answer returned.";
}

function extractError(data) {
  if (!data) return "";
  if (typeof data.error === "string") return data.error;
  if (typeof data.error?.message === "string") return data.error.message;
  if (typeof data.message === "string") return data.message;
  return "";
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
