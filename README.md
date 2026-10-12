# Multi-Model Chatbot

Ask once, compare every answer. The app sends the same prompt to Mistral, NVIDIA, and Hugging Face in parallel and shows each model's reply in its own card as soon as it arrives.

Live: https://multi-model-api-chatbot.vercel.app/

## Project layout

- `public/`: static front end (HTML, CSS, JS)
- `api/`: Vercel serverless functions
  - `GET /api/providers`: lists providers and whether each has a key configured
  - `POST /api/chat/:provider`: sends `{ "prompt": "..." }` to one provider
- `lib/providers.mjs`: shared provider config and API calls
- `server.mjs`: local dev server that serves `public/` and the same API routes

## Run locally

1. Copy `.env.example` to `.env` and add the API keys you want to use.
2. Run `npm start` (Node 18+).
3. Open `http://localhost:5177`.

Providers without a key show `Needs key`; the others answer normally.

## Deploy to Vercel

1. Import this repository in Vercel (no build command needed).
2. Under **Settings → Environment Variables**, add `MISTRAL_API_KEY`, `NVIDIA_API_KEY`, and `HF_TOKEN`, plus any `*_MODEL` overrides.
3. Deploy. Every push to `main` redeploys.

## Providers and default models

| Provider | Endpoint | Key | Model (override) |
| --- | --- | --- | --- |
| Mistral | `api.mistral.ai/v1/chat/completions` | `MISTRAL_API_KEY` | `mistral-small-latest` (`MISTRAL_MODEL`) |
| NVIDIA | `integrate.api.nvidia.com/v1/chat/completions` | `NVIDIA_API_KEY` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (`NVIDIA_MODEL`) |
| Hugging Face | `router.huggingface.co/v1/chat/completions` | `HF_TOKEN` | `meta-llama/Llama-3.1-8B-Instruct` (`HF_MODEL`) |
