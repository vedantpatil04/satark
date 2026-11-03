#!/usr/bin/env bash
# ==============================================================================
# SATARK macOS Host & Client HTTPS/Hostname Configuration Script
# Configures trusted local HTTPS, WSS, and satark.test resolution on macOS.
# ==============================================================================

set -e

HOST_IP="${1:-10.10.15.241}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "============================================================"
echo "  SATARK macOS Setup (satark.test & Trusted HTTPS/WSS)"
echo "============================================================"
echo "Target SATARK Server IP: $HOST_IP"
echo ""

# 1. Check for root privileges
if [ "$EUID" -ne 0 ]; then
    echo "[*] Requesting sudo privileges to install Root CA and update /etc/hosts..."
    exec sudo bash "$0" "$HOST_IP"
fi

# 2. Locate ca.crt
CA_PATH=""
CANDIDATE_PATHS=(
    "$REPO_ROOT/certs/ca.crt"
    "$SCRIPT_DIR/ca.crt"
    "./certs/ca.crt"
    "./ca.crt"
)

for p in "${CANDIDATE_PATHS[@]}"; do
    if [ -f "$p" ]; then
        CA_PATH="$(cd "$(dirname "$p")" && pwd)/$(basename "$p")"
        break
    fi
done

if [ -z "$CA_PATH" ]; then
    if [ -f "$REPO_ROOT/scripts/generate_certs.py" ]; then
        echo "[1/3] Generating local PKI certificates..."
        python3 "$REPO_ROOT/scripts/generate_certs.py"
        CA_PATH="$REPO_ROOT/certs/ca.crt"
    else
        echo "[!] Error: Root CA certificate 'ca.crt' not found!"
        echo "    Please copy certs/ca.crt to this directory."
        exit 1
    fi
fi

# 3. Install Root CA into macOS System Keychain
echo "[1/3] Installing Root CA into macOS System Keychain ($CA_PATH)..."
security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_PATH"
echo "      Root CA successfully trusted in macOS Keychain."

# 4. Configure /etc/hosts
echo "[2/3] Mapping $HOST_IP to satark.test in /etc/hosts..."
if grep -q "satark.test" /etc/hosts; then
    echo "      satark.test is already present in /etc/hosts. Updating entry..."
    sed -i '' "/satark\.test/d" /etc/hosts
    sed -i '' "/satark\.local/d" /etc/hosts
fi

cat <<EOF >> /etc/hosts

# SATARK Smart Classroom Integrity Platform LAN Mapping
$HOST_IP       satark.test
$HOST_IP       satark.local
EOF
echo "      Added '$HOST_IP  satark.test' to /etc/hosts."

# 5. Flush macOS DNS Cache
echo "[3/3] Flushing macOS DNS cache..."
dscacheutil -flushcache || true
killall -HUP mDNSResponder 2>/dev/null || true
echo "      DNS cache flushed."

echo ""
echo "============================================================"
echo "  macOS Setup Complete!"
echo "============================================================"
echo "You can now open Google Chrome, Safari, or Microsoft Edge:"
echo "  - Student Portal:  https://satark.test:5173"
echo "  - Teacher Portal:  https://satark.test:5174"
echo "  - Backend API:     https://satark.test:8000"
echo "  - API Docs:        https://satark.test:8000/docs"
echo ""
echo "IMPORTANT MACOS PERMISSION REQUIREMENTS:"
echo "  1. Camera: System Settings > Privacy & Security > Camera (Enable your browser)"
echo "  2. Screen Recording: System Settings > Privacy & Security > Screen & System Audio Recording (Enable your browser)"
echo "  3. Restart browser after granting permissions."
echo "============================================================"

