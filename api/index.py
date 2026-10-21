"""Vercel entrypoint: exposes the FastAPI app as a serverless function."""

from backend.main import app  # noqa: F401
