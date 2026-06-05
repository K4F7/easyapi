"use client";

import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";

import { DuckLogo } from "@/components/duck-logo";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
    <main className="flex min-h-screen items-center justify-center bg-zinc-50/50 dark:bg-zinc-950 px-4 py-10 selection:bg-primary/20">
      <PageTransition className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 p-3 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
            <DuckLogo className="h-8 w-8" />
          </div>
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              找回密码
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              输入注册邮箱，获取重置链接
            </p>
          </div>
        </div>

        <Card className="border-zinc-200/80 dark:border-zinc-800/80 shadow-sm overflow-hidden">
          <CardContent className="p-6">
            {submitted ? (
              <div className="space-y-5 animate-in fade-in zoom-in-95">
                <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800/50 p-4 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300 ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700/50">
                  如果该邮箱已注册账户，我们会向其发送一封包含重置说明的邮件，请注意查收（含垃圾邮件箱）。
                </div>
                <p className="text-xs text-center text-zinc-500 dark:text-zinc-400">
                  暂时收不到邮件？你可以稍后重试，或联系客服。
                </p>
                <Button asChild variant="outline" className="w-full h-11 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <Link href="/login">返回登录</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    邮箱地址
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      required
                      value={email}
                      className="pl-9 h-11 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 focus-visible:ring-primary/20"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-medium transition-all">
                  发送重置链接
                </Button>
              </form>
            )}
            {!submitted && (
              <Link
                href="/login"
                className="mt-6 flex items-center justify-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回登录
              </Link>
            )}
          </CardContent>
        </Card>
      </PageTransition>
    </main>
  );
}
