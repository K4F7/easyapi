"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import { Eye, EyeOff, Check, Loader2 } from "lucide-react";

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
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

type FieldErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  verificationCode?: string;
  agree?: string;
};

function FieldError({ message }: { message?: string }) {
  return (
    <p className="min-h-[1rem] text-xs leading-4 text-destructive/90">
      {message ?? ""}
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
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Verification code is only required on demand: the field appears after a
  // code has been requested, so it never sits as a dead-end input.
  const [codeRequested, setCodeRequested] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const emailValid = EMAIL_RE.test(email);
  const passwordLongEnough = password.length >= 8;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

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
        setError(data.error?.message ?? "验证码发送失败，请稍后再试。");
        return;
      }

      setCodeRequested(true);
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

    if (!password) next.password = "请输入密码";
    else if (!passwordLongEnough) next.password = "密码至少需要 8 位";

    if (!confirmPassword) next.confirmPassword = "请再次输入密码";
    else if (password !== confirmPassword) next.confirmPassword = "两次输入的密码不一致";

    if (codeRequested && !verificationCode.trim())
      next.verificationCode = "请输入收到的验证码";

    if (!agreed) next.agree = "请阅读并同意服务条款与隐私政策";

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
      const body: Record<string, string> = { email, password };
      const effectiveInviteCode = inviteCode.trim() || refCode.trim();
      if (effectiveInviteCode) {
        body.inviteCode = effectiveInviteCode;
      }
      if (verificationCode.trim()) {
        body.verificationCode = verificationCode.trim();
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        // Backend signals that an email verification step is needed: surface
        // the verification field so the user has a clear next action.
        if (data.error?.code === "NEWAPI_VERIFICATION_REQUIRED") {
          setCodeRequested(true);
          setError("注册需要先完成邮箱验证，请点击「发送验证码」并填写收到的验证码。");
          return;
        }
        setError(data.error?.message ?? "注册失败，请稍后再试。");
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <PageTransition className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3">
          <DuckLogo />
          <span className="text-sm font-semibold">EZAPI 控制台</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>注册</CardTitle>
            <CardDescription>
              注册后立刻拥有你的专属控制台，管令牌、充值、看用量。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {notice}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  value={email}
                  aria-invalid={!!fieldErrors.email}
                  className={cn(
                    fieldErrors.email && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive",
                  )}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email)
                      setFieldErrors((p) => ({ ...p, email: undefined }));
                  }}
                />
                <FieldError message={fieldErrors.email} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="设置登录密码"
                    autoComplete="new-password"
                    value={password}
                    aria-invalid={!!fieldErrors.password}
                    className={cn(
                      "pr-10",
                      fieldErrors.password && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive",
                    )}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password)
                        setFieldErrors((p) => ({ ...p, password: undefined }));
                    }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p
                  className={cn(
                    "flex items-center gap-1.5 min-h-[1rem] text-xs leading-4 transition-colors",
                    password.length === 0
                      ? "text-muted-foreground"
                      : passwordLongEnough
                        ? "text-emerald-600 dark:text-emerald-500"
                        : "text-destructive/90",
                  )}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      passwordLongEnough ? "opacity-100" : "opacity-30",
                    )}
                  />
                  至少 8 位字符
                </p>
                <FieldError message={fieldErrors.password} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">确认密码</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  value={confirmPassword}
                  aria-invalid={!!fieldErrors.confirmPassword}
                  className={cn(
                    fieldErrors.confirmPassword && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive",
                    passwordsMatch && !fieldErrors.confirmPassword && "border-emerald-500/60",
                  )}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword)
                      setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                  }}
                />
                <FieldError message={fieldErrors.confirmPassword} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inviteCode">邀请码（可选）</Label>
                <Input
                  id="inviteCode"
                  placeholder="如有邀请码可填写"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                />
              </div>

              {codeRequested && (
                <div className="space-y-1.5">
                  <Label htmlFor="verificationCode">邮箱验证码</Label>
                  <div className="flex gap-2">
                    <Input
                      id="verificationCode"
                      className={cn(
                        "min-w-0 flex-1",
                        fieldErrors.verificationCode && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive",
                      )}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="请输入收到的验证码"
                      value={verificationCode}
                      aria-invalid={!!fieldErrors.verificationCode}
                      onChange={(e) => {
                        setVerificationCode(e.target.value);
                        if (fieldErrors.verificationCode)
                          setFieldErrors((p) => ({ ...p, verificationCode: undefined }));
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={sendDisabled}
                      onClick={handleSendVerificationCode}
                    >
                      {sendingCode
                        ? "发送中…"
                        : cooldown > 0
                          ? `${cooldown}s 后重发`
                          : "重新发送"}
                    </Button>
                  </div>
                  <FieldError message={fieldErrors.verificationCode} />
                </div>
              )}

              {!codeRequested && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={sendDisabled}
                  onClick={handleSendVerificationCode}
                >
                  {sendingCode ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      发送中…
                    </>
                  ) : cooldown > 0 ? (
                    `${cooldown}s 后可重发`
                  ) : (
                    "发送邮箱验证码"
                  )}
                </Button>
              )}

              <div className="space-y-1.5 pt-1">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => {
                      setAgreed(e.target.checked);
                      if (fieldErrors.agree)
                        setFieldErrors((p) => ({ ...p, agree: undefined }));
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span>
                    我已阅读并同意
                    <Link href="/terms" className="mx-0.5 font-medium text-foreground hover:underline">
                      服务条款
                    </Link>
                    与
                    <Link href="/privacy" className="mx-0.5 font-medium text-foreground hover:underline">
                      隐私政策
                    </Link>
                  </span>
                </label>
                <FieldError message={fieldErrors.agree} />
              </div>

              <Button
                className="w-full bg-primary/95 hover:bg-primary"
                type="submit"
                disabled={loading || !agreed}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    注册中…
                  </>
                ) : (
                  "免费注册"
                )}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              已有账户？{" "}
              <Link
                className="font-semibold text-primary underline-offset-4 hover:underline"
                href="/login"
              >
                直接登录
              </Link>
            </p>
          </CardContent>
        </Card>
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
