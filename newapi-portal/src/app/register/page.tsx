"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense, type ReactNode } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Ticket,
  User,
  type LucideIcon,
} from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeAuthError } from "@/lib/client/auth-error";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

type FieldErrors = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  verificationCode?: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs font-medium text-destructive/90">{message}</p>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode =
    searchParams.get("inviteCode") ?? searchParams.get("ref") ?? "";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

    if (!username.trim()) next.username = "请输入用户名";
    else if (username.trim().length < 2) next.username = "用户名至少 2 个字符";

    if (!password) next.password = "请输入密码";
    else if (password.length < 8) next.password = "密码至少需要 8 位";
    else if (password.length > 20) next.password = "密码最长 20 位";

    if (!confirmPassword) next.confirmPassword = "请再次输入密码";
    else if (confirmPassword !== password) {
      next.confirmPassword = "两次输入的密码不一致";
    }

    if (!email) next.email = "请输入邮箱";
    else if (!emailValid) next.email = "请输入有效的邮箱地址";

    if (!verificationCode.trim()) next.verificationCode = "请输入验证码";

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
        username: string;
        email: string;
        password: string;
        verificationCode: string;
        inviteCode?: string;
      } = {
        username: username.trim(),
        email,
        password,
        verificationCode: verificationCode.trim(),
      };

      const effectiveInviteCode = inviteCode.trim() || refCode.trim();
      if (effectiveInviteCode) body.inviteCode = effectiveInviteCode;

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
    <AuthShell
      title="免费创建账户"
      description="注册后即可创建令牌、查看用量并在线充值。"
      className="max-w-[460px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm leading-5 text-destructive">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm leading-5 text-emerald-700">
            {notice}
          </div>
        ) : null}

        <AuthInput
          id="username"
          label="用户名"
          icon={User}
          placeholder="请输入用户名"
          autoComplete="username"
          value={username}
          error={fieldErrors.username}
          onChange={(value) => {
            setUsername(value);
            if (fieldErrors.username) {
              setFieldErrors((p) => ({ ...p, username: undefined }));
            }
          }}
        />

        <AuthInput
          id="password"
          label="密码"
          icon={LockKeyhole}
          type={showPassword ? "text" : "password"}
          placeholder="输入密码，最短 8 位，最长 20 位"
          autoComplete="new-password"
          value={password}
          error={fieldErrors.password}
          trailing={
            <button
              type="button"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
              className="rounded-md p-1 text-slate-400 transition-colors duration-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          }
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
          type={showPassword ? "text" : "password"}
          placeholder="确认密码"
          autoComplete="new-password"
          value={confirmPassword}
          error={fieldErrors.confirmPassword}
          trailing={
            <button
              type="button"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
              className="rounded-md p-1 text-slate-400 transition-colors duration-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          }
          onChange={(value) => {
            setConfirmPassword(value);
            if (fieldErrors.confirmPassword) {
              setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
            }
          }}
        />

        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-xs font-semibold text-slate-700"
          >
            邮箱
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              type="email"
              placeholder="输入邮箱地址"
              autoComplete="email"
              value={email}
              aria-invalid={!!fieldErrors.email}
              className={cn(
                "h-11 border-slate-200 bg-slate-50/70 pl-9 pr-[7.5rem] focus-visible:border-primary focus-visible:ring-primary/20",
                fieldErrors.email &&
                  "border-destructive focus-visible:ring-destructive",
              )}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((p) => ({ ...p, email: undefined }));
                }
              }}
            />
            <button
              type="button"
              disabled={sendDisabled}
              onClick={handleSendVerificationCode}
              className="absolute right-2 top-1/2 min-w-20 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition-colors duration-200 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingCode ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : cooldown > 0 ? (
                `${cooldown}s`
              ) : (
                "获取验证码"
              )}
            </button>
          </div>
          <FieldError message={fieldErrors.email} />
        </div>

        <AuthInput
          id="verificationCode"
          label="验证码"
          icon={KeyRound}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="输入验证码"
          value={verificationCode}
          error={fieldErrors.verificationCode}
          onChange={(value) => {
            setVerificationCode(value);
            if (fieldErrors.verificationCode) {
              setFieldErrors((p) => ({ ...p, verificationCode: undefined }));
            }
          }}
        />

        <AuthInput
          id="inviteCode"
          label={
            <>
              邀请码 <span className="font-normal text-slate-500">(可选)</span>
            </>
          }
          icon={Ticket}
          placeholder="如有邀请码可填写"
          value={inviteCode}
          onChange={(value) => setInviteCode(value.toUpperCase())}
        />

        <Button
          className="h-11 w-full rounded-2xl text-base font-semibold shadow-sm shadow-orange-200/50 transition-[background-color,box-shadow,transform] duration-200 hover:shadow-md hover:shadow-orange-200/60"
          type="submit"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              注册中…
            </>
          ) : (
            "注册"
          )}
        </Button>

        <p className="pt-1 text-center text-sm text-slate-500">
          已有账户？{" "}
          <Link
            className="rounded-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            href="/login"
          >
            登录
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

function AuthInput({
  id,
  label,
  icon: Icon,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  value,
  error,
  trailing,
  onChange,
}: {
  id: string;
  label: ReactNode;
  icon: LucideIcon;
  type?: string;
  placeholder: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  value: string;
  error?: string;
  trailing?: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          value={value}
          aria-invalid={!!error}
          className={cn(
            "h-11 border-slate-200 bg-slate-50/70 pl-9 focus-visible:border-primary focus-visible:ring-primary/20",
            trailing && "pr-10",
            error && "border-destructive focus-visible:ring-destructive",
          )}
          onChange={(e) => onChange(e.target.value)}
        />
        {trailing ? (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {trailing}
          </div>
        ) : null}
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
