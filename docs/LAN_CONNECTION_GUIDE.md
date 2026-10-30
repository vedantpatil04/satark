# SATARK — LAN Network & Connectivity Guide

**Team**: WEBFARM  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Scope**: Multi-Device LAN & Offline Hotspot Deployment

---

## 1. Network Topologies

SATARK is engineered to operate seamlessly across three zero-internet local network configurations:

```
[Option A: Dedicated Wi-Fi Router (Recommended for Classrooms)]
   +-------------------------------------------------------+
   |            Wi-Fi Router (No Internet Required)        |
   |                   Subnet: 192.168.1.0/24              |
   +-------------------------------------------------------+
        |                 |                  |           |
  Host Windows PC    Teacher Laptop    5 Student Laptops  Android Phone
 (192.168.1.100)    (192.168.1.101)   (192.168.1.102..) (192.168.1.150)

[Option B: Mobile Phone Hotspot (Ideal for Demos & Labs)]
   +-------------------------------------------------------+
   |       Mobile Hotspot (Mobile Data Turned OFF)         |
   |                   Subnet: 192.168.43.0/24             |
   +-------------------------------------------------------+
        |                 |                  |           |
  Host Windows PC    Teacher Laptop    5 Student Laptops  Android Phone

[Option C: Single-Machine Localhost Evaluation]
  All services run on 127.0.0.1 (Ports 8000, 5174, 5173).
```

---

## 2. Critical Network Setting: Disable AP / Client Isolation

### What is AP Isolation?
Many modern Wi-Fi routers and smartphone hotspots enable a security feature called **"Access Point (AP) Isolation"** or **"Client Isolation"**. When enabled, connected wireless devices can reach the internet but **cannot talk to each other**. 

Because SATARK relies on direct LAN communication between student devices, teacher browsers, and the host machine:
- **Router Settings**: Log into your router's administration interface (`http://192.168.1.1` or `http://192.168.0.1`), navigate to **Wireless Settings -> Advanced**, and ensure **"Enable AP Isolation"** or **"Client Isolation"** is turned **OFF**.
- **Phone Hotspots**: Most Android hotspots disable AP isolation by default, allowing direct device-to-device routing. If running into connection issues on iOS hotspots, use an Android phone hotspot or dedicated Wi-Fi router.

---

## 3. Detecting Host IPv4 Address

On the Windows host machine, find the active LAN IPv4 address:
```powershell
# Method 1: Using SATARK LAN Diagnostic Tool
powershell -ExecutionPolicy Bypass -File .\scripts\check-lan.ps1

# Method 2: Standard Windows Command
ipconfig
```
Look for the active adapter (e.g. `Wireless LAN adapter Wi-Fi`):
```
IPv4 Address. . . . . . . . . . . : 10.106.76.105
Subnet Mask . . . . . . . . . . . : 255.255.240.0
Default Gateway . . . . . . . . . : 10.106.64.1
```

---

## 4. In-App LAN Server Configuration Modal

Both the **Teacher Portal** and **Student Portal** include an in-app **"Configure LAN Server Connection"** button right on their login screens:

### Features:
1. **Host IP & Port Input**: Defaults to auto-detected host address or allows manual entry (e.g. `10.106.76.105` and port `8000`).
2. **Protocol Toggle**: Switch between `HTTP` and `HTTPS`.
3. **Live Health Probe**: Clicking **"Test Connection"** executes a live probe against `http://<IP>:8000/api/v1/health` and displays instant green/red status with response latency.
4. **Local Persistence**: Saves your custom configuration in browser `localStorage` (`satark_server_config`), ensuring the app remembers the server address across page reloads.
5. **QR Code Generation**: Displays a scannable QR code of the student URL (`http://<HOST_IP>:5173`) allowing Android devices to pair instantly using a camera app.

---

## 5. Firewall & Port Diagnostic Checklist

If client devices cannot load the portal or API:

| Check | Remediation |
| :--- | :--- |
| **Windows Firewall** | Run `scripts/setup-firewall.ps1` as Administrator to permit TCP ports `8000`, `5174`, `5173` on Private profiles. |
| **Network Profile** | Ensure Windows network profile is set to **Private** (Settings -> Network & Internet -> Properties -> Private network). |
| **Ping Test** | From a student laptop, test reachability: `ping <HOST_IP>`. If requests time out, verify AP isolation and firewall settings. |
| **Port Test** | From a student terminal: `curl http://<HOST_IP>:8000/api/v1/health`. Should return `{"status":"healthy","database":"sqlite"}`. |

