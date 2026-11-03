"""
Generates a Local Root Certificate Authority (CA) and Server SSL Certificate
covering satark.local, *.satark.local, localhost, 127.0.0.1, and current LAN IPs.
"""
import os
import sys
import datetime
import socket
import ipaddress
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

def get_local_ips():
    ips = {"127.0.0.1", "192.168.137.1"}
    # Any IP passed on command line
    for arg in sys.argv[1:]:
        try:
            ipaddress.ip_address(arg)
            ips.add(arg)
        except ValueError:
            pass

    try:
        # Connect to a dummy external address to find default route IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    try:
        # Also resolve local hostname
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None):
            ip = info[4][0]
            if ":" not in ip:  # IPv4
                ips.add(ip)
    except Exception:
        pass
    
    # Known host IP from ipconfig
    ips.add("10.10.15.241")
    return list(ips)

def generate_pki(output_dir="certs"):
    os.makedirs(output_dir, exist_ok=True)
    ca_key_path = os.path.join(output_dir, "ca.key")
    ca_cert_path = os.path.join(output_dir, "ca.crt")
    server_key_path = os.path.join(output_dir, "key.pem")
    server_cert_path = os.path.join(output_dir, "cert.pem")

    print("[*] Generating SATARK Local Root CA...")
    # 1. Generate Root CA Private Key
    ca_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=4096,
    )

    ca_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "SATARK Local Root CA"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SATARK"),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "Smart Classroom Integrity Platform"),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
    ])

    now = datetime.datetime.now(datetime.timezone.utc)
    # Valid for 10 years
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
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
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    with open(ca_key_path, "wb") as f:
        f.write(ca_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    with open(ca_cert_path, "wb") as f:
        f.write(ca_cert.public_bytes(serialization.Encoding.PEM))

    print(f"[+] Root CA Certificate created: {ca_cert_path}")

    print("[*] Generating SATARK Server Certificate for satark.test & satark.local...")
    # 2. Generate Server Private Key
    server_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    server_subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "satark.test"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SATARK"),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "Exam Monitoring Engine"),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
    ])

    # Build SANs covering satark.test, satark.local, localhost, and all LAN IPs
    san_list = [
        x509.DNSName("satark.test"),
        x509.DNSName("*.satark.test"),
        x509.DNSName("satark.local"),
        x509.DNSName("*.satark.local"),
        x509.DNSName("localhost"),
    ]

    for ip_str in get_local_ips():
        try:
            san_list.append(x509.IPAddress(ipaddress.ip_address(ip_str)))
            print(f"    - Included IP SAN: {ip_str}")
        except Exception as e:
            print(f"    - Could not add IP SAN {ip_str}: {e}")

    server_cert = (
        x509.CertificateBuilder()
        .subject_name(server_subject)
        .issuer_name(ca_name)
        .public_key(server_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=1095))  # 3 years
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=True,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([
                ExtendedKeyUsageOID.SERVER_AUTH,
                ExtendedKeyUsageOID.CLIENT_AUTH,
            ]),
            critical=False,
        )
        .add_extension(
            x509.SubjectAlternativeName(san_list),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    with open(server_key_path, "wb") as f:
        f.write(server_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    # Also bundle fullchain into cert.pem (Server Cert + CA Cert)
    with open(server_cert_path, "wb") as f:
        f.write(server_cert.public_bytes(serialization.Encoding.PEM))
        f.write(b"\n")
        f.write(ca_cert.public_bytes(serialization.Encoding.PEM))

    print(f"[+] Server Certificate created: {server_cert_path}")
    print(f"[+] Server Private Key created: {server_key_path}")
    print("[+] PKI generation successfully completed!")

if __name__ == "__main__":
    generate_pki()

