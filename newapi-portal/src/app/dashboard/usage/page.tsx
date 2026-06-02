"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/page-state";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/client/api";
import { formatDateTime, formatQuota } from "@/lib/client/format";

type UsageItem = {
  id?: number;
  model_name?: string;
  created_at: number;
  token_used?: number;
  count?: number;
  quota?: number;
};

type UsageResponse = {
  items: UsageItem[];
  totals: {
    quota: number;
    count: number;
    tokenUsed: number;
  };
};

type LogItem = {
  id: number;
  created_at: number;
  token_name?: string;
  model_name?: string;
  quota?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  use_time?: number;
  group?: string;
  request_id?: string;
};

type LogsResponse = {
  items: LogItem[];
  total: number;
  totals: {
    quota: number;
    count: number;
    tokenUsed: number;
  };
};

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

export default function UsagePage() {
  const initialRange = useMemo(() => defaultRange(), []);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function queryString() {
    const start = Math.floor(new Date(`${startDate}T00:00:00`).getTime() / 1000);
    const end = Math.floor(new Date(`${endDate}T23:59:59`).getTime() / 1000);
    const params = new URLSearchParams({
      start_timestamp: String(start),
      end_timestamp: String(end),
    });

    return params.toString();
  }

  async function loadData() {
    setError(null);
    setLoading(true);

    try {
      const query = queryString();
      const [usageData, logsData] = await Promise.all([
        apiFetch<UsageResponse>(`/api/usage?${query}&default_time=day`),
        apiFetch<LogsResponse>(`/api/logs?${query}&p=1&page_size=30`),
      ]);

      setUsage(usageData);
      setLogs(logsData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "用量加载失败");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadData();
  }

  useEffect(() => {
    void loadData();
    // Initial load only; date changes are applied by the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">用量</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          看看你的 API 用了多少额度，哪个令牌用得最多。
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="startDate">开始日期</Label>
              <Input
                id="startDate"
                required
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">结束日期</Label>
              <Input
                id="endDate"
                required
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button className="w-full sm:w-auto" disabled={loading} type="submit">
                <Search className="h-4 w-4" />
                查询
              </Button>
              <Button
                aria-label="刷新"
                disabled={loading}
                size="icon"
                type="button"
                variant="outline"
                onClick={() => void loadData()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <UsageSkeleton />
      ) : error ? (
        <ErrorState
          title="用量加载失败"
          description={error}
          actionLabel="重新加载"
          onAction={loadData}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric title="消耗额度" value={formatQuota(usage?.totals.quota)} />
            <Metric title="请求次数" value={formatQuota(usage?.totals.count)} />
            <Metric title="令牌用量" value={formatQuota(usage?.totals.tokenUsed)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>按日用量</CardTitle>
                <CardDescription>来自 `/api/usage` 的聚合数据。</CardDescription>
              </CardHeader>
              <CardContent>
                {!usage || usage.items.length === 0 ? (
                  <EmptyState title="暂无用量" description="当前时间范围没有用量数据。" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>模型</TableHead>
                        <TableHead>次数</TableHead>
                        <TableHead>额度</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.items.map((item, index) => (
                        <TableRow key={`${item.created_at}-${item.model_name ?? index}`}>
                          <TableCell>{formatDateTime(item.created_at)}</TableCell>
                          <TableCell>{item.model_name ?? "-"}</TableCell>
                          <TableCell>{formatQuota(item.count)}</TableCell>
                          <TableCell>{formatQuota(item.quota)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>请求日志</CardTitle>
                  <CardDescription>最近 30 条来自 `/api/logs`。</CardDescription>
                </div>
                <Badge variant="outline">{formatQuota(logs?.total)} 条</Badge>
              </CardHeader>
              <CardContent>
                {!logs || logs.items.length === 0 ? (
                  <EmptyState title="暂无日志" description="当前时间范围没有请求日志。" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>令牌</TableHead>
                        <TableHead>模型</TableHead>
                        <TableHead>额度</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.items.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{formatDateTime(log.created_at)}</TableCell>
                          <TableCell className="max-w-[120px] truncate">
                            {log.token_name ?? "-"}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate">
                            {log.model_name ?? "-"}
                          </TableCell>
                          <TableCell>{formatQuota(log.quota)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="truncate text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["quota", "count", "tokens"].map((key) => (
          <Card key={key}>
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}
