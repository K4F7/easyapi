"use client";

import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 我们暂未开放自助重置接口，这里只给中性反馈，不向用户暴露邮箱是否存在，
    // 也不调用任何后端接口。
    setSubmitted(true);
  }

  return (
    <AuthShell title="找回密码" description="输入注册邮箱，获取重置链接">
      {submitted ? (
        <div className="space-y-5 animate-in fade-in zoom-in-95">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-[13px] leading-relaxed text-slate-600">
            如果该邮箱已注册账户，我们会向其发送一封包含重置说明的邮件，请注意查收（含垃圾邮件箱）。
          </div>
          <p className="text-center text-xs text-slate-500">
            暂时收不到邮件？你可以稍后重试，或联系客服。
          </p>
          <Button
            asChild
            variant="outline"
            className="h-11 w-full rounded-2xl border-slate-200 bg-white text-slate-700 transition-[background-color,border-color,color] duration-200 hover:bg-slate-50"
          >
            <Link href="/login">返回登录</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="space-y-1.5">
            <Label
              htmlFor="email"
              className="text-xs font-semibold text-slate-700"
            >
              邮箱地址
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
                value={email}
                className="h-11 border-slate-200 bg-slate-50/70 pl-9 focus-visible:border-primary focus-visible:ring-primary/20"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="submit"
            className="h-11 w-full rounded-2xl font-semibold shadow-sm shadow-orange-200/50 transition-[background-color,box-shadow,transform] duration-200 hover:shadow-md hover:shadow-orange-200/60"
          >
            发送重置链接
          </Button>
        </form>
      )}
      {!submitted && (
        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-slate-500 transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回登录
        </Link>
      )}
    </AuthShell>
  );
}
