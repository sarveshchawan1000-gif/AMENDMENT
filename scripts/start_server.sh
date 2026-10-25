#!/bin/bash
# Start the AMENDMENT backend API server

set -e

# Resolve project root (parent of scripts directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Change to project root
cd "${PROJECT_ROOT}"

echo "═══════════════════════════════════════════════════════════════"
echo "🎮 AMENDMENT Backend Server"
echo "═══════════════════════════════════════════════════════════════"
echo "Project root: ${PROJECT_ROOT}"
echo ""

# Check if dependencies are installed
if ! python3 -c "import fastapi, jwt, websockets" 2>/dev/null; then
    echo "⚠️  Dependencies not installed or missing packages. Installing..."
    if [ -f backend/requirements.txt ]; then
        pip3 install -r backend/requirements.txt -q
        echo "✅ Dependencies installed"
    else
        echo "❌ Error: backend/requirements.txt not found"
        exit 1
    fi
    echo ""
fi

# Check if Ollama is running (optional warning)
if [ "${COURT_PROVIDER:-ollama}" = "ollama" ]; then
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "⚠️  Warning: Ollama is not running"
        echo "   Amendments will fail unless Ollama is started:"
        echo "   ollama serve"
        echo ""
    else
        echo "✅ Ollama is running"
        echo ""
    fi
fi

# Verify backend module exists
if [ ! -f backend/app.py ]; then
    echo "❌ Error: backend/app.py not found"
    echo "   Make sure you're in the AMENDMENT project directory"
    exit 1
fi

echo "Starting server on http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Start server using module path (works from project root)
python3 -m uvicorn backend.app:app --reload --port 8000
