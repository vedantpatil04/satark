import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/api/auth";
import { Sparkles, Loader2, Lock, Mail, User, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const StudentLogin: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

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
        // Public registration always assigns role "student"
        await authApi.register({
          email,
          password,
          full_name: fullName,
          role: "student",
        });

        toast.success("Student account registered successfully! Logging in...");
      }

      // Log in
      const tokenRes = await authApi.login({ email, password });
      if (tokenRes.user.role !== "student") {
        toast.info("Notice: Instructor account detected. Redirecting to Teacher Portal.");
        login(tokenRes.access_token, tokenRes.user);
        navigate("/teacher/dashboard", { replace: true });
        return;
      }

      login(tokenRes.access_token, tokenRes.user);
      toast.success(`Welcome, ${tokenRes.user.full_name}!`);
      navigate("/student/dashboard", { replace: true });
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
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 mb-3">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Student Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRegister ? "Create your candidate profile to join classes and sit for exams" : "Sign in to access your classes, focus sessions, and exams"}
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
                  placeholder="e.g. Alice Smith"
                  className="pl-9"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="email">Student Email Address</Label>
            <div className="relative mt-1">
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
              <Input
                id="email"
                type="email"
                placeholder="alice@student.edu"
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

          <Button type="submit" disabled={loading} className="w-full mt-2 font-bold py-5 bg-emerald-600 hover:bg-emerald-700">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
              </span>
            ) : isRegister ? (
              "Complete Student Registration"
            ) : (
              "Sign In to Student Workstation"
            )}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-border/40 text-center flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-primary hover:underline font-semibold"
          >
            {isRegister ? "Already registered? Sign In" : "Need to create a Student account?"}
          </button>
          <Link to="/teacher/login" className="text-xs text-muted-foreground hover:text-foreground">
            Instructor or Proctor? Switch to <span className="underline">Teacher Portal</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
