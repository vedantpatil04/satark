# SATARK — Local HTTPS & TLS Certificate Guide

**Team**: WEBFARM  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Purpose**: Local SSL/TLS encryption, secure camera/mic permissions, and browser trust across LAN

---

## 1. When is Local HTTPS Needed?

By default, SATARK works over standard `HTTP` across your local Wi-Fi network. However, modern desktop browsers (Chrome, Edge) and Android WebViews apply strict security policies:
1. **Screen Sharing (`getDisplayMedia`)**: Permitted on `localhost` and origins served over `https://`. While Chrome allows screen sharing on HTTP on localhost, remote LAN student laptops often require either HTTPS or adding the host LAN IP to Chrome's insecure origins flag.
2. **Camera Access (Focus Mode & Gaze Tracking)**: WebRTC camera feeds require a secure origin context.

SATARK provides an automated script to generate a private Local Root Certificate Authority (CA) and server TLS certificates with Subject Alternative Names (SAN) for all local addresses.

---

## 2. Generating Local Certificates

Run the bundled certificate generation script:
```powershell
python scripts/generate-certificates.py
```

### What this creates:
- `certs/satark-root-ca.crt`: Private Local Root CA certificate (valid for 10 years).
- `certs/satark-root-ca.key`: Local Root CA private key.
- `certs/satark-server.crt`: Local Server certificate signed by the root CA.
- `certs/satark-server.key`: Server private key.

### Configured Subject Alternative Names (SAN):
- Host LAN IPv4: `10.106.76.105`
- Loopback: `127.0.0.1`
- Hostnames: `localhost`, `satark.local`

---

## 3. Trusting the Root CA on Windows Host & Client Laptops

To prevent browser security warnings ("Your connection is not private"), install `satark-root-ca.crt` into the Windows Trusted Root Certification Authorities store:

### Automated PowerShell Command (Run as Administrator):
```powershell
certutil -addstore -f "Root" "certs\satark-root-ca.crt"
```

### Manual GUI Method:
1. Double-click `certs/satark-root-ca.crt`.
2. Click **"Install Certificate..."**.
3. Select **"Local Machine"** and click **Next**.
4. Choose **"Place all certificates in the following store"** -> Browse -> select **"Trusted Root Certification Authorities"**.
5. Click **OK**, **Next**, and **Finish**.
6. Restart your browser.

---

## 4. Trusting the Certificate on Android Client Devices

1. Copy `certs/satark-root-ca.crt` to the Android device (via USB cable, Bluetooth, or local file download).
2. On Android: Open **Settings -> Security -> More Security Settings -> Encryption & Credentials**.
3. Tap **"Install a certificate"** -> **"CA certificate"**.
4. Confirm the warning ("Install anyway") and select `satark-root-ca.crt`.
5. Enter your phone's lock screen PIN to complete installation.

---

## 5. Alternative: Chrome Insecure Origins Flag (No Certificate Required)

If you prefer not to install custom CA certificates on evaluation devices, you can allow HTTP access with full media permissions via Chrome's experimental flag:

1. In Chrome/Edge on the student laptop, navigate to:
   ```
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```
2. Enable the flag.
3. In the text box, enter your host IP and ports:
   ```
   http://10.106.76.105:8000, http://10.106.76.105:5174, http://10.106.76.105:5173
   ```
4. Click **"Relaunch"**.
5. All camera, microphone, and screen sharing APIs are now fully unlocked over plain HTTP!

