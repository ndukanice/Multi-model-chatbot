import { askProvider, findProvider } from "../../lib/providers.mjs";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const provider = findProvider(req.query.provider);
  if (!provider) {
    return res.status(404).json({ error: "Unknown provider." });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(await askProvider(provider, prompt));
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
