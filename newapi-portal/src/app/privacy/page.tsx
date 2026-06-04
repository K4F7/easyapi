import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "我们收集的信息",
    body: "注册和使用过程中会处理邮箱、账户标识、登录会话、邀请关系、充值/兑换/奖励记录、用量统计以及必要的安全审计信息。",
  },
  {
    title: "信息用途",
    body: "这些信息用于账户登录、额度结算、请求转发、Playground 试玩、异常排查、风险控制、账单展示和必要的客户支持。",
  },
  {
    title: "令牌与密钥",
    body: "API 令牌只应在服务端安全使用。门户的 Playground 只在服务端代理中注入真实密钥，不会把真实密钥返回给浏览器界面。",
  },
  {
    title: "数据保护",
    body: "我们会采用访问控制、脱敏展示和最小必要原则保护账户与调用数据。你也应及时删除不再使用的令牌，并避免共享账户凭据。",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">EZAPI</p>
          <h1 className="text-3xl font-semibold tracking-normal">隐私政策</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            本政策说明门户如何处理注册、计费、邀请、用量和 Playground 试玩相关信息。
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">隐私摘要</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {sections.map((section) => (
              <section key={section.title} className="space-y-2 p-5">
                <h2 className="text-sm font-semibold">{section.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </CardContent>
        </Card>

        <Button asChild variant="outline">
          <Link href="/register">返回注册</Link>
        </Button>
      </div>
    </main>
  );
}
