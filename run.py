"""Start the app: `python run.py` (or `npm start`)."""

import os

import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    port = int(os.environ.get("PORT") or 5177)
    print(f"Multi-model chatbot is running at http://localhost:{port}")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, log_level="warning")
