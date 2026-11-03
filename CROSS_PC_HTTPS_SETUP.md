# SATARK Cross-PC LAN Hostname & HTTPS Setup Guide

This document describes how to run and connect **SATARK** across multiple physical Windows PCs over a local area network (LAN / Wi-Fi) with trusted **HTTPS** and **WSS**, resolving `satark.local` without warnings or blocked camera/screen permissions.

---

## 1. Why HTTPS is Required for Cross-PC WebRTC

Modern web browsers (Google Chrome, Microsoft Edge, Brave, Mozilla Firefox) enforce a strict **Secure Context Policy**:
- **Camera Capture (`navigator.mediaDevices.getUserMedia`)** and **Screen Sharing (`navigator.mediaDevices.getDisplayMedia`)** are **permanently disabled** on non-localhost HTTP origins (such as `http://10.146.60.105:5173` or `http://satark.local:5173`).
- Attempting to initiate screen sharing or camera streaming over plain HTTP from a remote PC causes the browser to throw:
  ```text
  TypeError: navigator.mediaDevices.getDisplayMedia is not a function
  DOMException: Only secure contexts are allowed.
  ```
- By establishing a local **Root Certificate Authority (CA)** and serving all SATARK portals over **trusted HTTPS / WSS**, remote candidate and proctor PCs operate in a 100% verified Secure Context. The browser automatically grants screen selection and camera access without security warnings.

---

## 2. Network Topology & Ports

| Service | Protocol | Host Binding | Local & Remote URL |
| :--- | :--- | :--- | :--- |
| **Student Portal** | HTTPS | `0.0.0.0:5173` | `https://satark.local:5173` |
| **Teacher Portal** | HTTPS | `0.0.0.0:5174` | `https://satark.local:5174` |
| **FastAPI Backend & WSS** | HTTPS / WSS | `0.0.0.0:8000` | `https://satark.local:8000` / `wss://satark.local:8000/ws` |
| **API Docs (Swagger)** | HTTPS | `0.0.0.0:8000` | `https://satark.local:8000/docs` |

**Host LAN IP:** `10.146.60.105`

---

## 3. Host PC Setup (One-Time)

To configure the host PC where the SATARK server runs:

1. Right-click **`setup-host.bat`** (or run `powershell -ExecutionPolicy Bypass -File scripts\setup-host-https.ps1` as Administrator).
2. The script will:
   - Generate the **SATARK Local Root CA** (`certs/ca.crt`) and server certificate (`certs/cert.pem`) with Subject Alternative Names (SANs) covering `satark.local`, `*.satark.local`, `localhost`, and LAN IPs (`10.146.60.105`).
   - Automatically import `certs/ca.crt` into the Windows **Trusted Root Certification Authorities** store (`Cert:\LocalMachine\Root`).
   - Map `satark.local` to `127.0.0.1` and `10.146.60.105` in `C:\Windows\System32\drivers\etc\hosts`.
   - Flush the Windows DNS cache (`ipconfig /flushdns`).
3. Start all services by double-clicking **`run.bat`**.

---

## 4. Connecting Client Windows PCs (Students / Proctors)

To connect any other physical Windows laptop or desktop PC on the same Wi-Fi / Ethernet LAN:

### Method A: Automated One-Click Setup (Recommended)
1. Share the `certs\ca.crt` file and `setup-client.bat` with the student PC (via shared folder, USB drive, or LAN transfer).
2. On the student PC, right-click **`setup-client.bat`** and choose **"Run as administrator"**.
   - If the host IP changed, run:
     ```powershell
     .\setup-client.bat 10.146.60.105
     ```
3. The script will:
   - Import `ca.crt` into the student PC's Windows Trusted Root store.
   - Add `10.146.60.105  satark.local` to `C:\Windows\System32\drivers\etc\hosts`.
   - Flush the student PC's DNS cache.
4. Open Chrome or Edge on the student PC and visit:
   ```text
   https://satark.local:5173
   ```
   The browser displays a secure connection lock with zero certificate errors.

---

### Method B: Manual Configuration

If you prefer to configure the student PC manually without running the script:

#### Step 1: Install the Root CA Certificate
1. Copy `certs/ca.crt` from the host PC to the student PC.
2. Double-click `ca.crt` $\rightarrow$ click **Install Certificate...**
3. Select Store Location: **Local Machine** $\rightarrow$ click **Next**.
4. Select **Place all certificates in the following store** $\rightarrow$ click **Browse...**
5. Select **Trusted Root Certification Authorities** $\rightarrow$ click **OK** $\rightarrow$ **Next** $\rightarrow$ **Finish**.

#### Step 2: Add `hosts` Entry
1. Open PowerShell or Notepad as **Administrator**.
2. Open `C:\Windows\System32\drivers\etc\hosts`.
3. Add the following line at the bottom:
   ```text
   10.146.60.105       satark.local
   ```
4. Save the file and flush DNS:
   ```powershell
   ipconfig /flushdns
   ```

---

## 5. WebRTC Cross-PC Verification Workflow

Once the student PC is configured:

1. **Teacher Proctoring**:
   - On the Teacher PC, open `https://satark.local:5174` and log in as teacher (`teacher@smartclassroom.edu` or newly registered teacher account).
   - Navigate to **Examinations** $\rightarrow$ select an active exam session $\rightarrow$ click **Live Monitoring**.
2. **Student Participation**:
   - On the Student PC, open `https://satark.local:5173` and log in as student.
   - Navigate to the active exam session and click **Start Exam**.
3. **Live Streaming Verification**:
   - The teacher clicks **View Screen** or **Request Stream** for the student.
   - The student receives the screen-share prompt and grants permission to share their full screen or active exam window.
   - The student's primary screen and webcam picture-in-picture feeds appear smoothly in the Teacher Monitoring grid with real-time WebRTC media tracks.

---

## 6. Troubleshooting

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **"Your connection is not private" (NET::ERR_CERT_AUTHORITY_INVALID)** | Root CA is not installed in the client PC's Trusted Root store. | Run `setup-client.bat` as Administrator on the client PC to install `ca.crt`. |
| **Browser cannot find `satark.local`** | Missing entry in `hosts` file. | Check that `C:\Windows\System32\drivers\etc\hosts` contains `10.146.60.105 satark.local` and run `ipconfig /flushdns`. |
| **Connection timed out** | Windows Firewall blocking incoming traffic on host PC. | On the host PC, allow ports 5173, 5174, and 8000 through Windows Defender Firewall: <br>`New-NetFirewallRule -DisplayName "SATARK HTTPS" -Direction Inbound -LocalPort 5173,5174,8000 -Protocol TCP -Action Allow` |
| **Mixed Content Warning** | An asset or API call attempted plain HTTP. | Resolved by SATARK's dynamic origin client: all API and WebSocket calls inherit the page's `https:` protocol and `satark.local` hostname automatically. |

