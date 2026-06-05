"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, ArrowRight, Mail, KeyRound } from "lucide-react";
import { Suspense, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
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
  const [error, setError] = useState<string | null>(searchParams.get("error"));
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
          sanitizeAuthError(
            data.error?.code,
            data.error?.message,
            "登录失败，请稍后再试。",
          ),
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
    <AuthShell title="欢迎回来" description="登录以管理你的令牌和用量">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && (
          <div className="animate-in fade-in zoom-in-95 rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-[13px] leading-5 text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label
              htmlFor="identifier"
              className="text-xs font-semibold text-foreground"
            >
              邮箱或用户名
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                placeholder="name@example.com"
                aria-invalid={identifierError ? true : undefined}
                value={identifier}
                className={cn(
                  "h-11 border-border bg-background/70 pl-9 focus-visible:border-primary focus-visible:ring-ring",
                  identifierError &&
                    "border-red-500/50 focus-visible:ring-red-500/20",
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
              <Label
                htmlFor="password"
                className="text-xs font-semibold text-foreground"
              >
                密码
              </Label>
              <Link
                href="/forgot-password"
                className="rounded-md text-[11px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                忘记密码？
              </Link>
            </div>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="请输入密码"
                className={cn(
                  "h-11 border-border bg-background/70 pl-9 pr-10 focus-visible:border-primary focus-visible:ring-ring",
                  passwordError &&
                    "border-red-500/50 focus-visible:ring-red-500/20",
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
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-border text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            保持登录状态
          </label>
        </div>

        <Button
          className="group mt-2 h-11 w-full rounded-2xl font-semibold shadow-sm shadow-primary/20 transition-[background-color,box-shadow,transform] duration-200 hover:shadow-md hover:shadow-primary/25"
          type="submit"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              登录
              <ArrowRight className="ml-2 h-4 w-4 opacity-70 transition-transform duration-200 group-hover:translate-x-1" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        还没账户？{" "}
        <Link
          className="rounded-md font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href="/register"
        >
          免费创建账户
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
