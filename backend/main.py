import os
import sys
from pathlib import Path

# Ensure both current directory and parent directory are on sys.path
# This guarantees `import backend...` works whether Render runs from repo root or inside backend/
current_dir = Path(__file__).resolve().parent
parent_dir = current_dir.parent

for p in [str(parent_dir), str(current_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
