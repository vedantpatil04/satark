import React, { useEffect, useState } from "react";
import { focusApi, FocusSession } from "@/api/focus";
import { Target, Clock, CheckCircle2, Pause, Play, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const TeacherFocus: React.FC = () => {
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFocusSessions = async () => {
    try {
      const data = await focusApi.list();
      setSessions(data);
    } catch {
      toast.error("Failed to fetch focus sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFocusSessions();
    const interval = setInterval(loadFocusSessions, 8000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading cohort study sessions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Focus Mode Oversight</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Observe active student Pomodoro study sessions, study targets, and break compliance across classrooms.
        </p>
      </div>

      {sessions.length === 0 ? (
        <Card className="glass-card text-center py-12">
          <CardContent className="flex flex-col items-center gap-3">
            <Target className="w-10 h-10 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-bold text-foreground">No Active Focus Sessions</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Students will appear here whenever they launch a Pomodoro study block in their Student Portal.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((fs) => {
            const focusMinutes = Math.floor(fs.actual_focus_seconds / 60);
            const breakMinutes = Math.floor(fs.actual_break_seconds / 60);
            const isActive = fs.status === "active";

            return (
              <Card key={fs.id} className="glass-card border border-border/40">
                <CardHeader className="pb-3 flex flex-row items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      {isActive ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-foreground truncate max-w-[180px]">
                        {fs.goal_title}
                      </CardTitle>
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        Student: {fs.student_id.substring(0, 10)}...
                      </span>
                    </div>
                  </div>
                  <Badge variant={isActive ? "default" : "secondary"} className="text-[10px] capitalize font-bold">
                    {fs.status}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-muted/40 text-center">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Target</span>
                      <span className="font-bold text-foreground">{fs.planned_duration_minutes}m</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Focus Log</span>
                      <span className="font-bold text-primary">{focusMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Break</span>
                      <span className="font-bold text-amber-500">{breakMinutes}m</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
                    <Clock className="w-3.5 h-3.5" /> Started: {new Date(fs.started_at).toLocaleTimeString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
