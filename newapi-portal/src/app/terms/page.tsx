import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "账户与访问",
    body: "你需要使用真实、可接收邮件的邮箱注册账户，并妥善保管登录密码、验证码和 API 令牌。因账户凭据泄露造成的调用、消耗或数据风险，由账户持有人负责及时处置。",
  },
  {
    title: "额度与计费",
    body: "平台会根据实际调用、充值、兑换和奖励记录更新额度。Playground 试玩使用你选择的令牌发起请求，相关消耗会计入该令牌和账户额度。",
  },
  {
    title: "合理使用",
    body: "不得利用本服务进行违法、侵权、滥用、攻击、绕过限制、批量骚扰或其他破坏平台稳定性的行为。平台可对异常请求、违规内容或风险账户采取限制措施。",
  },
  {
    title: "服务变更",
    body: "模型、供应商、价格、额度换算和功能可用性可能随上游与运营策略调整。重要变更会尽量在产品界面或相关文档中提示。",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">EZAPI</p>
          <h1 className="text-3xl font-semibold tracking-normal">服务条款</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            以下条款用于说明账户、额度、调用与平台使用边界。继续注册或使用服务即表示你理解并同意这些条款。
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">条款摘要</CardTitle>
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
