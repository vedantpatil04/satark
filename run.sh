#!/usr/bin/env bash
# ==============================================================================
# SATARK macOS & Linux Launcher (HTTPS & LAN Enabled)
# ==============================================================================

set -e
cd "$(dirname "$0")"

echo "============================================================"
echo "  SATARK - Starting All Services on macOS / Linux"
echo "============================================================"

# 1. Ensure SSL certificates exist
if [ ! -f "certs/cert.pem" ] || [ ! -f "certs/key.pem" ]; then
    echo "[*] Generating SSL certificates for satark.test..."
    python3 scripts/generate_certs.py
fi

# 2. Detect python executable
PYTHON_BIN="backend/venv/bin/python"
if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

echo "[1/3] Starting FastAPI Backend on port 8000 with HTTPS..."
$PYTHON_BIN -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile certs/key.pem --ssl-certfile certs/cert.pem --reload &
BACKEND_PID=$!

sleep 2

echo "[2/3] Starting Teacher Portal on port 5174 with HTTPS..."
npm run dev:teacher &
TEACHER_PID=$!

echo "[3/3] Starting Student Portal on port 5173 with HTTPS..."
npm run dev:student &
STUDENT_PID=$!

trap "echo 'Stopping SATARK services...'; kill $BACKEND_PID $TEACHER_PID $STUDENT_PID 2>/dev/null; exit" SIGINT SIGTERM

echo ""
echo "============================================================"
echo "  SATARK Services Running with Trusted HTTPS:"
echo "  - Teacher Portal:  https://satark.test:5174"
echo "  - Student Portal:  https://satark.test:5173"
echo "  - Backend API:     https://satark.test:8000"
echo "  - API Docs:        https://satark.test:8000/docs"
echo "============================================================"
echo "Press CTRL+C to stop all services."

if command -v open >/dev/null 2>&1; then
    sleep 2
    open "https://satark.test:5174"
    open "https://satark.test:5173"
fi

wait

