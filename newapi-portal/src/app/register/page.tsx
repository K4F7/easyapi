"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

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

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get("inviteCode") ?? searchParams.get("ref") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(refCode);
  const [verificationCode, setVerificationCode] = useState("");
  const [turnstile, setTurnstile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const body: Record<string, string> = { email, password };
      if (inviteCode.trim()) {
        body.inviteCode = inviteCode.trim();
      }
      if (verificationCode.trim()) {
        body.verificationCode = verificationCode.trim();
      }
      if (turnstile.trim()) {
        body.turnstile = turnstile.trim();
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Registration failed");
        return;
      }

      if (res.status === 202) {
        setNotice(
          data.data?.message ??
            "注册已提交，请完成 NewAPI 要求的验证后再登录。",
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <PageTransition className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-3"
        >
          <DuckLogo />
          <span className="text-sm font-semibold">NewAPI Portal</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>注册</CardTitle>
            <CardDescription>
              使用 NewAPI 原生注册，成功后进入控制台管理 Token、充值和用量。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {notice}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="至少 8 位"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inviteCode">邀请码（可选）</Label>
                <Input
                  id="inviteCode"
                  placeholder="ABCD1234"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verificationCode">邮箱验证码（如 NewAPI 要求）</Label>
                <Input
                  id="verificationCode"
                  inputMode="numeric"
                  placeholder="请输入验证码"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="turnstile">Turnstile Token（如 NewAPI 要求）</Label>
                <Input
                  id="turnstile"
                  placeholder="由部署环境提供"
                  value={turnstile}
                  onChange={(e) => setTurnstile(e.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "注册中..." : "创建账户"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              已有账户？{" "}
              <Link
                className="font-medium text-foreground hover:underline"
                href="/login"
              >
                登录
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
