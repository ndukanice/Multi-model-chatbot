// Shared provider logic used by both the local server (server.mjs) and the
// Vercel serverless functions in /api.

const SYSTEM_PROMPT = "You are a concise, helpful chatbot. Answer clearly and directly.";

// Read env lazily so the local server can load .env before the first call.
function providerConfigs() {
  return [
    {
      id: "mistral",
      name: "Mistral",
      model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      apiKey: process.env.MISTRAL_API_KEY,
      envKey: "MISTRAL_API_KEY",
      baseUrl: "https://api.mistral.ai/v1/chat/completions"
    },
    {
      id: "nvidia",
      name: "NVIDIA",
      model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      apiKey: process.env.NVIDIA_API_KEY,
      envKey: "NVIDIA_API_KEY",
      baseUrl: "https://integrate.api.nvidia.com/v1/chat/completions"
    },
    {
      id: "huggingface",
      name: "Hugging Face",
      model: process.env.HF_MODEL || "meta-llama/Llama-3.1-8B-Instruct",
      apiKey: process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY,
      envKey: "HF_TOKEN",
      baseUrl: "https://router.huggingface.co/v1/chat/completions"
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
    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: provider.model,
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

    return { ...base, ok: true, answer: extractAnswer(data), elapsedMs: Date.now() - startedAt, error: "" };
  } catch (error) {
    return { ...base, ok: false, answer: "", elapsedMs: Date.now() - startedAt, error: error.message || "Request failed." };
  }
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
