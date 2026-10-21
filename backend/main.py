"""FastAPI server: serves public/ and the provider API routes."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from .providers import ask_provider, find_provider, list_providers  # noqa: E402

app = FastAPI(title="Multi-Model Chatbot")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])

NO_STORE = {"Cache-Control": "no-store"}


@app.middleware("http")
async def no_cache(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.get("/api/providers")
async def providers():
    return JSONResponse({"providers": list_providers()}, headers=NO_STORE)


@app.post("/api/chat/{provider_id}")
async def chat(provider_id: str, request: Request):
    provider = find_provider(provider_id)
    if provider is None:
        return JSONResponse({"error": "Unknown provider."}, status_code=404, headers=NO_STORE)

    try:
        body = await request.json()
    except ValueError:
        body = {}
    prompt = str(body.get("prompt") or "").strip() if isinstance(body, dict) else ""
    if not prompt:
        return JSONResponse({"error": "Prompt is required."}, status_code=400, headers=NO_STORE)

    return JSONResponse(await ask_provider(provider, prompt), headers=NO_STORE)


# Locally FastAPI serves the front end; on Vercel the CDN serves public/ instead.
if (ROOT / "public").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "public", html=True), name="public")
