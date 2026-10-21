# Multi-Model Chatbot

Ask once, compare every answer. The app sends the same prompt to NVIDIA, Claude (Anthropic), and OpenRouter in parallel and shows each model's reply in its own card as soon as it arrives.

Live: https://multimodelschatbot.vercel.app/

## Project layout

- `public/`: front end (HTML, CSS, vanilla JavaScript running in the browser)
- `backend/`: Python (FastAPI) back end
  - `GET /api/providers`: lists providers and whether each has a key configured
  - `POST /api/chat/{provider}`: sends `{ "prompt": "..." }` to one provider
  - `providers.py`: provider config and API calls
  - `main.py`: the FastAPI app; also serves `public/`
- `run.py`: starts the server (`python run.py`)
- `package.json`: Node.js scripts (`npm start` runs `run.py`)

## Run locally

1. Copy `.env.example` to `.env` and add the API keys you want to use.
2. Install dependencies: `pip install -r requirements.txt` (Python 3.10+).
3. Start it with `python run.py` or `npm start`.
4. Open `http://localhost:5177`.

Providers without a key show `Needs key`; the others answer normally.

## Providers and default models

| Provider | Endpoint | Key | Model (override) |
| --- | --- | --- | --- |
| NVIDIA | `integrate.api.nvidia.com/v1/chat/completions` | `NVIDIA_API_KEY` | `nvidia/nemotron-3.5-lightning-30b-a3b` (`NVIDIA_MODEL`) |
| Claude (Anthropic) | `api.anthropic.com/v1/messages` | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` (`ANTHROPIC_MODEL`) |
| OpenRouter | `openrouter.ai/api/v1/chat/completions` | `OPENROUTER_API_KEY` | `google/gemma-4-31b-it:free` (`OPENROUTER_MODEL`) |

NVIDIA and OpenRouter use the OpenAI-compatible chat completions format; Claude uses Anthropic’s Messages API. Free OpenRouter models are often rate-limited, so OpenRouter requests also list `OPENROUTER_FALLBACK_MODELS` (comma-separated; default `poolside/laguna-s-2.1:free`) for OpenRouter to try when the main model is busy. Set `OPENROUTER_MODEL` to any model ID from openrouter.ai/models.
