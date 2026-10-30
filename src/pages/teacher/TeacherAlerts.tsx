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
      setAlerts(data);
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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading audit records and alerts...</p>
      </div>
    );
  }

  const unreviewedCount = alerts.filter((a) => !a.is_acknowledged).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Integrity Alert Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit-grade record of candidate workstation policy breaches, window switches, and multi-display detections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant={filterPendingOnly ? "default" : "outline"}
            onClick={() => setFilterPendingOnly(!filterPendingOnly)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Filter className="w-3.5 h-3.5" />
            {filterPendingOnly ? "Showing Pending" : "Show Pending Only"} ({unreviewedCount})
          </Button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card className="glass-card text-center py-16">
          <CardContent className="flex flex-col items-center gap-3">
            <CheckCircle className="w-12 h-12 text-emerald-500 opacity-60" />
            <h3 className="text-lg font-bold text-foreground">Clean Session Record</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              No integrity alerts or policy violations recorded in the system.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alt) => {
            const isCritical = alt.severity === "critical";
            const isHigh = alt.severity === "high";

            return (
              <Card
                key={alt.id}
                className={`glass-card transition-all ${
                  alt.is_acknowledged
                    ? "border-border/30 opacity-70"
                    : isCritical
                    ? "border-destructive/60 bg-destructive/5"
                    : "border-amber-500/40 bg-amber-500/5"
                }`}
              >
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        isCritical
                          ? "bg-destructive/15 text-destructive"
                          : isHigh
                          ? "bg-amber-500/15 text-amber-500"
                          : "bg-blue-500/15 text-blue-500"
                      }`}
                    >
                      <AlertTriangle className="w-6 h-6" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-base text-foreground">{alt.description}</h4>
                        <Badge
                          variant={isCritical ? "destructive" : "secondary"}
                          className="text-[10px] uppercase font-bold tracking-wider"
                        >
                          {alt.severity}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {alt.alert_type}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>Time: {new Date(alt.created_at).toLocaleString()}</span>
                        <span>Device: <span className="font-mono">{alt.device_id.substring(0, 10)}...</span></span>
                        <span>Exam Session: <span className="font-mono">{alt.session_id.substring(0, 8)}...</span></span>
                      </div>

                      {/* Evidence Summary Preview */}
                      {alt.evidence_summary && (
                        <div className="p-2.5 rounded bg-muted/50 border border-border/40 text-xs font-mono text-muted-foreground mt-2 max-w-2xl">
                          Details: {JSON.stringify(alt.evidence_summary.details || alt.evidence_summary)}
                        </div>
                      )}

                      {alt.is_acknowledged && alt.proctor_notes && (
                        <p className="text-xs text-emerald-500 font-medium mt-1">
                          ✓ Acknowledged by proctor: "{alt.proctor_notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Acknowledge Action Box */}
                  {!alt.is_acknowledged && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 md:min-w-[280px]">
                      <Input
                        placeholder="Resolution note (optional)"
                        value={notes[alt.id] || ""}
                        onChange={(e) => setNotes({ ...notes, [alt.id]: e.target.value })}
                        className="text-xs h-9"
                      />
                      <Button
                        size="sm"
                        disabled={acknowledgingId === alt.id}
                        onClick={() => handleAcknowledge(alt.id)}
                        className="font-bold text-xs shrink-0"
                      >
                        {acknowledgingId === alt.id ? "Saving..." : "Acknowledge"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
