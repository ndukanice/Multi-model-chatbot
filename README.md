# Multi-Model Chatbot

Ask once, compare every answer. The app sends the same prompt to Claude (Anthropic) and OpenRouter in parallel and shows each model's reply in its own card as soon as it arrives.

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
2. Run `npm install`, then `npm start` (Node 18+).
3. Open `http://localhost:5177`.

Providers without a key show `Needs key`; the others answer normally.

## Deploy to Vercel

1. Import this repository in Vercel (framework preset: Other, no build command).
2. Under **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`, plus any `*_MODEL` overrides.
3. Deploy. Every push to `main` redeploys.

## Providers and default models

| Provider | Endpoint | Key | Model (override) |
| --- | --- | --- | --- |
| Claude | Anthropic Messages API via `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-opus-5-5` (`ANTHROPIC_MODEL`) |
| OpenRouter | `openrouter.ai/api/v1/chat/completions` | `OPENROUTER_API_KEY` | `google/gemma-4-31b-it:free` (`OPENROUTER_MODEL`) |

Claude requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`), so a safety decline is retried on Anthropic's recommended fallback model. Free OpenRouter models are often rate-limited, so OpenRouter requests also list `OPENROUTER_FALLBACK_MODELS` (comma-separated; default `poolside/laguna-s-2.1:free`) for OpenRouter to try when the main model is busy. Set `OPENROUTER_MODEL` to any model ID from openrouter.ai/models.
