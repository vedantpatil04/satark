# SATARK Cross-Platform LAN Guide (Windows & macOS)

This guide provides end-to-end instructions for running and connecting **SATARK** across **Windows** and **macOS** devices over a Local Area Network (LAN / Wi-Fi) with trusted **HTTPS**, **WSS**, and zero browser security warnings.

---

## 1. Domain Architecture: Why `satark.test` is Preferred Over `.local`

- **The macOS `.local` Conflict (RFC 6762)**: macOS reserves `.local` strictly for Multicast DNS (Bonjour/mDNS on UDP port 5353). When a Mac queries `satark.local`, macOS attempts to resolve it via mDNS before or instead of `/etc/hosts`, resulting in 5–10 second lookup timeouts or connection failures.
- **The `.test` Standard (RFC 2606 / RFC 6761)**: `.test` is an official IETF reserved top-level domain for local software testing. Both macOS and Windows resolve `satark.test` instantly via their local `hosts` files without mDNS collisions.
- **Dual Support**: SATARK's SSL certificates and backend CORS allow both **`satark.test`** and **`satark.local`**, along with direct LAN IP access (e.g. `10.146.60.105`).

---

## 2. Network Topology & Services

| Service | Port | Protocol | Host URL |
| :--- | :--- | :--- | :--- |
| **Student Portal** | `5173` | HTTPS | `https://satark.test:5173` |
| **Teacher Portal** | `5174` | HTTPS | `https://satark.test:5174` |
| **FastAPI Backend & WSS** | `8000` | HTTPS / WSS | `https://satark.test:8000` & `wss://satark.test:8000/ws` |
| **Interactive API Docs** | `8000` | HTTPS | `https://satark.test:8000/docs` |

---

## 3. Host Server Setup

### Option A: Windows PC as Host Server
1. Right-click **`setup-host.bat`** and select **"Run as administrator"**.
   - Generates the Root CA (`certs/ca.crt`) and server certificate (`certs/cert.pem`).
   - Automatically installs `certs/ca.crt` into the Windows Trusted Root Authorities store.
   - Maps `127.0.0.1 satark.test` and `<LAN_IP> satark.test` in `C:\Windows\System32\drivers\etc\hosts`.
2. Start the servers:
   ```cmd
   run.bat
   ```

### Option B: macOS (MacBook / Mac Mini / iMac) as Host Server
1. Clone or copy the SATARK repository to your Mac.
2. Open Terminal, navigate to the repo root, and run:
   ```bash
   chmod +x setup-mac.sh run.sh scripts/*.sh
   sudo ./setup-mac.sh
   ```
   - Automatically generates the PKI certificates (`satark.test`).
   - Installs and trusts `ca.crt` in the **macOS System Keychain** (`/Library/Keychains/System.keychain`).
   - Adds `satark.test` and `satark.local` to `/etc/hosts`.
   - Flushes macOS DNS cache.
3. Start the services:
   ```bash
   ./run.sh
   ```

---

## 4. Client PC Setup (Teacher or Student)

### When Client is a Windows PC
1. Ensure the Windows PC is connected to the same Wi-Fi / LAN as the host.
2. Copy `setup-client.bat`, `scripts/setup-client-pc.ps1`, and `certs/ca.crt` to the Windows PC.
3. Open Command Prompt as Administrator and run:
   ```cmd
   setup-client.bat <HOST_IP>
   ```
   *(Example: `setup-client.bat 10.146.60.105`)*
4. Open Chrome or Edge $\rightarrow$ navigate to `https://satark.test:5173` or `https://satark.test:5174`.

### When Client is a macOS Machine (MacBook / iMac)
1. Ensure the Mac is connected to the same Wi-Fi / LAN as the host.
2. Copy `setup-mac.sh`, `scripts/setup-mac.sh`, and `certs/ca.crt` to the Mac.
3. Open Terminal and run:
   ```bash
   sudo ./setup-mac.sh <HOST_IP>
   ```
   *(Example: `sudo ./setup-mac.sh 10.146.60.105`)*
4. Open Google Chrome, Safari, or Microsoft Edge $\rightarrow$ navigate to:
   ```text
   https://satark.test:5173
   ```
   The browser displays a secure connection lock with 0 SSL warnings.

---

## 5. macOS System Permissions (Crucial for WebRTC Streaming)

On macOS (macOS 12 Monterey, macOS 13 Ventura, macOS 14 Sonoma, macOS 15 Sequoia), Apple requires explicit system-level permission for browser camera and screen recording.

### 1. Screen & System Audio Recording Permission
If a Mac student accepts a screen-share request and the screen doesn't broadcast:
1. Open **System Settings** (Apple menu $\rightarrow$ System Settings).
2. Click **Privacy & Security** in the sidebar.
3. Click **Screen & System Audio Recording** (or **Screen Recording** on older macOS versions).
4. Toggle **ON** the switch next to **Google Chrome**, **Microsoft Edge**, or **Safari**.
5. When prompted, click **Quit & Reopen** (or restart the browser).

### 2. Camera & Microphone Permission
1. In **System Settings** $\rightarrow$ **Privacy & Security** $\rightarrow$ **Camera**.
2. Ensure **Google Chrome** / **Microsoft Edge** / **Safari** is toggled **ON**.

---

## 6. Verifying Cross-OS WebRTC Streaming

### Scenario 1: Windows Teacher $\leftrightarrow$ Mac Student
1. **Teacher (Windows)**: Opens `https://satark.test:5174`, logs in as teacher, starts the active exam session, and opens **Live Monitoring**.
2. **Student (Mac)**: Opens `https://satark.test:5173`, logs in as student, and clicks **Start Exam**.
3. **Teacher** clicks **View Screen** / **Request Stream**.
4. **Mac Student** receives the consent modal and clicks **Accept**. The macOS screen picker appears; student selects "Entire Screen" or exam window.
5. **Teacher Dashboard (Windows)**: The Mac student's screen is displayed as the primary feed, with the Mac's FaceTime HD camera as a picture-in-picture stream.

### Scenario 2: Mac Teacher $\leftrightarrow$ Windows Student
1. **Teacher (Mac)**: Opens `https://satark.test:5174` and navigates to **Live Monitoring**.
2. **Student (Windows)**: Opens `https://satark.test:5173` and enters the active exam.
3. Teacher sends a stream request.
4. Windows student accepts and shares screen.
5. **Teacher Dashboard (Mac)**: Displays the Windows student's live display and webcam smoothly with low latency over native peer-to-peer WebRTC!

---

## 7. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **`NET::ERR_CERT_AUTHORITY_INVALID` on Mac** | Root CA not trusted in System Keychain. | Run `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/ca.crt`. |
| **`Permission denied by system` on Mac** | macOS Screen Recording not enabled in System Settings. | Open System Settings $\rightarrow$ Privacy & Security $\rightarrow$ Screen & System Audio Recording, enable browser, and restart browser. |
| **Mac cannot reach `satark.test`** | `/etc/hosts` missing entry or DNS cache stale. | Verify `/etc/hosts` has `<HOST_IP> satark.test`, then run `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`. |
| **Windows firewall blocking Mac connection** | Inbound port restriction on host PC. | Run on Windows Host as Admin: <br>`New-NetFirewallRule -DisplayName "SATARK HTTPS" -Direction Inbound -LocalPort 5173,5174,8000 -Protocol TCP -Action Allow` |

