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
      setSessions(Array.isArray(data) ? data : []);
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
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Loading cohort study sessions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Focus Mode Oversight</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Observe active student study sessions, study targets, and break compliance across classrooms.
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-3xl bg-white border border-stone-200/80 p-12 text-center text-stone-400">
          <Target className="w-10 h-10 mx-auto mb-2 opacity-30 text-stone-400" />
          <h3 className="text-sm font-bold text-slate-800">No Active Focus Sessions</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            Students will appear here whenever they launch a study session in their Candidate Portal.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sessions.map((fs) => {
            const focusMinutes = Math.floor(fs.actual_focus_seconds / 60);
            const breakMinutes = Math.floor(fs.actual_break_seconds / 60);
            const isActive = fs.status === "active";

            return (
              <div
                key={fs.id}
                className="rounded-2xl bg-white border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all"
              >
                <div>
                  <div className="flex items-start justify-between pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {isActive ? <Play className="w-5 h-5 text-emerald-600" /> : <Pause className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 truncate max-w-[180px]">
                          {fs.goal_title}
                        </h4>
                        <span className="text-[10px] text-stone-400 block font-mono">
                          Candidate: {fs.student_id ? `${fs.student_id.substring(0, 10)}...` : "Active"}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] capitalize font-bold ${
                        isActive
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-stone-100 text-stone-600 border-stone-200"
                      }`}
                    >
                      {fs.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[#FFFDF9] border border-stone-100 text-center my-3 text-xs">
                    <div>
                      <span className="text-[10px] text-stone-400 block font-medium">Target</span>
                      <span className="font-bold text-slate-800">{fs.planned_duration_minutes}m</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block font-medium">Focus</span>
                      <span className="font-bold text-[#D97706]">{focusMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block font-medium">Break</span>
                      <span className="font-bold text-stone-500">{breakMinutes}m</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-400 pt-2 border-t border-stone-100">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Started: {new Date(fs.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="font-semibold text-emerald-600">Vision Sentinel</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default TeacherFocus;
