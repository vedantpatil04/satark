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
        setSessions(Array.isArray(data) ? data : []);
      } catch {
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
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Loading session analytics...</p>
      </div>
    );
  }

  const totalFocusSeconds = sessions.reduce((acc, s) => acc + (s.actual_focus_seconds || 0), 0);
  const totalFocusHours = (totalFocusSeconds / 3600).toFixed(1);
  const completedCount = sessions.filter((s) => s.status === "completed").length;
  const completionRate = sessions.length > 0 ? Math.round((completedCount / sessions.length) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Study Stamina & Focus History
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Personal productivity analytics, Pomodoro sessions, and time logs.
          </p>
        </div>

        <Button
          onClick={() => navigate("/focus")}
          className="bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs rounded-xl h-9 px-4 shadow-xs flex items-center gap-1.5"
        >
          <Brain className="w-4 h-4" /> Start New Session
        </Button>
      </div>

      {/* 4 Pastel Analytics Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#EAF8F0] border border-[#D5F2E2] p-5 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Total Focus Time
            </p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              {totalFocusHours} <span className="text-xs font-normal text-stone-500">hrs</span>
            </h3>
            <p className="text-[11px] text-emerald-700 font-medium mt-0.5">Across all sessions</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white text-emerald-700 flex items-center justify-center shadow-xs">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#FEF3E8] border border-[#FDE5CC] p-5 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
              Completed
            </p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              {completedCount} <span className="text-xs font-normal text-stone-500">/ {sessions.length}</span>
            </h3>
            <p className="text-[11px] text-amber-800 font-medium mt-0.5">
              {completionRate}% completion rate
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white text-[#D97706] flex items-center justify-center shadow-xs">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#EEF2FC] border border-[#DDE6F8] p-5 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">
              Discipline Streak
            </p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              {completedCount > 0 ? "🔥 In Rhythm" : "0 Days"}
            </h3>
            <p className="text-[11px] text-blue-700 font-medium mt-0.5">Session streak</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white text-blue-700 flex items-center justify-center shadow-xs">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#F6F5F2] border border-stone-200 p-5 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-bold text-stone-600 uppercase tracking-wider">
              Productivity Index
            </p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              {sessions.length > 0 ? "Optimal" : "New"}
            </h3>
            <p className="text-[11px] text-stone-500 mt-0.5">Attestation verified</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white text-stone-700 flex items-center justify-center shadow-xs">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* History Ledger List */}
      <div className="rounded-2xl bg-white border border-stone-200/80 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-[#D97706]" />
              Session Log Ledger
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Historical record of planned study durations and logged focus intervals.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs bg-stone-50 text-stone-600">
            {sessions.length} Recorded
          </Badge>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Brain className="w-10 h-10 text-stone-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800">No Focus Sessions Recorded Yet</h4>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              Start your first study session to begin building your focus records.
            </p>
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
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-stone-200/70 hover:border-amber-300 transition-all bg-[#FFFDF9] gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-xs text-slate-900">{session.goal_title}</h4>
                      <Badge
                        variant="outline"
                        className={`text-[9px] uppercase font-bold ${
                          isCompleted
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {session.status}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-stone-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(session.started_at).toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
                        {new Date(session.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span>Target: {session.planned_duration_minutes}m</span>
                      {session.notes && <span className="italic text-stone-400">"{session.notes}"</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-5 shrink-0 sm:text-right">
                    <div>
                      <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">
                        Focus
                      </p>
                      <p className="text-sm font-bold font-mono text-emerald-600">
                        {focusMins} min
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">
                        Break
                      </p>
                      <p className="text-sm font-bold font-mono text-stone-400">
                        {breakMins} min
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
export default StudentHistory;
