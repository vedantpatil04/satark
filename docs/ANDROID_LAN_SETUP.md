# SATARK — Android Mobile LAN Setup & Pairing Guide

**Team**: WEBFARM  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**App Type**: Capacitor Native Android Application (`app-debug.apk`)  
**Target OS**: Android 7.0+ (API 24 to 34+)

---

## 1. Overview

The SATARK mobile client provides a native Android container built with Capacitor that wraps the student portal frontend. It allows students to take exams, join classrooms, participate in Focus Mode study blocks, and submit answers directly from Android tablets or smartphones over the local Wi-Fi network without requiring an active internet connection.

---

## 2. APK Artifact & Build Information

- **Pre-compiled Debug APK**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Application Package ID**: `edu.smartclassroom.app`
- **Application Name**: `SATARK`
- **Binary Size**: ~16.6 MB

### Rebuilding the APK (If modifications are made):
```powershell
# 1. Build optimized web assets
npm run build:student

# 2. Sync into Android native container
npx cap sync android

# 3. Compile Debug APK with Gradle (PowerShell)
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="C:\Users\Vedant  Patil\AppData\Local\Android\Sdk"
cd android
.\gradlew.bat assembleDebug
```

---

## 3. Cleartext LAN Traffic Configuration

Because the host computer runs an internal HTTP server across the local Wi-Fi network, cleartext network traffic is explicitly enabled in `android/app/src/main/AndroidManifest.xml`:
```xml
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:supportsRtl="true"
    android:theme="@style/AppTheme"
    android:usesCleartextTraffic="true">
```
This permits seamless communication with `http://10.106.76.105:8000` without requiring commercial SSL certificates.

---

## 4. Connecting Android Device to Local Host

### Step 1: Connect to Same Wi-Fi
Ensure the Android device is connected to the same Wi-Fi SSID or mobile phone hotspot as the Windows host computer.

### Step 2: Install APK
Transfer `app-debug.apk` to the Android device via USB cable, Google Drive/nearby share, or direct browser download from the host computer (`http://<HOST_IP>:8000/docs`). Tap the APK to install (enable "Install unknown apps" if prompted).

### Step 3: Configure Server Address
1. Launch the **SATARK** app on the Android phone.
2. On the login screen, tap **"Configure LAN Server Connection"** (or the gear icon).
3. Enter the Host IP (e.g. `10.106.76.105`) and Port `8000`.
4. Tap **"Test Connection"**. When the status turns green (**CONNECTED**), tap **"Save & Apply"**.
5. The Android app is now connected to the host database!

### Alternative: Pair via QR Code
1. Open the Teacher Portal or Student Portal login screen on any laptop.
2. Tap **"Configure LAN Server Connection"**.
3. Point the Android phone's camera at the displayed QR Code.
4. Tap the link to open the portal directly in mobile Chrome!

