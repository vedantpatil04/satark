import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/api/auth";
import { GraduationCap, Loader2, Lock, Mail, User, Server, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ServerConfigModal } from "@/components/ServerConfigModal";

export const StudentLogin: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isRegister) {
        await authApi.register({
          email,
          password,
          full_name: fullName,
          role: "student",
        });

        toast.success("Student account registered successfully! Logging in...");
      }

      const tokenRes = await authApi.login({ email, password });
      if (tokenRes.user.role !== "student") {
        toast.info("Notice: Instructor account detected. Redirecting to Faculty Portal.");
        login(tokenRes.access_token, tokenRes.user);
        navigate("/teacher/dashboard", { replace: true });
        return;
      }

      login(tokenRes.access_token, tokenRes.user);
      toast.success(`Welcome, ${tokenRes.user.full_name}!`);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Authentication failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F5F2] flex items-center justify-center p-4 antialiased font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200/80 p-8 sm:p-10 shadow-[0_8px_30px_rgba(0,0,0,0.04)] relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white flex items-center justify-center shadow-md shadow-amber-500/20 mb-3.5">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">SATARK Candidate Portal</h1>
          <p className="text-xs text-stone-500 mt-1 max-w-xs">
            {isRegister ? "Register a student profile to sit for proctored exams" : "Sign in to take exams and manage courses"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <Label htmlFor="fullName" className="text-xs font-semibold text-slate-700">Full Name</Label>
              <div className="relative mt-1">
                <User className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="e.g. Sila Demiyana"
                  className="pl-9 rounded-xl h-10 text-xs"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="email" className="text-xs font-semibold text-slate-700">Student Email</Label>
            <div className="relative mt-1">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <Input
                id="email"
                type="email"
                placeholder="student@university.edu"
                className="pl-9 rounded-xl h-10 text-xs"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password" className="text-xs font-semibold text-slate-700">Password</Label>
            <div className="relative mt-1">
              <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="pl-9 rounded-xl h-10 text-xs"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2 font-bold text-xs bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl h-10 shadow-xs"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
              </span>
            ) : isRegister ? (
              "Create Student Account"
            ) : (
              "Sign In to Workstation"
            )}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-stone-100 text-center flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-[#D97706] hover:underline font-semibold"
          >
            {isRegister ? "Already registered? Sign In" : "New student candidate? Create an Account"}
          </button>
          <button
            type="button"
            onClick={() => setShowServerConfig(true)}
            className="text-xs text-stone-400 hover:text-stone-700 mt-1 inline-flex items-center justify-center gap-1.5"
          >
            <Server className="w-3.5 h-3.5" /> Configure LAN Server Connection
          </button>
        </div>
      </div>

      <ServerConfigModal
        isOpen={showServerConfig}
        onClose={() => setShowServerConfig(false)}
      />
    </div>
  );
};
export default StudentLogin;
