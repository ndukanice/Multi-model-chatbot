"""Provider config and API calls shared by the FastAPI routes."""

import os
import re
import time
from dataclasses import dataclass, field

import httpx

SYSTEM_PROMPT = "You are a concise, helpful chatbot. Answer clearly and directly."
TIMEOUT_SECONDS = 55


@dataclass
class Provider:
    id: str
    name: str
    model: str
    api_key: str | None
    env_key: str
    base_url: str
    kind: str = "openai"
    fallback_models: list[str] = field(default_factory=list)


def provider_configs() -> list[Provider]:
    # Read env lazily so values loaded from .env at startup are picked up.
    env = os.environ.get
    return [
        Provider(
            id="nvidia",
            name="NVIDIA",
            model=env("NVIDIA_MODEL") or "nvidia/nemotron-3.5-lightning-30b-a3b",
            api_key=env("NVIDIA_API_KEY"),
            env_key="NVIDIA_API_KEY",
            base_url="https://integrate.api.nvidia.com/v1/chat/completions",
        ),
        Provider(
            id="anthropic",
            name="Claude",
            model=env("ANTHROPIC_MODEL") or "claude-sonnet-5-5",
            api_key=env("ANTHROPIC_API_KEY"),
            env_key="ANTHROPIC_API_KEY",
            base_url="https://api.anthropic.com/v1/messages",
            kind="anthropic",
        ),
        Provider(
            id="openrouter",
            name="OpenRouter",
            model=env("OPENROUTER_MODEL") or "google/gemma-4-31b-it:free",
            api_key=env("OPENROUTER_API_KEY"),
            env_key="OPENROUTER_API_KEY",
            base_url="https://openrouter.ai/api/v1/chat/completions",
            # Free models are often rate-limited upstream; OpenRouter tries these next.
            fallback_models=[
                m.strip()
                for m in (env("OPENROUTER_FALLBACK_MODELS") or "poolside/laguna-s-2.1:free").split(",")
                if m.strip()
            ],
        ),
    ]


def list_providers() -> list[dict]:
    return [
        {"id": p.id, "name": p.name, "model": p.model, "configured": bool(p.api_key)}
        for p in provider_configs()
    ]


def find_provider(provider_id: str) -> Provider | None:
    return next((p for p in provider_configs() if p.id == provider_id), None)


async def ask_provider(provider: Provider, prompt: str) -> dict:
    started = time.monotonic()
    base = {"id": provider.id, "name": provider.name, "model": provider.model}

    if not provider.api_key:
        return {
            **base,
            "ok": False,
            "answer": "",
            "elapsedMs": 0,
            "error": f"{provider.name} is not configured. Set {provider.env_key} in your environment.",
        }

    try:
        if provider.kind == "anthropic":
            answer = await _ask_anthropic(provider, prompt)
        else:
            answer = await _ask_openai_compatible(provider, prompt)
        return {**base, "ok": True, "answer": answer, "elapsedMs": _elapsed_ms(started), "error": ""}
    except Exception as error:  # noqa: BLE001 - surfaced to the UI card
        message = str(error) or type(error).__name__
        return {**base, "ok": False, "answer": "", "elapsedMs": _elapsed_ms(started), "error": message}


def _elapsed_ms(started: float) -> int:
    return round((time.monotonic() - started) * 1000)


async def _post(url: str, headers: dict, payload: dict) -> dict | None:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.post(url, headers=headers, json=payload)

    data = _try_json(response)
    if response.is_error:
        raise RuntimeError(_extract_error(data) or response.text or f"{response.status_code} {response.reason_phrase}")
    return data


async def _ask_anthropic(provider: Provider, prompt: str) -> str:
    data = await _post(
        provider.base_url,
        {
            "x-api-key": provider.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        {
            "model": provider.model,
            "max_tokens": 1024,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": prompt}],
        },
    )

    if (data or {}).get("stop_reason") == "refusal":
        raise RuntimeError("Claude declined to answer this prompt.")

    blocks = (data or {}).get("content") or []
    answer = "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
    return answer or "No text answer returned."


async def _ask_openai_compatible(provider: Provider, prompt: str) -> str:
    payload = {
        "model": provider.model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 1024,
        "stream": False,
    }
    if provider.fallback_models:
        payload["models"] = [provider.model, *provider.fallback_models]

    data = await _post(
        provider.base_url,
        {"Authorization": f"Bearer {provider.api_key}", "Content-Type": "application/json"},
        payload,
    )
    return _extract_answer(data)


def _extract_answer(data: dict | None) -> str:
    choices = (data or {}).get("choices") or [{}]
    content = (choices[0].get("message") or {}).get("content")
    if isinstance(content, list):
        content = "".join(part.get("text") or part.get("content") or "" for part in content)
    # Reasoning models may inline their chain of thought in <think> tags.
    answer = re.sub(r"<think>[\s\S]*?</think>", "", str(content or "")).strip()
    return answer or "No text answer returned."


def _extract_error(data: dict | None) -> str:
    if not data:
        return ""
    error = data.get("error")
    if isinstance(error, str):
        return error
    if isinstance(error, dict):
        # OpenRouter puts the upstream provider's actual reason in error.metadata.raw.
        raw = (error.get("metadata") or {}).get("raw")
        if isinstance(raw, str):
            return raw
        if isinstance(error.get("message"), str):
            return error["message"]
    if isinstance(data.get("message"), str):
        return data["message"]
    return ""


def _try_json(response: httpx.Response) -> dict | None:
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None
