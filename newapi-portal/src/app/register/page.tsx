"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense, type ReactNode } from "react";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Ticket,
  type LucideIcon,
} from "lucide-react";

import { DuckLogo } from "@/components/duck-logo";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeAuthError } from "@/lib/client/auth-error";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

type FieldErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  verificationCode?: string;
  acceptedTerms?: string;
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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

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

    if (!password) next.password = "请设置登录密码";
    else if (password.length < 8) next.password = "密码至少 8 位";

    if (!confirmPassword) next.confirmPassword = "请再次输入密码";
    else if (confirmPassword !== password) {
      next.confirmPassword = "两次输入的密码不一致";
    }

    if (!verificationCode.trim()) next.verificationCode = "请输入收到的验证码";
    if (!acceptedTerms) next.acceptedTerms = "请先阅读并同意服务条款与隐私政策";

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
      const body: {
        email: string;
        password: string;
        verificationCode: string;
        acceptedTerms: true;
        inviteCode?: string;
      } = {
        email,
        password,
        verificationCode: verificationCode.trim(),
        acceptedTerms: true,
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
        setNotice(data.data?.message ?? "注册成功！请完成邮箱验证后再登录。");
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
    <main className="flex min-h-screen items-center justify-center bg-zinc-50/50 px-4 py-10 selection:bg-primary/20 dark:bg-zinc-950">
      <PageTransition className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
            <DuckLogo className="h-8 w-8" />
          </div>
          <div className="space-y-1.5 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              创建账户
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              设置密码并完成邮箱验证
            </p>
          </div>
        </div>

        <Card className="overflow-hidden border-zinc-200/80 shadow-sm dark:border-zinc-800/80">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error ? (
                <div className="rounded-xl bg-red-50 p-3 text-[13px] text-red-600 ring-1 ring-inset ring-red-500/20 animate-in fade-in zoom-in-95 dark:bg-red-950/30 dark:text-red-400">
                  {error}
                </div>
              ) : null}
              {notice ? (
                <div className="rounded-xl bg-emerald-50 p-3 text-[13px] text-emerald-600 ring-1 ring-inset ring-emerald-500/20 animate-in fade-in zoom-in-95 dark:bg-emerald-950/30 dark:text-emerald-400">
                  {notice}
                </div>
              ) : null}

              <div className="space-y-3">
                <AuthInput
                  id="email"
                  label="邮箱地址"
                  icon={Mail}
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  value={email}
                  error={fieldErrors.email}
                  onChange={(value) => {
                    setEmail(value);
                    if (fieldErrors.email) {
                      setFieldErrors((p) => ({ ...p, email: undefined }));
                    }
                  }}
                />

                <AuthInput
                  id="password"
                  label="登录密码"
                  icon={LockKeyhole}
                  type="password"
                  placeholder="至少 8 位"
                  autoComplete="new-password"
                  value={password}
                  error={fieldErrors.password}
                  onChange={(value) => {
                    setPassword(value);
                    if (fieldErrors.password) {
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                    }
                  }}
                />

                <AuthInput
                  id="confirmPassword"
                  label="确认密码"
                  icon={LockKeyhole}
                  type="password"
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  value={confirmPassword}
                  error={fieldErrors.confirmPassword}
                  onChange={(value) => {
                    setConfirmPassword(value);
                    if (fieldErrors.confirmPassword) {
                      setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                    }
                  }}
                />

                <div className="space-y-1">
                  <Label
                    htmlFor="verificationCode"
                    className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    验证码
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <Input
                        id="verificationCode"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="6位验证码"
                        value={verificationCode}
                        aria-invalid={!!fieldErrors.verificationCode}
                        className={cn(
                          "h-11 border-zinc-200 bg-zinc-50/50 pl-9 focus-visible:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-900/50",
                          fieldErrors.verificationCode &&
                            "border-red-500/50 focus-visible:ring-red-500/20",
                        )}
                        onChange={(e) => {
                          setVerificationCode(e.target.value);
                          if (fieldErrors.verificationCode) {
                            setFieldErrors((p) => ({
                              ...p,
                              verificationCode: undefined,
                            }));
                          }
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 min-w-[100px] shrink-0 bg-zinc-100 px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
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

                <AuthInput
                  id="inviteCode"
                  label={
                    <>
                      邀请码 <span className="font-normal text-zinc-400">(可选)</span>
                    </>
                  }
                  icon={Ticket}
                  placeholder="如有邀请码可填写"
                  value={inviteCode}
                  onChange={(value) => setInviteCode(value.toUpperCase())}
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-start gap-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => {
                      setAcceptedTerms(e.target.checked);
                      if (fieldErrors.acceptedTerms) {
                        setFieldErrors((p) => ({ ...p, acceptedTerms: undefined }));
                      }
                    }}
                    className="mt-1 h-3.5 w-3.5 rounded border-zinc-300 text-primary focus:ring-primary/20"
                  />
                  <span>
                    我已阅读并同意{" "}
                    <Link
                      href="/terms"
                      className="font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                    >
                      服务条款
                    </Link>{" "}
                    与{" "}
                    <Link
                      href="/privacy"
                      className="font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                    >
                      隐私政策
                    </Link>
                  </span>
                </label>
                <FieldError message={fieldErrors.acceptedTerms} />
              </div>

              <Button
                className="group mt-2 h-11 w-full bg-zinc-900 font-medium text-white transition-all hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                type="submit"
                disabled={loading || !acceptedTerms}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    完成注册
                    <ArrowRight className="ml-2 h-4 w-4 opacity-70 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
          已有账户？{" "}
          <Link
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
            href="/login"
          >
            直接登录
          </Link>
        </p>
      </PageTransition>
    </main>
  );
}

function AuthInput({
  id,
  label,
  icon: Icon,
  type = "text",
  placeholder,
  autoComplete,
  value,
  error,
  onChange,
}: {
  id: string;
  label: ReactNode;
  icon: LucideIcon;
  type?: string;
  placeholder: string;
  autoComplete?: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </Label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          aria-invalid={!!error}
          className={cn(
            "h-11 border-zinc-200 bg-zinc-50/50 pl-9 focus-visible:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-900/50",
            error && "border-red-500/50 focus-visible:ring-red-500/20",
          )}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
