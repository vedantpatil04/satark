import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { focusApi, FocusSession } from "@/api/focus";
import {
  History,
  Clock,
  Flame,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Brain,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const StudentHistory: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await focusApi.getHistory();
        setSessions(data);
      } catch (err: any) {
        toast.error("Failed to load focus history");
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading session analytics...</p>
      </div>
    );
  }

  // Calculate high-level stats
  const totalFocusSeconds = sessions.reduce((acc, s) => acc + (s.actual_focus_seconds || 0), 0);
  const totalFocusHours = (totalFocusSeconds / 3600).toFixed(1);
  const completedCount = sessions.filter((s) => s.status === "completed").length;
  const completionRate = sessions.length > 0 ? Math.round((completedCount / sessions.length) * 100) : 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Focus & Productivity History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Personal analytics, completed Pomodoros, and study stamina records.
          </p>
        </div>

        <Button
          onClick={() => navigate("/student/focus")}
          className="gap-2 font-bold shadow-md shadow-primary/20 shrink-0"
        >
          <Brain className="w-4 h-4" />
          Start New Session
        </Button>
      </div>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card border-border/40">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Focus Time
              </p>
              <h3 className="text-2xl font-bold font-mono text-foreground mt-1">
                {totalFocusHours} <span className="text-sm font-sans font-normal text-muted-foreground">hrs</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Across all sessions</p>
            </div>
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Completed Sessions
              </p>
              <h3 className="text-2xl font-bold font-mono text-foreground mt-1">
                {completedCount} <span className="text-sm font-sans font-normal text-muted-foreground">/ {sessions.length}</span>
              </h3>
              <p className="text-[11px] text-emerald-500 font-medium mt-0.5">
                {completionRate}% completion rate
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Active Streak
              </p>
              <h3 className="text-2xl font-bold font-mono text-amber-500 mt-1">
                {completedCount > 0 ? "🔥 In Rhythm" : "0 Days"}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Consecutive focus discipline</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
              <Flame className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Productivity Index
              </p>
              <h3 className="text-2xl font-bold font-mono text-purple-400 mt-1">
                {sessions.length > 0 ? "Top 10%" : "New"}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Vision-verified attention</p>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History Ledger List */}
      <Card className="glass-card border-border/40">
        <CardHeader className="p-6 border-b border-border/30">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Session Log Ledger
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Detailed record of planned duration, actual focus time, and notes.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {sessions.length} Recorded
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {sessions.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Brain className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <h4 className="text-base font-bold text-foreground">No Focus Sessions Recorded Yet</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Start your first Pomodoro study session in Focus Mode to begin building your streak.
              </p>
              <Button
                size="sm"
                onClick={() => navigate("/student/focus")}
                className="mt-2 font-bold gap-1.5"
              >
                Launch Focus Mode <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const focusMins = Math.round((session.actual_focus_seconds || 0) / 60);
                const breakMins = Math.round((session.actual_break_seconds || 0) / 60);
                const isCompleted = session.status === "completed";

                return (
                  <div
                    key={session.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border/30 hover:border-border/60 transition-colors bg-muted/10 gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-foreground">{session.goal_title}</h4>
                        <Badge
                          variant={isCompleted ? "default" : "secondary"}
                          className={`text-[10px] uppercase font-bold ${
                            isCompleted ? "bg-emerald-600/80 hover:bg-emerald-600" : ""
                          }`}
                        >
                          {session.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(session.started_at).toLocaleDateString()} at{" "}
                          {new Date(session.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span>Planned: {session.planned_duration_minutes}m</span>
                        {session.notes && <span className="italic">"{session.notes}"</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0 sm:text-right">
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                          Focus
                        </p>
                        <p className="text-base font-bold font-mono text-emerald-400">
                          {focusMins} min
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                          Break
                        </p>
                        <p className="text-base font-bold font-mono text-muted-foreground">
                          {breakMins} min
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
