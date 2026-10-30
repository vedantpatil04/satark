import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/api/auth";
import { GraduationCap, KeyRound, Loader2, Lock, Mail, User, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const TeacherLogin: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [provisioningKey, setProvisioningKey] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isRegister) {
        // Teacher registration requires the server-side provisioning key
        if (!provisioningKey.trim()) {
          toast.error("Teacher provisioning key is required");
          setLoading(false);
          return;
        }

        await authApi.register({
          email,
          password,
          full_name: fullName,
          role: "teacher",
          teacher_provisioning_key: provisioningKey.trim(),
        });

        toast.success("Teacher account created! Logging in...");
      }

      // Perform login
      const tokenRes = await authApi.login({ email, password });
      if (tokenRes.user.role !== "teacher") {
        toast.error("Unauthorized: This credential belongs to a Student account. Please log in through the Student Portal.");
        setLoading(false);
        return;
      }

      login(tokenRes.access_token, tokenRes.user);
      toast.success(`Welcome back, ${tokenRes.user.full_name}`);
      navigate("/teacher/dashboard", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Authentication failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative">
      <div className="max-w-md w-full glass-card p-8 border border-border/50 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary mb-3">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Teacher & Proctor Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRegister ? "Register an instructor administrative profile" : "Authenticate to access classroom proctoring"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <div className="relative mt-1">
                <User className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Prof. Alan Turing"
                  className="pl-9"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="email">Institutional Email</Label>
            <div className="relative mt-1">
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
              <Input
                id="email"
                type="email"
                placeholder="teacher@classroom.edu"
                className="pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative mt-1">
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="key">Teacher Provisioning Key</Label>
                <span className="text-[10px] text-primary flex items-center gap-1 font-semibold">
                  <ShieldCheck className="w-3 h-3" /> Server-Verified
                </span>
              </div>
              <div className="relative mt-1">
                <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                <Input
                  id="key"
                  type="password"
                  placeholder="Enter instructor security key"
                  className="pl-9"
                  value={provisioningKey}
                  onChange={(e) => setProvisioningKey(e.target.value)}
                  required
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Default key for test environment: <code className="text-primary font-mono">TEACHER-SECURE-KEY-2026</code>
              </p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full mt-2 font-bold py-5">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
              </span>
            ) : isRegister ? (
              "Provision Teacher Account"
            ) : (
              "Access Teacher Dashboard"
            )}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-border/40 text-center flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-primary hover:underline font-semibold"
          >
            {isRegister ? "Already registered? Sign In" : "Need to provision a Teacher account?"}
          </button>
          <Link to="/student/login" className="text-xs text-muted-foreground hover:text-foreground">
            Are you a student? Switch to <span className="underline">Student Portal</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
