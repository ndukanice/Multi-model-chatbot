# Multi-Model Chatbot

A simple local chatbot that sends the same prompt to Mistral, NVIDIA, and Grok at the same time, then displays their answers side by side.

## Setup

1. Copy `.env.example` to `.env`.
2. Add the API keys you want to use.
3. Start the app:

```powershell
npm start
```

4. Open `http://localhost:5177`.

## API Keys

- Mistral uses `https://api.mistral.ai/v1/chat/completions`.
- NVIDIA uses `https://integrate.api.nvidia.com/v1/chat/completions`.
- Grok uses `https://api.x.ai/v1/chat/completions`.

The app will still open without keys. Any missing provider shows `Needs key` while configured providers can answer normally.

## Model Defaults

- `MISTRAL_MODEL=mistral-small-latest`
- `NVIDIA_MODEL=nvidia/llama-3.1-nemotron-nano-8b-v1`
- `XAI_MODEL=grok-4.3`

Change those values in `.env` if your account exposes different free models.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Push this project to the repository.
3. In GitHub, open Settings → Pages and select GitHub Actions as the source.
4. Push to the `main` branch to trigger the workflow.

> Note: the frontend can be hosted on GitHub Pages, but the live model calls still require the local Node backend. For a fully hosted production deployment, the backend should be moved to a service such as Render or Railway.
