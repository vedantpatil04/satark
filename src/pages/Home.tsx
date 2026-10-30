import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { GraduationCap, Sparkles, ShieldCheck, Target, ArrowRight, Settings, CheckCircle2, AlertCircle, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/api/client";

export const Home: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem("custom_api_server") || "http://10.106.76.105:8000");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === "teacher") {
        navigate("/teacher/dashboard", { replace: true });
      } else {
        navigate("/student/dashboard", { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleTestAndSave = async () => {
    setTestStatus("testing");
    setTestMsg("Connecting to server...");
    try {
      const cleanUrl = serverUrl.replace(/\/+$/, "");
      const res = await fetch(`${cleanUrl}/health`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("custom_api_server", cleanUrl);
        setTestStatus("success");
        setTestMsg(`Connected to ${data.service || "Smart Classroom"}!`);
      } else {
        setTestStatus("error");
        setTestMsg(`Server returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestMsg(`Connection failed: ${err.message || "Network unreachable"}`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background ambient gradient */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top right Server Settings Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Server Config</span>
        </Button>
      </div>

      {/* Expandable Server Settings Card */}
      {settingsOpen && (
        <div className="w-full max-w-md p-4 mb-6 rounded-xl glass-card border border-primary/30 relative z-20 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Backend Server Endpoint (LAN / Mobile)</span>
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://10.106.76.105:8000"
              className="text-xs h-9 bg-background/50 font-mono"
            />
            <Button
              size="sm"
              onClick={handleTestAndSave}
              disabled={testStatus === "testing"}
              className="h-9 px-3 text-xs whitespace-nowrap font-medium"
            >
              {testStatus === "testing" ? "Testing..." : "Save & Test"}
            </Button>
          </div>
          {testStatus !== "idle" && (
            <div className={`mt-2.5 flex items-center gap-1.5 text-xs ${testStatus === "success" ? "text-emerald-500" : testStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {testStatus === "success" && <CheckCircle2 className="w-3.5 h-3.5" />}
              {testStatus === "error" && <AlertCircle className="w-3.5 h-3.5" />}
              <span>{testMsg}</span>
            </div>
          )}
        </div>
      )}

      <div className="max-w-4xl w-full text-center mb-12 relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
          <ShieldCheck className="w-4 h-4" /> Smart Classroom OS
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4">
          Exam Integrity & <span className="gradient-text">Focus Management</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          One unified platform delivering proctored academic assessments and self-directed Pomodoro productivity for modern classrooms.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl w-full relative z-10">
        {/* Teacher Card */}
        <div className="glass-card p-8 flex flex-col justify-between hover:border-primary/50 transition-all group">
          <div>
            <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary mb-6 group-hover:scale-105 transition-transform">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Teacher Portal</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Create classrooms, design integrity-enforced examinations, supervise device telemetry, and review explainable alerts.
            </p>
          </div>
          <Link to="/teacher/login" className="w-full">
            <Button className="w-full flex items-center justify-center gap-2 font-bold py-6">
              Instructor Sign In <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* Student Card */}
        <div className="glass-card p-8 flex flex-col justify-between hover:border-emerald-500/50 transition-all group">
          <div>
            <div className="p-3 w-fit rounded-xl bg-emerald-500/10 text-emerald-500 mb-6 group-hover:scale-105 transition-transform">
              <Target className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Student Portal</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Join course cohorts with enrollment PINs, sit for active exams, and utilize the distraction-free Pomodoro focus timer.
            </p>
          </div>
          <Link to="/student/login" className="w-full">
            <Button variant="secondary" className="w-full flex items-center justify-center gap-2 font-bold py-6 hover:bg-emerald-500/10 hover:text-emerald-500">
              Student Sign In <Sparkles className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      <footer className="mt-16 text-xs text-muted-foreground text-center relative z-10">
        Phase 1.3 Certified Foundation • Dual Portal Architecture • Ethical & Visible Monitoring Only
      </footer>
    </div>
  );
};
