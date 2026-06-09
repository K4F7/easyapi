import Link from "next/link";
import { ArrowRight, KeyRound, ReceiptText, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { DuckLogo } from "@/components/duck-logo";
import { WebMcpRegistration } from "@/components/webmcp-registration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const capabilities = [
  {
    title: "注册就能用",
    description: "三分钟完成注册，立刻创建你的第一个令牌，开始调用 API。",
    icon: KeyRound,
    color: "bg-primary-soft text-accent",
  },
  {
    title: "充值 & 赚奖励",
    description: "支持支付宝充值，还能用兑换码，邀请好友注册还有返利。",
    icon: ReceiptText,
    color: "bg-primary-soft text-accent",
  },
  {
    title: "密钥不外露",
    description: "你的真实 API 密钥由我们代为保管，对外只暴露你自己的令牌。",
    icon: ShieldCheck,
    color: "bg-primary-soft text-accent",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background overflow-x-hidden relative selection:bg-primary selection:text-primary-foreground">
      <WebMcpRegistration />
      {/* Soft background blobs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-primary opacity-5 rounded-full blur-3xl -z-10 pointer-events-none" />
      
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-6 relative z-10">
        <header
          className="home-enter flex items-center justify-between bg-card/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-border"
        >
          <Link href="/" className="flex items-center gap-3 group">
            <div className="transition-transform duration-200 group-hover:rotate-[5deg] group-hover:scale-105">
              <DuckLogo size={36} priority />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">EasyAPI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="hidden md:flex rounded-xl text-muted-foreground hover:bg-primary-soft hover:text-foreground">
              <Link href="/login" prefetch={false}>登录</Link>
            </Button>
            <Button asChild className="rounded-xl shadow-sm transition-shadow hover:shadow-md">
              <Link href="/register" prefetch={false}>注册</Link>
            </Button>
          </div>
        </header>

        <section className="flex-1 py-14 sm:py-16 md:py-24 flex items-center">
          <div className="grid gap-16 lg:grid-cols-[1.1fr_1fr] items-center w-full">
            
            <div
              className="max-w-2xl relative"
            >
              <div className="home-enter home-enter-1">
                <Badge variant="secondary" className="mb-6 text-base font-medium px-5 py-2 shadow-sm rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors border-0">
                  不懂技术也能轻松调用AI
                </Badge>
              </div>
              
              <h1
                className="text-balance text-[2.2rem] sm:text-5xl lg:text-6xl xl:text-[4rem] font-extrabold tracking-normal text-foreground leading-[1.18] sm:leading-[1.15]"
              >
                <span className="text-accent inline-block">
                  <span className="block sm:inline">管令牌、看用量、</span>
                  <span className="block sm:inline">随时充值</span>
                </span>
              </h1>
              
              <div className="home-enter home-enter-2 mt-6 max-w-xl">
                <p className="text-lg leading-relaxed text-muted-foreground">
                  不需要配置服务器，注册即用。管令牌、看用量、在线充值，就这么简单。
                </p>
              </div>
              
              <div className="home-enter home-enter-3 mt-10 flex flex-wrap gap-4">
                <Button asChild size="lg" className="h-14 px-8 rounded-2xl text-base shadow-sm transition-shadow hover:shadow-md">
                  <Link href="/register" prefetch={false}>
                    免费注册，马上试用
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-14 px-8 rounded-2xl text-base border-border text-foreground transition-colors hover:bg-primary-soft">
                  <Link href="/dashboard" prefetch={false}>进入控制台</Link>
                </Button>
              </div>
            </div>

            <div
              className="home-enter home-enter-2 relative"
            >
              <div
                className="home-float rounded-3xl border border-border bg-card/60 backdrop-blur-xl p-8 shadow-xl shadow-primary/10 relative z-10"
              >
                <div className="flex items-center gap-5 mb-8 pb-6 border-b border-border">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-card p-1.5 shadow-sm">
                    <BrandMark compact priority className="h-full w-full" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">系统状态</h2>
                    <p className="text-sm text-emerald-700 font-medium flex items-center gap-1.5 mt-0.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      所有服务运行正常
                    </p>
                  </div>
                </div>
                
                <div className="grid gap-4">
                  {capabilities.map((item, i) => (
                    <div
                      key={item.title}
                      className={`home-enter home-enter-${i + 4} group cursor-default transition-transform duration-200 hover:scale-[1.02]`}
                    >
                      <Card className="border-0 bg-card shadow-sm transition-shadow hover:shadow-md rounded-2xl overflow-hidden">
                        <CardContent className="flex items-center gap-4 p-4">
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${item.color} transition-colors`}>
                            <item.icon className="h-6 w-6" strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                            <p className="mt-0.5 text-sm text-muted-foreground leading-snug">
                              {item.description}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
          </div>
        </section>
      </div>
    </main>
  );
}
