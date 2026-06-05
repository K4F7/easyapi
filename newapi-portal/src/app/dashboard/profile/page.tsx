"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

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

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Email form state
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.data.user);
        } else {
          router.push("/login");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [router]);

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;

    setEmailLoading(true);
    try {
      const res = await fetch("/api/auth/profile/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("邮箱已更新，请重新登录");
        setTimeout(() => {
          router.push("/login");
        }, 1500);
      } else {
        toast.error(data.error?.message || "更新失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) return;

    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch("/api/auth/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("密码已更新，请重新登录");
        setTimeout(() => {
          router.push("/login");
        }, 1500);
      } else {
        toast.error(data.error?.message || "更新失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setPasswordLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 page-transition">
      <div className="rounded-3xl border border-border/50 bg-white/70 p-5 shadow-soft backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-normal">个人资料</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          管理账户安全设置、绑定邮箱地址以及登录凭证。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>邮箱设置</CardTitle>
              <CardDescription>当前绑定的邮箱地址</CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <div className="mb-6">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                当前邮箱
              </Label>
              <div className="mt-2 truncate text-lg font-medium" title={user?.email}>
                {user?.email}
              </div>
            </div>

            <form onSubmit={handleEmailChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newEmail">新邮箱地址</Label>
                <Input
                  id="newEmail"
                  type="email"
                  placeholder="请输入新邮箱"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="h-12 bg-background/50 text-base"
                />
              </div>
              <Button
                type="submit"
                disabled={emailLoading || !newEmail || newEmail === user?.email}
                className="h-12 w-full text-base font-medium"
              >
                {emailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                更新邮箱
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/80 shadow-soft backdrop-blur">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>安全设置</CardTitle>
              <CardDescription>更改登录密码</CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">当前密码</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type="password"
                    placeholder="输入当前密码"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="h-12 bg-background/50 pl-10 text-base"
                  />
                  <Lock className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">新密码</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="输入新密码 (至少8位)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-12 bg-background/50 pl-10 text-base"
                  />
                  <Lock className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认新密码</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="再次输入新密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-12 bg-background/50 pl-10 text-base"
                  />
                  <Lock className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <Button
                type="submit"
                disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                className="mt-2 h-12 w-full text-base font-medium"
              >
                {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                更新密码
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
