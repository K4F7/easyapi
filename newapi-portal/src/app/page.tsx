import Link from "next/link";
import { ArrowRight, KeyRound, ReceiptText, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { DuckLogo } from "@/components/duck-logo";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const capabilities = [
  {
    title: "普通用户入口",
    description: "注册后进入控制台，创建 Token、充值额度、查看用量。",
    icon: KeyRound,
  },
  {
    title: "账单与兑换",
    description: "易支付订单、兑换码和邀请奖励统一由 portal API 处理。",
    icon: ReceiptText,
  },
  {
    title: "安全代理",
    description: "浏览器只访问 `/api/*`，不会接触 NewAPI access token。",
    icon: ShieldCheck,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <PageTransition className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 md:px-6">
        <header className="flex items-center justify-between border-b border-divider pb-4">
          <Link href="/" className="flex items-center gap-3">
            <DuckLogo />
            <span className="text-sm font-semibold">EZAPI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">登录</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">注册</Link>
            </Button>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-10 md:grid-cols-[1fr_380px] md:py-16">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-5">
              NewAPI customer portal
            </Badge>
            <h1 className="text-balance text-4xl font-semibold tracking-normal text-foreground md:text-5xl">
              给普通用户使用的 API 控制台
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              通过简洁的门户完成注册登录、Token 管理、额度充值、邀请奖励和用量查看。
              所有操作都经由本站 BFF API 转发，不直接暴露上游凭据。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  创建账户
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">已有账户登录</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/dashboard">进入控制台</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-divider bg-card p-5 shadow-subtle">
            <div className="flex items-center gap-4">
              <BrandMark compact={false} />
              <div>
                <div className="text-lg font-semibold">EZAPI Console</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tokens · Billing · Usage · Referral
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              {capabilities.map((item) => (
                <Card key={item.title}>
                  <CardContent className="flex gap-3 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.title}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </PageTransition>
    </main>
  );
}
