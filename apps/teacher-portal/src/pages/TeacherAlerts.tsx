import React, { useEffect, useState } from "react";
import { alertsApi, Alert } from "@/api/alerts";
import { ShieldAlert, AlertTriangle, CheckCircle, Check, Loader2, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const TeacherAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPendingOnly, setFilterPendingOnly] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ [key: string]: string }>({});

  const loadAlerts = async () => {
    try {
      const data = await alertsApi.list(undefined, filterPendingOnly ? false : undefined);
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load integrity alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [filterPendingOnly]);

  const handleAcknowledge = async (id: string) => {
    setAcknowledgingId(id);
    try {
      const note = notes[id] || "Reviewed by proctor";
      await alertsApi.acknowledge(id, note);
      toast.success("Alert acknowledged and recorded in audit log");
      loadAlerts();
    } catch (err: any) {
      toast.error(err.message || "Failed to acknowledge alert");
    } finally {
      setAcknowledgingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Loading audit records and alerts...</p>
      </div>
    );
  }

  const unreviewedCount = alerts.filter((a) => !a.is_acknowledged).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Integrity Alert Center
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Audit-grade record of candidate workstation policy breaches, window switches, and multi-display detections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFilterPendingOnly(!filterPendingOnly)}
            className={`gap-1.5 text-xs font-semibold rounded-xl h-8.5 ${
              filterPendingOnly
                ? "bg-[#D97706] text-white border-[#D97706] hover:bg-[#B45309]"
                : "border-stone-200 bg-white hover:bg-stone-50 text-slate-700"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {filterPendingOnly ? "Showing Pending" : "Show Pending Only"} ({unreviewedCount})
          </Button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-3xl bg-white border border-stone-200/80 p-12 text-center text-stone-400">
          <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
          <h3 className="text-sm font-bold text-slate-800">Clean Session Record</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            Zero policy breaches recorded. All candidate sessions conform to proctoring policy.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {alerts.map((alt) => {
            const isCritical = alt.severity === "critical";

            return (
              <div
                key={alt.id}
                className={`rounded-2xl border p-5 transition-all bg-white shadow-xs ${
                  alt.is_acknowledged
                    ? "border-stone-200/60 opacity-80"
                    : isCritical
                    ? "border-rose-300 bg-rose-50/20"
                    : "border-amber-300 bg-amber-50/20"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isCritical
                          ? "bg-rose-100 text-rose-600"
                          : "bg-[#FFF2E5] text-[#D97706]"
                      }`}
                    >
                      <AlertTriangle className="w-5 h-5" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-slate-900">{alt.description}</h4>
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase font-bold tracking-wider ${
                            isCritical
                              ? "bg-rose-50 text-rose-700 border-rose-300"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                          }`}
                        >
                          {alt.severity}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] uppercase font-mono bg-white text-stone-600">
                          {alt.alert_type}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-stone-500 flex-wrap">
                        <span>Time: {new Date(alt.created_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</span>
                        <span>Device: <span className="font-mono text-slate-700">{alt.device_id ? `${alt.device_id.substring(0, 8)}...` : "Browser"}</span></span>
                        <span>Session: <span className="font-mono text-slate-700">{alt.session_id ? `${alt.session_id.substring(0, 8)}...` : "General"}</span></span>
                      </div>

                      {alt.is_acknowledged && alt.proctor_notes && (
                        <p className="text-xs text-emerald-700 font-medium mt-1">
                          ✓ Acknowledged: "{alt.proctor_notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {!alt.is_acknowledged && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 md:min-w-[280px]">
                      <Input
                        placeholder="Resolution note (optional)"
                        value={notes[alt.id] || ""}
                        onChange={(e) => setNotes({ ...notes, [alt.id]: e.target.value })}
                        className="text-xs h-8.5 rounded-xl bg-stone-50 border-stone-200"
                      />
                      <Button
                        size="sm"
                        disabled={acknowledgingId === alt.id}
                        onClick={() => handleAcknowledge(alt.id)}
                        className="font-bold text-xs shrink-0 rounded-xl h-8.5 bg-[#D97706] hover:bg-[#B45309] text-white shadow-xs"
                      >
                        {acknowledgingId === alt.id ? "Saving..." : "Acknowledge"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default TeacherAlerts;
