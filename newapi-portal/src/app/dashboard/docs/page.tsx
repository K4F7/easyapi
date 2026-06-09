import { BookOpen } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            接入文档
          </h1>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-800">
            WIP
          </span>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          完整接入指南将发布在独立静态文档站（Vercel 部署）；此处为占位入口。
        </p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg">文档站筹备中</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            计划提供 API Key 获取、渠道选择、模型别名与 Fastboot 脚本等说明。当前请通过控制台令牌页与操练场完成接入体验。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm font-medium text-muted-foreground">
          <p>
            静态文档站上线后，在 Portal 部署环境设置{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">
              NEXT_PUBLIC_DOCS_URL
            </code>{" "}
            即可将侧边栏与顶栏文档入口切换为外链，并自动移除 WIP 标记。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
