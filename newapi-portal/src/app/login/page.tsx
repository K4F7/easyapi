"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, ArrowRight, Mail, KeyRound } from "lucide-react";
import { Suspense, useState } from "react";

import { DuckLogo } from "@/components/duck-logo";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeAuthError } from "@/lib/client/auth-error";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error"),
  );
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate() {
    let valid = true;
    if (!identifier.trim()) {
      setIdentifierError("请输入邮箱或用户名");
      valid = false;
    } else {
      setIdentifierError(null);
    }
    if (!password) {
      setPasswordError("请输入密码");
      valid = false;
    } else {
      setPasswordError(null);
    }
    return valid;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          sanitizeAuthError(data.error?.code, data.error?.message, "登录失败，请稍后再试。"),
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50/50 dark:bg-zinc-950 px-4 py-10 selection:bg-primary/20">
      <PageTransition className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 p-3 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
            <DuckLogo className="h-8 w-8" />
          </div>
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              欢迎回来
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              登录以管理你的令牌和用量
            </p>
          </div>
        </div>

        <Card className="border-zinc-200/80 dark:border-zinc-800/80 shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {error && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-[13px] text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-500/20 animate-in fade-in zoom-in-95">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="identifier" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    邮箱或用户名
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      id="identifier"
                      type="text"
                      autoComplete="username"
                      placeholder="name@example.com"
                      aria-invalid={identifierError ? true : undefined}
                      value={identifier}
                      className={cn(
                        "pl-9 h-11 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary/20",
                        identifierError && "border-red-500/50 focus-visible:ring-red-500/20"
                      )}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        if (identifierError) setIdentifierError(null);
                      }}
                    />
                  </div>
                  {identifierError && (
                    <p className="mt-1 text-[11px] font-medium text-destructive/90 animate-in fade-in slide-in-from-top-1">
                      {identifierError}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      密码
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                    >
                      忘记密码？
                    </Link>
                  </div>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="请输入密码"
                      className={cn(
                        "pl-9 pr-10 h-11 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary/20",
                        passwordError && "border-red-500/50 focus-visible:ring-red-500/20"
                      )}
                      aria-invalid={passwordError ? true : undefined}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordError) setPasswordError(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors focus-visible:outline-none"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="mt-1 text-[11px] font-medium text-destructive/90 animate-in fade-in slide-in-from-top-1">
                      {passwordError}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-1">
                <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                  />
                  保持登录状态
                </label>
              </div>

              <Button
                className="w-full h-11 mt-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-medium transition-all group"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    登录
                    <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
          还没账户？{" "}
          <Link
            className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline underline-offset-4"
            href="/register"
          >
            免费创建账户
          </Link>
        </p>
      </PageTransition>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
