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
          完整接入指南将发布在独立静态文档站；此处为占位入口。
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
        <CardContent className="text-sm font-medium text-muted-foreground">
          静态文档站上线后，侧边栏入口将跳转至正式文档。
        </CardContent>
      </Card>
    </div>
  );
}
