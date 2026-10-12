import { listProviders } from "../lib/providers.mjs";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ providers: listProviders() });
}
