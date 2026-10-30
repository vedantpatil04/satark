"""
SATARK — Local LAN SSL/TLS Certificate Generator
Generates a Local Root Certificate Authority (CA) and Server Certificate
with Subject Alternative Names (SAN) for localhost, 127.0.0.1, and active LAN IP.
"""

import os
import sys
import socket
import datetime
from pathlib import Path
import ipaddress

from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CERTS_DIR = PROJECT_ROOT / "certs"


def get_active_lan_ip() -> str:
    """Finds active LAN IPv4 address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Connecting to a public UDP address doesn't send packets but binds the interface
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def generate_certificates(custom_ip: str = None):
    CERTS_DIR.mkdir(parents=True, exist_ok=True)
    lan_ip = custom_ip or get_active_lan_ip()

    print(f"[*] Detected Host LAN IP: {lan_ip}")
    print("[*] Generating Local SATARK Root CA...")

    # 1. Generate Root CA Key & Certificate
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "SATARK Local Development Root CA"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "WEBFARM"),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "SATARK Security"),
    ])

    now = datetime.datetime.now(datetime.timezone.utc)
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))  # 10 years
        .add_extension(
            x509.BasicConstraints(ca=True, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .sign(ca_key, hashes.SHA256())
    )

    ca_cert_path = CERTS_DIR / "satark-root-ca.crt"
    ca_key_path = CERTS_DIR / "satark-root-ca.key"

    with open(ca_cert_path, "wb") as f:
        f.write(ca_cert.public_bytes(serialization.Encoding.PEM))
    with open(ca_key_path, "wb") as f:
        f.write(
            ca_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )

    print(f"[+] Root CA saved to: {ca_cert_path}")

    # 2. Generate Server Certificate
    print("[*] Generating Server Certificate with SAN...")
    server_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    server_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, lan_ip),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "WEBFARM"),
    ])

    san_list = [
        x509.DNSName("localhost"),
        x509.DNSName("satark.local"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ]
    try:
        san_list.append(x509.IPAddress(ipaddress.IPv4Address(lan_ip)))
    except Exception:
        san_list.append(x509.DNSName(lan_ip))

    server_cert = (
        x509.CertificateBuilder()
        .subject_name(server_name)
        .issuer_name(ca_name)
        .public_key(server_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=825))  # ~2 years
        .add_extension(
            x509.SubjectAlternativeName(san_list),
            critical=False,
        )
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    server_cert_path = CERTS_DIR / "satark-server.crt"
    server_key_path = CERTS_DIR / "satark-server.key"

    with open(server_cert_path, "wb") as f:
        f.write(server_cert.public_bytes(serialization.Encoding.PEM))
    with open(server_key_path, "wb") as f:
        f.write(
            server_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )

    print(f"[+] Server Certificate saved to: {server_cert_path}")
    print(f"[+] Server Private Key saved to: {server_key_path}")
    print("\nTo trust this CA on this Windows host, run:")
    print(f'  certutil -addstore -f "Root" "{ca_cert_path}"')


if __name__ == "__main__":
    ip_arg = sys.argv[1] if len(sys.argv) > 1 else None
    generate_certificates(ip_arg)

