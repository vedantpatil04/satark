# Smart Classroom — Desktop Monitoring Agent (Phase 1.4)

Lightweight, privacy-respecting cross-platform Python desktop agent for the **Smart Classroom – Exam Integrity & Focus Management System**.

Connects physical student workstations to the centralized FastAPI backend, transmits liveness heartbeats, buffers telemetry locally across network disconnects, and reports verified foreground application changes to the Teacher Portal.

---

## 1. Features & Architectural Overview

- **Secure Student-Device Pairing**: Eliminates stored student passwords, teacher tokens, and browser cookies. Uses single-use, 10-minute pairing codes generated from the Student Portal.
- **Strict Event Envelope**: Adheres 100% to `docs/API_CONTRACT.md` with UUIDv4 deduplication, ISO-8601 UTC timestamps, and `source="agent"`.
- **Liveness Heartbeats**: Automatically emits heartbeats every 10 seconds via WebSocket with seamless HTTP REST fallback.
- **Local Event Buffering**: Stores telemetry in an encrypted local SQLite database queue (`agent_buffer.db`) during network drops, with automatic replay and acknowledgment once connectivity returns.
- **Privacy Guarantees**:
  -  **NO** keystroke logging or password capture.
  -  **NO** secret screen recording or continuous screen captures.
  -  **NO** webcam or microphone recording.
  -  **NO** clipboard or personal file content inspection.
  -  **ONLY** tracks verified executable process names (e.g., `chrome.exe`, `code.exe`) and policy rule triggers.
- **Cross-Platform Support**:
  - **Windows**: Full foreground process detection via Windows API (`user32.dll` and `psutil`), physical display count via `SM_CMONITORS`.
  - **Linux**: X11 foreground window detection via `xprop` and `/proc`. On Wayland or headless environments, reports feature limitations honestly without crashing, keeping heartbeats fully operational.

---

## 2. Directory Structure

```
desktop-agent/
├── src/
│   ├── common/
│   │   ├── config.py           # Configuration loader & persistent pairing storage
│   │   ├── identity.py         # Hardware UUID, hostname & OS detection
│   │   ├── pairing.py          # Single-use pairing code exchange
│   │   ├── api_client.py       # REST API client with Bearer device token
│   │   ├── websocket_client.py # Real-time WS connection to /ws/agent with backoff
│   │   ├── heartbeat.py        # Periodic heartbeat scheduler (10s)
│   │   ├── event_buffer.py     # SQLite FIFO queue with ACK and overflow pruning
│   │   ├── event_envelope.py   # Factory for contract-compliant telemetry events
│   │   └── agent.py            # Central orchestrator connecting telemetry pipeline
│   ├── windows/
│   │   └── detector.py         # Windows API ctypes & psutil adapter
│   ├── linux/
│   │   └── detector.py         # Linux X11 / Wayland adapter
│   └── main.py                 # Visible student CLI interface & signal handling
├── tests/
│   ├── test_agent.py           # Unit tests for identity, buffer, and platforms
│   └── test_agent_e2e.py       # End-to-end integration test with backend
├── requirements.txt            # Minimal pinned dependencies
├── .env.example                # Configuration template
└── README.md                   # This document
```

---

## 3. Installation & Setup

### Prerequisites
- Python 3.10+ (tested on Python 3.13)
- Windows 10/11 or Linux (Ubuntu, Debian, Fedora, Arch)

### Installation
From the `desktop-agent/` directory:

```bash
# 1. Create a virtual environment (optional if using shared workspace venv)
python -m venv venv

# On Windows:
venv\Scripts\activate

# On Linux:
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt
```

---

## 4. How to Pair and Run the Agent

### Step 1: Obtain a Pairing Code
1. Open the Student Portal in your web browser:
   - Local: `http://localhost:5173/student/dashboard`
   - LAN / Wi-Fi: `http://<HOST_IP>:5173/student/dashboard`
2. Click the **"Pair Desktop Agent"** button on the welcome banner.
3. A single-use 6-character code (e.g. `8K2NP4`) will appear with a 10-minute expiry timer.

### Step 2: Start the Agent
From the workspace root or inside `desktop-agent/`:

```bash
# Interactive mode (will prompt for pairing code):
python -m desktop-agent.src.main

# Or provide pairing code directly via CLI flag:
python -m desktop-agent.src.main --pairing-code 8K2NP4

# Specify a remote backend URL (e.g., when testing across LAN physical computers):
python -m desktop-agent.src.main --pairing-code 8K2NP4 --backend-url http://10.106.76.105:8000
```

### Step 3: Verify Connection
- The agent console displays:
  ```
  ========================================================================
       SMART CLASSROOM - DESKTOP MONITORING AGENT v1.0.0
  ========================================================================
    Workstation:    DESKTOP-ABC123 (WINDOWS)
    Hardware UUID:  a4e1d823-902f-5784-bb3f-12908f9021a4
    Backend URL:    http://127.0.0.1:8000
    Status:         PAIRED & AUTHORIZED
    Student:        John Doe (usr-9a8b7c)
  ```
- The instructor immediately sees the workstation change to **"Connected"** on the **Teacher Portal → Device Grid (`/teacher/devices`)**.
- As the student switches between applications, verified activity events appear in real-time.
- If a restricted application (such as Discord or CheatEngine) is focused, a high-severity alert is raised in the **Integrity Alert Center (`/teacher/reports`)**.

### Step 4: Disconnect
Press `Ctrl+C` to cleanly disconnect the agent, transmit an `agent_stopped` event, and mark the workstation offline.

---

## 5. Testing Guide (Multi-Computer Hackathon Verification)

### Computer 1 (Windows Host)
- Runs FastAPI backend and Vite frontend.
- Runs `desktop-agent` instance 1.
- Generates pairing code and verifies real-time status on Teacher Portal.

### Computer 2 (Second Windows or Linux Computer)
- Connects to Wi-Fi network.
- Runs `python -m src.main --backend-url http://10.106.76.105:8000 --pairing-code <CODE>`.
- Generates a distinct hardware UUID and heartbeat.
- Confirms two distinct devices appear simultaneously in the Teacher Portal.

### Computer 3 (Linux / Wayland Computer)
- Connects to Wi-Fi network.
- Tests platform detection and graceful degradation when running on Wayland (heartbeats maintained, window detection reported unsupported).

---

## 6. Automated Test Suite

Run all unit and end-to-end integration tests:

```bash
# Run agent unit tests
pytest desktop-agent/tests/test_agent.py -v

# Run full end-to-end integration test
pytest desktop-agent/tests/test_agent_e2e.py -v

# Run full project test suite
pytest backend/tests/ desktop-agent/tests/ -v
```
All 18 automated test suites pass with 100% compliance.

