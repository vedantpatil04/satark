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
      setDevices(data);
    } catch {
      toast.error("Failed to fetch registered devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    const interval = setInterval(loadDevices, 5000); // 5s heartbeat refresh
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Scanning registered hardware devices...</p>
      </div>
    );
  }

  const onlineCount = devices.filter((d) => d.status === "connected").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Hardware & Device Grid</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time liveness, OS adapters, and agent connectivity status for testing machines.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1.5 text-xs font-semibold gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {onlineCount} Online • {devices.length - onlineCount} Offline
          </Badge>
          <Button size="sm" variant="outline" onClick={loadDevices} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {devices.length === 0 ? (
        <Card className="glass-card text-center py-12">
          <CardContent className="flex flex-col items-center gap-3">
            <Monitor className="w-10 h-10 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-bold text-foreground">No Registered Workstations</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Desktop agents on student PCs register hardware fingerprints upon session initialization.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((d) => {
            const isConnected = d.status === "connected";
            return (
              <Card
                key={d.id}
                className={`glass-card transition-all ${
                  isConnected ? "border-emerald-500/30" : "border-border/40 opacity-75"
                }`}
              >
                <CardHeader className="pb-3 flex flex-row items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${isConnected ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-foreground">
                        {d.hostname || "Workstation"}
                      </CardTitle>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        {d.os_type} {d.os_version || ""}
                      </span>
                    </div>
                  </div>
                  <Badge variant={isConnected ? "default" : "secondary"} className="text-[10px] capitalize font-bold">
                    {isConnected ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                    {d.status}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-3 pt-0 text-xs text-muted-foreground">
                  <div className="p-2.5 rounded-lg bg-muted/40 font-mono text-[11px] truncate">
                    UUID: {d.hardware_uuid}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px]">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5" /> Agent v{d.agent_version}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {d.last_heartbeat_at ? new Date(d.last_heartbeat_at).toLocaleTimeString() : "Never"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
