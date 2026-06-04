"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import { Loader2, ArrowRight, Mail, KeyRound, Ticket } from "lucide-react";

import { DuckLogo } from "@/components/duck-logo";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeAuthError } from "@/lib/client/auth-error";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

type FieldErrors = {
  email?: string;
  verificationCode?: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-[11px] font-medium text-destructive/90 animate-in fade-in slide-in-from-top-1">
      {message}
    </p>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get("inviteCode") ?? searchParams.get("ref") ?? "";

  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const emailValid = EMAIL_RE.test(email);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendVerificationCode() {
    if (sendingCode || cooldown > 0) return;

    if (!emailValid) {
      setFieldErrors((prev) => ({ ...prev, email: "请输入有效的邮箱地址" }));
      return;
    }

    setError(null);
    setNotice(null);
    setFieldErrors((prev) => ({ ...prev, email: undefined }));
    setSendingCode(true);

    try {
      const res = await fetch("/api/auth/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          sanitizeAuthError(
            data.error?.code,
            data.error?.message,
            "验证码发送失败，请稍后再试。",
          ),
        );
        return;
      }

      setNotice("验证码已发送，请查收邮箱（含垃圾箱）。");
      startCooldown();
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setSendingCode(false);
    }
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!email) next.email = "请输入邮箱";
    else if (!emailValid) next.email = "请输入有效的邮箱地址";

    if (!verificationCode.trim()) next.verificationCode = "请输入收到的验证码";

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!validate()) return;

    setLoading(true);
    try {
      // Generate a secure random password since we removed the password fields
      const generatedPassword = Math.random().toString(36).slice(-10) + "Aa1@";
      
      const body: Record<string, string> = { 
        email, 
        password: generatedPassword,
        verificationCode: verificationCode.trim() 
      };
      
      const effectiveInviteCode = inviteCode.trim() || refCode.trim();
      if (effectiveInviteCode) {
        body.inviteCode = effectiveInviteCode;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          sanitizeAuthError(
            data.error?.code,
            data.error?.message,
            "注册失败，请稍后再试。",
          ),
        );
        return;
      }

      if (res.status === 202) {
        setNotice(
          data.data?.message ?? "注册成功！请完成邮箱验证后再登录。",
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

  const sendDisabled = sendingCode || cooldown > 0 || !emailValid;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50/50 dark:bg-zinc-950 px-4 py-10 selection:bg-primary/20">
      <PageTransition className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 p-3 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
            <DuckLogo className="h-8 w-8" />
          </div>
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              创建账户
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              极简注册，一步到位
            </p>
          </div>
        </div>

        <Card className="border-zinc-200/80 dark:border-zinc-800/80 shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-[13px] text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-500/20 animate-in fade-in zoom-in-95">
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-[13px] text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20 animate-in fade-in zoom-in-95">
                  {notice}
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    邮箱地址
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      value={email}
                      aria-invalid={!!fieldErrors.email}
                      className={cn(
                        "pl-9 h-11 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary/20",
                        fieldErrors.email && "border-red-500/50 focus-visible:ring-red-500/20"
                      )}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email)
                          setFieldErrors((p) => ({ ...p, email: undefined }));
                      }}
                    />
                  </div>
                  <FieldError message={fieldErrors.email} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="verificationCode" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    验证码
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <Input
                        id="verificationCode"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="6位验证码"
                        value={verificationCode}
                        aria-invalid={!!fieldErrors.verificationCode}
                        className={cn(
                          "pl-9 h-11 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary/20",
                          fieldErrors.verificationCode && "border-red-500/50 focus-visible:ring-red-500/20"
                        )}
                        onChange={(e) => {
                          setVerificationCode(e.target.value);
                          if (fieldErrors.verificationCode)
                            setFieldErrors((p) => ({ ...p, verificationCode: undefined }));
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 px-4 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shrink-0 min-w-[100px]"
                      disabled={sendDisabled}
                      onClick={handleSendVerificationCode}
                    >
                      {sendingCode
                        ? "发送中…"
                        : cooldown > 0
                          ? `${cooldown}s`
                          : "获取验证码"}
                    </Button>
                  </div>
                  <FieldError message={fieldErrors.verificationCode} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="inviteCode" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    邀请码 <span className="text-zinc-400 font-normal">(可选)</span>
                  </Label>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      id="inviteCode"
                      placeholder="如有邀请码可填写"
                      value={inviteCode}
                      className="pl-9 h-11 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary/20"
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
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
                    完成注册
                    <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
          已有账户？{" "}
          <Link
            className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline underline-offset-4"
            href="/login"
          >
            直接登录
          </Link>
        </p>
      </PageTransition>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
