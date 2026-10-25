"""
Root entrypoint for Render and other deployment platforms.
Exposes the FastAPI `app` from `backend.app`.
"""
from backend.app import app

if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
