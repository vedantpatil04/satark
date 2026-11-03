import React, { useState, useEffect } from "react";
import { Server, Wifi, CheckCircle2, AlertCircle, RefreshCw, QrCode, Shield, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import QRCode from "qrcode";

interface ServerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [hostIp, setHostIp] = useState("192.168.1.100");
  const [port, setPort] = useState("8000");
  const [useHttps, setUseHttps] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("custom_api_server");
      if (stored) {
        try {
          const url = new URL(stored.startsWith("http") ? stored : `http://${stored}`);
          setHostIp(url.hostname);
          setPort(url.port || "8000");
          setUseHttps(url.protocol === "https:");
        } catch {
          // Keep default
        }
      } else if (window.location.hostname) {
        setHostIp(window.location.hostname);
        setUseHttps(window.location.protocol === "https:");
      }
    }
  }, [isOpen]);

  const previewUrl = `${useHttps ? "https" : "http"}://${hostIp.trim()}:${port.trim()}/api/v1`;

  // Generate QR Code for this connection string
  useEffect(() => {
    if (isOpen && hostIp) {
      QRCode.toDataURL(previewUrl, { width: 180, margin: 2 }, (err, url) => {
        if (!err && url) {
          setQrCodeUrl(url);
        }
      });
    }
  }, [isOpen, previewUrl, hostIp]);

  const testConnection = async () => {
    setTestStatus("testing");
    setTestMessage("Testing reachability...");
    const healthUrl = `${useHttps ? "https" : "http"}://${hostIp.trim()}:${port.trim()}/api/v1/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setTestStatus("success");
        setTestMessage(`Connected to SATARK (${data.service || "Healthy"})`);
        toast.success("Host reachability confirmed!");
      } else {
        setTestStatus("error");
        setTestMessage(`Server returned HTTP ${res.status}`);
        toast.error("Connected but health check returned error.");
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestMessage(err.name === "AbortError" ? "Connection timed out" : "Could not reach host on LAN");
      toast.error("Host unreachable. Check IP, Wi-Fi network, and Windows firewall.");
    }
  };

  const saveConfiguration = () => {
    if (!hostIp.trim()) {
      toast.error("Please enter a valid Host IPv4 address");
      return;
    }
    const cleanUrl = `${useHttps ? "https" : "http"}://${hostIp.trim()}:${port.trim()}/api/v1`;
    localStorage.setItem("custom_api_server", cleanUrl);
    toast.success(`Server configured: ${cleanUrl}`);
    if (onSaved) onSaved();
    onClose();
  };

  const resetToDefault = () => {
    localStorage.removeItem("custom_api_server");
    toast.info("Reset to default auto-discovery server URL");
    if (onSaved) onSaved();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
        <div className="p-5 border-b border-border flex items-center justify-between bg-card/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">SATARK Host Connection</h3>
              <p className="text-xs text-muted-foreground">Configure LAN server IP for this workstation or mobile device</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="hostIp" className="text-xs font-semibold">SATARK Host IPv4 Address</Label>
              <div className="relative">
                <Wifi className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                <Input
                  id="hostIp"
                  type="text"
                  placeholder="e.g. 192.168.1.100"
                  value={hostIp}
                  onChange={(e) => {
                    setHostIp(e.target.value);
                    setTestStatus("idle");
                  }}
                  className="pl-9 font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="port" className="text-xs font-semibold">Port</Label>
              <Input
                id="port"
                type="text"
                placeholder="8000"
                value={port}
                onChange={(e) => {
                  setPort(e.target.value);
                  setTestStatus("idle");
                }}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/80">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-xs font-semibold text-foreground">Use Secure HTTPS / WSS</div>
                <div className="text-[11px] text-muted-foreground">Required for screen sharing across LAN browsers</div>
              </div>
            </div>
            <input
              type="checkbox"
              id="httpsToggle"
              checked={useHttps}
              onChange={(e) => {
                setUseHttps(e.target.checked);
                setTestStatus("idle");
              }}
              className="w-4 h-4 rounded text-primary border-border focus:ring-primary"
            />
          </div>

          {/* Target Preview */}
          <div className="p-3 rounded-xl bg-muted/30 border border-border text-xs font-mono break-all">
            <span className="text-muted-foreground">Target API: </span>
            <span className="text-foreground font-semibold">{previewUrl}</span>
          </div>

          {/* Test Status Feedback */}
          {testStatus !== "idle" && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2.5 border ${
                testStatus === "testing"
                  ? "bg-muted/40 border-border text-muted-foreground"
                  : testStatus === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-500"
              }`}
            >
              {testStatus === "testing" && <RefreshCw className="w-4 h-4 animate-spin shrink-0" />}
              {testStatus === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {testStatus === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{testMessage}</span>
            </div>
          )}

          {/* QR Code Container for Easy Mobile Pairing */}
          {qrCodeUrl && (
            <div className="flex items-center gap-4 p-3 rounded-xl bg-card border border-border">
              <img src={qrCodeUrl} alt="Server QR Code" className="w-20 h-20 rounded-lg border border-border bg-white p-1" />
              <div className="text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-foreground">
                  <QrCode className="w-3.5 h-3.5 text-primary" /> Mobile Device Sync
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Scan this QR code from an Android device or copy this address into the mobile app server settings.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 px-6 border-t border-border bg-card/60 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetToDefault}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset to Default
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={testStatus === "testing"}
              className="text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testStatus === "testing" ? "animate-spin" : ""}`} />
              Test Connection
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveConfiguration}
              className="text-xs gap-1.5 font-semibold bg-primary text-primary-foreground"
            >
              <Save className="w-3.5 h-3.5" />
              Save & Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

