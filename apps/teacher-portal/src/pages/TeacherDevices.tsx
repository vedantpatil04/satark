import React, { useEffect, useState } from "react";
import { devicesApi, Device } from "@/api/devices";
import { Monitor, RefreshCw, Cpu, Clock, Loader2, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const TeacherDevices: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDevices = async () => {
    try {
      const data = await devicesApi.list();
      setDevices(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to fetch registered devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    const interval = setInterval(loadDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Scanning registered hardware devices...</p>
      </div>
    );
  }

  const onlineCount = devices.filter((d) => d.status === "connected").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Hardware & Device Grid
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Real-time liveness, OS adapters, and agent connectivity status for student testing machines.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Badge variant="outline" className="px-3 py-1.5 text-xs font-semibold gap-1.5 bg-white border-stone-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {onlineCount} Online • {devices.length - onlineCount} Offline
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={loadDevices}
            className="gap-1.5 text-xs rounded-xl border-stone-200 bg-white hover:bg-stone-50 h-8"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-3xl bg-white border border-stone-200/80 p-12 text-center text-stone-400">
          <Monitor className="w-10 h-10 mx-auto mb-2 opacity-30 text-stone-400" />
          <h3 className="text-sm font-bold text-slate-800">No Registered Workstations</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            Desktop agents on candidate PCs register hardware fingerprints upon session initialization.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {devices.map((d) => {
            const isConnected = d.status === "connected";
            return (
              <div
                key={d.id}
                className={`rounded-2xl bg-white border transition-all p-5 shadow-xs flex flex-col justify-between ${
                  isConnected
                    ? "border-emerald-300 ring-1 ring-emerald-300/30"
                    : "border-stone-200/80 opacity-80"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isConnected ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 truncate">
                          {d.hostname || "Workstation PC"}
                        </h4>
                        <span className="text-[10px] text-stone-400 uppercase font-mono tracking-wider">
                          {d.os_type} {d.os_version || ""}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] capitalize font-bold ${
                        isConnected
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-stone-100 text-stone-500 border-stone-200"
                      }`}
                    >
                      {isConnected ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                      {d.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 py-3 text-xs text-stone-500">
                    <div className="flex justify-between">
                      <span>Hardware UUID:</span>
                      <span className="font-mono text-slate-800">{d.hardware_uuid?.substring(0, 12)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Agent Platform:</span>
                      <span className="font-semibold capitalize text-slate-800">{d.os_type}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Last Ping: {d.last_seen_at ? new Date(d.last_seen_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Active"}
                  </span>
                  <span className="font-semibold text-emerald-600">Encrypted</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default TeacherDevices;
