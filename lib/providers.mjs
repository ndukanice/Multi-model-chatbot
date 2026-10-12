// Shared provider logic used by both the local server (server.mjs) and the
// Vercel serverless functions in /api.

import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = "You are a concise, helpful chatbot. Answer clearly and directly.";

// Read env lazily so the local server can load .env before the first call.
function providerConfigs() {
  return [
    {
      id: "anthropic",
      name: "Claude",
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      apiKey: process.env.ANTHROPIC_API_KEY,
      envKey: "ANTHROPIC_API_KEY",
      kind: "anthropic"
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
      apiKey: process.env.OPENROUTER_API_KEY,
      envKey: "OPENROUTER_API_KEY",
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      // Free models are often rate-limited upstream; OpenRouter tries these next.
      fallbackModels: (process.env.OPENROUTER_FALLBACK_MODELS || "poolside/laguna-s-2.1:free")
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
    }
  ];
}

export function listProviders() {
  return providerConfigs().map(({ id, name, model, apiKey }) => ({
    id,
    name,
    model,
    configured: Boolean(apiKey)
  }));
}

export function findProvider(id) {
  return providerConfigs().find((provider) => provider.id === id);
}

export async function askProvider(provider, prompt) {
  const startedAt = Date.now();
  const base = { id: provider.id, name: provider.name, model: provider.model };

  if (!provider.apiKey) {
    return {
      ...base,
      ok: false,
      answer: "",
      elapsedMs: 0,
      error: `${provider.name} is not configured. Set ${provider.envKey} in your environment.`
    };
  }

  try {
    const answer = provider.kind === "anthropic"
      ? await askAnthropic(provider, prompt)
      : await askOpenAICompatible(provider, prompt);

    return { ...base, ok: true, answer, elapsedMs: Date.now() - startedAt, error: "" };
  } catch (error) {
    return { ...base, ok: false, answer: "", elapsedMs: Date.now() - startedAt, error: error.message || "Request failed." };
  }
}

async function askAnthropic(provider, prompt) {
  const client = new Anthropic({ apiKey: provider.apiKey, timeout: 55000, maxRetries: 1 });
  const response = await client.beta.messages.create({
    model: provider.model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort: "medium" },
    // On a safety decline, re-run the request on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default"
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to answer this prompt.");
  }

  const answer = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  return answer || "No text answer returned.";
}

async function askOpenAICompatible(provider, prompt) {
  const response = await fetch(provider.baseUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      ...(provider.fallbackModels?.length && { models: [provider.model, ...provider.fallbackModels] }),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1024,
      stream: false
    }),
    signal: AbortSignal.timeout(55000)
  });

  const text = await response.text();
  const data = tryParseJson(text);

  if (!response.ok) {
    throw new Error(extractError(data) || text || `${response.status} ${response.statusText}`);
  }

  return extractAnswer(data);
}

function extractAnswer(data) {
  let content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    content = content.map((part) => part.text || part.content || "").join("");
  }
  // Reasoning models may inline their chain of thought in <think> tags.
  const answer = String(content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return answer || "No text answer returned.";
}

function extractError(data) {
  if (!data) return "";
  if (typeof data.error === "string") return data.error;
  // OpenRouter puts the upstream provider's actual reason in error.metadata.raw.
  if (typeof data.error?.metadata?.raw === "string") return data.error.metadata.raw;
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
