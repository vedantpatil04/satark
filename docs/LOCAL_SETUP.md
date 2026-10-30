# SATARK — Local Host & Client Setup Guide

**Team**: WEBFARM  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Target OS**: Windows 10 / Windows 11 (Host Machine)  
**Architecture**: Fully Local, Offline LAN (No Docker, No Supabase, No Cloud)

---

## 1. System Requirements

### Host Machine (One Windows PC)
- **OS**: Windows 10 (Build 19041+) or Windows 11
- **Python**: 3.11+ (Tested and verified with Python 3.13)
- **Node.js**: v18.0.0+ (Tested with v22.22.3)
- **Network**: Wi-Fi adapter or Ethernet connected to a local router or mobile phone hotspot.
- **Hardware**: Minimum 8 GB RAM, Quad-Core CPU recommended.

### Client Devices (Up to 5 Student Laptops + Android Phones)
- **Student Workstations**: Any Windows, macOS, or Linux laptop with Google Chrome, Microsoft Edge, or Mozilla Firefox.
- **Android Mobile**: Android 7.0+ (API 24+) with either Google Chrome or the SATARK Capacitor APK.

---

## 2. Host Machine Step-by-Step Installation

### Step 2.1: Clone Repository & Open Terminal
Open PowerShell as Administrator in the repository folder:
```powershell
cd "c:\Users\Vedant  Patil\Downloads\study-zen-vision-main-main (1)\study-zen-vision-main-main"
```

### Step 2.2: Backend Python Virtual Environment
```powershell
# 1. Create virtual environment inside backend/
python -m venv backend/venv

# 2. Activate virtual environment
.\backend\venv\Scripts\activate

# 3. Install backend dependencies (pure local, no psycopg2 or cloud SDKs)
pip install -r backend/requirements.txt
```

### Step 2.3: Frontend Node Dependencies
```powershell
# Install all monorepo workspace dependencies
npm install
```

### Step 2.4: Database Initialization & Teacher Account Creation
SATARK includes a local CLI tool for managing accounts and the database:
```powershell
# Initialize central SQLite database schema (WAL mode)
python -m backend.app.cli init-db

# Provision the first Teacher Administrator account
python -m backend.app.cli create-teacher --email "prof.satark@local.lan" --name "Prof. Robert Langdon" --password "TeacherSecure123!"
```

### Step 2.5: Windows Firewall Configuration
Permit incoming HTTP and WebSocket traffic on ports 8000 (Backend), 5174 (Teacher Portal), and 5173 (Student Portal) for Private LAN networks:
```powershell
# Run the automated firewall setup script (requires Administrator privileges)
powershell -ExecutionPolicy Bypass -File .\scripts\setup-firewall.ps1
```

---

## 3. Starting SATARK on Local LAN

Run the unified one-command startup script:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-satark.ps1
```

### Expected Startup Output:
```
============================================================
 SATARK -- SMART CLASSROOM LOCAL LAN SYSTEM STARTUP
 Team: WEBFARM (Fully Local LAN, Offline, No Docker)
============================================================
[1/6] Detecting active host LAN IPv4 address...
      Detected Host IP: 10.106.76.105
[2/6] Verifying software prerequisites...
[3/6] Checking port availability...
[4/6] Verifying central SQLite database...
[SUCCESS] Database schema initialized.
      Database initialized at: data/satark.db (WAL mode active)
[5/6] Launching SATARK local services...
      Starting FastAPI Backend on 0.0.0.0:8000...
      Starting Teacher Portal on 0.0.0.0:5174...
      Starting Student Portal on 0.0.0.0:5173...
[6/6] Verifying local service health...

============================================================
                 SATARK LOCAL NETWORK
============================================================
  Teacher Portal    : http://10.106.76.105:5174
  Student Portal    : http://10.106.76.105:5173
  Backend API       : http://10.106.76.105:8000
  API Documentation : http://10.106.76.105:8000/docs
------------------------------------------------------------
  Local Host Access :
  Teacher Portal    : http://localhost:5174
  Student Portal    : http://localhost:5173
  Backend API       : http://localhost:8000
============================================================
[STATUS: PASS] All services running and responsive!
```

---

## 4. Connecting Client Devices

### 4.1 From Student Laptops
1. Connect laptop to the same Wi-Fi SSID or mobile hotspot as the host PC.
2. Open Google Chrome or Microsoft Edge.
3. Browse to the Student Portal URL:
   ```
   http://<HOST_IP>:5173  (e.g., http://10.106.76.105:5173)
   ```
4. If connecting for the first time, click **"Configure LAN Server Connection"** on the login screen if the host IP needs adjustment, and tap **"Test Connection"** to verify green status.
5. Log in with candidate credentials or register a new student account locally.

### 4.2 From Teacher Laptops / Tablets
1. Connect to the same Wi-Fi SSID.
2. Browse to the Teacher Portal URL:
   ```
   http://<HOST_IP>:5174  (e.g., http://10.106.76.105:5174)
   ```
3. Sign in using the provisioned teacher credentials.

### 4.3 Running Desktop Monitoring Agent on Student Workstation
1. In Student Portal, go to `/student/dashboard` and click **"Pair Desktop Agent"**.
2. Note the single-use 6-character code (e.g. `8K2NP4`).
3. Run the desktop agent:
   ```powershell
   python -m desktop-agent.src.main --host <HOST_IP> --port 8000 --pairing-code 8K2NP4
   ```
4. The workstation attestation will immediately register on the Teacher's Device Grid.

---

## 5. Daily Operation & Management Commands

| Action | Command (PowerShell) | Description |
| :--- | :--- | :--- |
| **Start System** | `.\scripts\start-satark.ps1` | Launches backend, teacher portal, student portal, and performs health checks |
| **Check Status** | `.\scripts\status-satark.ps1` | Inspects running processes, ports, API health, and SQLite table counts |
| **Test LAN** | `.\scripts\check-lan.ps1` | Diagnoses host network adapters, firewall, and storage directories |
| **Stop System** | `.\scripts\stop-satark.ps1` | Cleanly stops all SATARK processes without terminating other apps |
| **Backup DB** | `python -m backend.app.cli backup-db` | Creates a timestamped backup copy in `data/backups/` |
| **Reset Password** | `python -m backend.app.cli reset-password --email <email>` | Resets user password securely offline |

