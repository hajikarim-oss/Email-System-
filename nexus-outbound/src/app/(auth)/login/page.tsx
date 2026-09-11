"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, ArrowRight } from "lucide-react";
import Image from "next/image";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/inbox";

  const [email, setEmail] = useState("haji.karim@theboredmonkey.com");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-[400px]">
      <div className="rounded-2xl bg-white p-10 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)]">
        {/* Orange top accent line */}
        <div className="absolute left-0 right-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r from-[#f97316] via-[#fb923c] to-[#f97316]" />

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 overflow-hidden rounded-xl">
            <Image
              src="/tbm-logo-black.png"
              alt="TheBoredMonkey"
              width={200}
              height={60}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Outreach System
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            Sign in to your workspace
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-5 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-[13px] font-medium text-red-600">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Email Address
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] py-3.5 pl-12 pr-4 text-[14px] text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#f97316] focus:bg-white focus:ring-2 focus:ring-[#f97316]/10"
                placeholder="you@company.com"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] py-3.5 pl-12 pr-4 text-[14px] text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#f97316] focus:bg-white focus:ring-2 focus:ring-[#f97316]/10"
                placeholder="Enter your password"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#f97316] px-6 py-3.5 text-[14px] font-bold text-white shadow-lg shadow-orange-500/20 transition-all duration-200 hover:bg-[#ea580c] hover:shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-[12px] text-slate-400">
            Powered by <span className="font-bold text-[#f97316]">TheBoredMonkey</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#f0f4f8] via-[#e8eef6] to-[#f5f3ff] p-4">
      {/* Subtle geometric background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Soft gradient orbs */}
        <div className="absolute -left-32 top-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-orange-100/40 to-transparent blur-3xl" />
        <div className="absolute -right-32 bottom-1/4 h-[400px] w-[400px] rounded-full bg-gradient-to-br from-blue-100/30 to-transparent blur-3xl" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
