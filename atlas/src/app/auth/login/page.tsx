"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message?.toLowerCase().includes("email not confirmed")) {
        toast.error(
          "Please confirm your email first, or disable email confirmation in Supabase Dashboard → Auth → Settings.",
        );
      } else if (
        error.message?.toLowerCase().includes("invalid login credentials")
      ) {
        toast.error("Wrong email or password.");
      } else {
        toast.error(error.message);
      }
      setLoading(false);
      return;
    }

    if (!data.user) {
      toast.error("Login failed. Please try again.");
      setLoading(false);
      return;
    }

    // Role comes directly from the JWT — no DB query, never fails
    const role = (data.user.user_metadata?.role as string) || "student";

    toast.success("Welcome back!");

    const next = searchParams.get("next");
    if (next && (next.startsWith("/teacher") || next.startsWith("/student"))) {
      router.push(next);
    } else {
      router.push(
        role === "teacher" ? "/teacher/dashboard" : "/student/dashboard",
      );
    }
    router.refresh();
  };

  return (
    <div className="atlas-card p-8">
      <form onSubmit={handleLogin} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-atlas-subtle mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            required
            autoComplete="email"
            className="atlas-input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-atlas-subtle mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="atlas-input"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full justify-center py-3.5"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Signing in...
            </span>
          ) : (
            "Sign In"
          )}
        </button>
      </form>
      <p className="text-center text-atlas-subtle text-sm mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/auth/signup"
          className="text-atlas-blue hover:underline font-medium"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-atlas-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* back link added for easy navigation */}
      <Link
        href="/"
        className="absolute top-4 left-4 z-50 p-2 text-atlas-blue hover:underline flex items-center gap-1"
      >
        <span aria-hidden>←</span>
        <span className="sr-only">Home</span>
        <span className="hidden sm:inline">Home</span>
      </Link>

      <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-atlas-blue/10 rounded-full blur-[80px]" />
      <div className="absolute bottom-1/4 right-1/3 w-48 h-48 bg-atlas-purple/8 rounded-full blur-[60px]" />

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-atlas-blue to-atlas-cyan flex items-center justify-center shadow-glow-blue">
              <span className="text-white font-display font-bold text-2xl">
                A
              </span>
            </div>
            <span className="font-display font-bold text-3xl text-atlas-text">
              Atlas
            </span>
          </Link>
          <h1 className="font-display font-bold text-2xl text-atlas-text">
            Welcome back
          </h1>
          <p className="text-atlas-subtle mt-1">Sign in to your account</p>
        </div>

        <Suspense
          fallback={
            <div className="atlas-card p-8 text-center">
              <div className="w-8 h-8 border-2 border-atlas-blue/30 border-t-atlas-blue rounded-full animate-spin mx-auto" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
