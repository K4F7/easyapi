"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Download,
  RefreshCw,
} from "lucide-react";

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
import { BarChart, TopNBars } from "@/components/ui/mini-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/client/api";
import { formatCount, formatDateTime } from "@/lib/client/format";
import { useQuotaFormat } from "@/hooks/use-quota-format";
import { cn } from "@/lib/utils";

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

/* -------------------------------------------------------------------------- */
/* date helpers                                                                */
/* -------------------------------------------------------------------------- */

function toDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

type PresetKey = "today" | "7d" | "30d" | "month";

function presetRange(key: PresetKey): { start: string; end: string } {
  const end = new Date();
  const start = new Date();

  switch (key) {
    case "today":
      break;
    case "7d":
      start.setDate(end.getDate() - 6);
      break;
    case "30d":
      start.setDate(end.getDate() - 29);
      break;
    case "month":
      start.setDate(1);
      break;
  }

  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "month", label: "本月" },
];

/* -------------------------------------------------------------------------- */
/* aggregation (client-side, request contract unchanged)                       */
/* -------------------------------------------------------------------------- */

/** Sum usage rows into one bar per day (rows are split per-model upstream). */
function aggregateDaily(items: UsageItem[]) {
  const byDay = new Map<string, number>();
  for (const item of items) {
    const date = new Date(item.created_at * 1000);
    const key = toDateInputValue(date);
    byDay.set(key, (byDay.get(key) ?? 0) + (item.quota ?? 0));
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({
      label: day.slice(5), // MM-DD
      value,
    }));
}

/** Top-N models by quota from usage aggregation. */
function topModels(items: UsageItem[], max = 5) {
  const byModel = new Map<string, number>();
  for (const item of items) {
    const key = item.model_name?.trim() || "未知模型";
    byModel.set(key, (byModel.get(key) ?? 0) + (item.quota ?? 0));
  }
  return [...byModel.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, max);
}

/** Top-N tokens by quota from the logs page (usage data has no token field). */
function topTokens(items: LogItem[], max = 5) {
  const byToken = new Map<string, number>();
  for (const log of items) {
    const key = log.token_name?.trim() || "未命名令牌";
    byToken.set(key, (byToken.get(key) ?? 0) + (log.quota ?? 0));
  }
  return [...byToken.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, max);
}

/* -------------------------------------------------------------------------- */
/* logs table sorting                                                          */
/* -------------------------------------------------------------------------- */

type SortKey = "created_at" | "quota" | "use_time";
type SortDir = "asc" | "desc";

function sortLogs(items: LogItem[], key: SortKey, dir: SortDir): LogItem[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = (a[key] as number | undefined) ?? 0;
    const bv = (b[key] as number | undefined) ?? 0;
    return (av - bv) * factor;
  });
}

/* -------------------------------------------------------------------------- */
/* CSV export                                                                  */
/* -------------------------------------------------------------------------- */

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportLogsCsv(
  items: LogItem[],
  quotaToCny: (quota: number) => number,
) {
  const header = [
    "时间",
    "令牌",
    "模型",
    "提示Token",
    "补全Token",
    "消费(元)",
    "耗时(ms)",
    "请求ID",
  ];
  const rows = items.map((log) => [
    formatDateTime(log.created_at),
    log.token_name ?? "",
    log.model_name ?? "",
    log.prompt_tokens ?? "",
    log.completion_tokens ?? "",
    log.quota != null ? quotaToCny(log.quota).toFixed(4) : "",
    log.use_time ?? "",
    log.request_id ?? "",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `usage-logs-${toDateInputValue(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 30;

export default function UsagePage() {
  const { formatQuota, quotaToCny, refresh } = useQuotaFormat();
  const initialRange = useMemo(() => presetRange("7d"), []);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [activePreset, setActivePreset] = useState<PresetKey | null>("7d");
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [visibleLogs, setVisibleLogs] = useState(PAGE_SIZE);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
        // Request contract unchanged; pull a larger page so the table can
        // page client-side instead of a hard "最近 30 条" cap.
        apiFetch<LogsResponse>(`/api/logs?${query}&p=1&page_size=100`),
        refresh(),
      ]);

      setUsage(usageData);
      setLogs(logsData);
      setVisibleLogs(PAGE_SIZE);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "用量加载失败");
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(key: PresetKey) {
    const range = presetRange(key);
    setStartDate(range.start);
    setEndDate(range.end);
    setActivePreset(key);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadData();
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  useEffect(() => {
    void loadData();
    // Initial load only; date changes are applied by the form / presets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toCnySeries = (series: { label: string; value: number }[]) =>
    series.map((item) => ({ ...item, value: quotaToCny(item.value) }));

  const dailySeries = useMemo(
    () => (usage ? toCnySeries(aggregateDaily(usage.items)) : []),
    [usage, quotaToCny],
  );
  const modelRanks = useMemo(
    () => (usage ? toCnySeries(topModels(usage.items)) : []),
    [usage, quotaToCny],
  );
  const tokenRanks = useMemo(
    () => (logs ? toCnySeries(topTokens(logs.items)) : []),
    [logs, quotaToCny],
  );

  const sortedLogs = useMemo(
    () => (logs ? sortLogs(logs.items, sortKey, sortDir) : []),
    [logs, sortKey, sortDir],
  );
  const shownLogs = sortedLogs.slice(0, visibleLogs);
  const hasMoreLogs = sortedLogs.length > visibleLogs;

  const usageEmpty = !usage || usage.items.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">用量</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          你的 API 用量概览，看看消费花在了哪个令牌、哪个模型上。
        </p>
      </div>

      {/* date range + presets */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.key}
                size="sm"
                type="button"
                variant={activePreset === preset.key ? "default" : "outline"}
                onClick={() => applyPreset(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <Label htmlFor="startDate">开始日期</Label>
              <Input
                id="startDate"
                required
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setActivePreset(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">结束日期</Label>
              <Input
                id="endDate"
                required
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setActivePreset(null);
                }}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                className="w-full sm:w-auto"
                disabled={loading}
                type="submit"
              >
                <Calendar className="h-4 w-4" />
                应用日期
              </Button>
              <Button
                aria-label="刷新当前范围数据"
                title="刷新当前范围数据"
                disabled={loading}
                size="icon"
                type="button"
                variant="outline"
                onClick={() => void loadData()}
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
              </Button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground">
            时间按 Asia/Shanghai（北京时间）统计。
          </p>
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
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric
              title="消费金额"
              value={formatQuota(usage?.totals.quota)}
              hint="所选范围内累计扣费（人民币）"
            />
            <Metric
              title="请求次数"
              value={formatCount(usage?.totals.count)}
              unit="次"
              hint="所选范围内调用总次数"
            />
            <Metric
              title="令牌用量"
              value={formatCount(usage?.totals.tokenUsed)}
              unit="tokens"
              hint="提示 + 补全 Token 合计"
            />
          </div>

          {/* daily chart + rankings */}
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>按日用量</CardTitle>
                <CardDescription>每天消费金额趋势（人民币）。</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                {usageEmpty ? (
                  <EmptyUsage
                    onPreset={() => applyPreset("30d")}
                    onRefresh={() => void loadData()}
                  />
                ) : (
                  <BarChart
                    series={dailySeries}
                    unit="元"
                    height={240}
                    emptyText="所选范围暂无用量"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>用量排名</CardTitle>
                <CardDescription>
                  哪个模型 / 令牌消费最多（Top 5，人民币）。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-5">
                <div className="space-y-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-subtle">
                    按模型
                  </div>
                  <TopNBars
                    items={modelRanks}
                    unit="元"
                    emptyText="暂无模型用量"
                  />
                </div>
                <div className="space-y-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-subtle">
                    按令牌
                  </div>
                  <TopNBars
                    items={tokenRanks}
                    unit="元"
                    colorScheme={[
                      "hsl(215 25% 55%)",
                      "hsl(215 18% 65%)",
                      "hsl(214 14% 75%)",
                      "hsl(214 12% 84%)",
                      "hsl(214 12% 90%)",
                    ]}
                    emptyText="暂无令牌用量"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* request logs */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>最近请求记录</CardTitle>
                <CardDescription>每次 API 调用的明细。</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="neutral">共 {formatCount(logs?.total)} 条</Badge>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  disabled={!logs || logs.items.length === 0}
                  onClick={() => logs && exportLogsCsv(sortedLogs, quotaToCny)}
                >
                  <Download className="h-4 w-4" />
                  导出 CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!logs || logs.items.length === 0 ? (
                <EmptyState
                  title="暂无请求记录"
                  description="所选时间范围内没有 API 调用。0 也可能表示这段时间尚未发起请求。"
                  actionLabel="试试近 30 天"
                  onAction={() => applyPreset("30d")}
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableHead
                            label="时间"
                            active={sortKey === "created_at"}
                            dir={sortDir}
                            onClick={() => toggleSort("created_at")}
                          />
                          <TableHead>令牌</TableHead>
                          <TableHead>模型</TableHead>
                          <TableHead>状态</TableHead>
                          <SortableHead
                            label="消费"
                            active={sortKey === "quota"}
                            dir={sortDir}
                            onClick={() => toggleSort("quota")}
                          />
                          <SortableHead
                            label="耗时"
                            active={sortKey === "use_time"}
                            dir={sortDir}
                            onClick={() => toggleSort("use_time")}
                          />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shownLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatDateTime(log.created_at)}
                            </TableCell>
                            <TableCell className="max-w-[120px] truncate">
                              {log.token_name ?? "-"}
                            </TableCell>
                            <TableCell className="max-w-[160px] truncate">
                              {log.model_name ?? "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  (log.quota ?? 0) > 0 ? "success" : "neutral"
                                }
                              >
                                {(log.quota ?? 0) > 0 ? "成功" : "无消耗"}
                              </Badge>
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatQuota(log.quota)}
                            </TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">
                              {log.use_time
                                ? `${formatCount(log.use_time)} ms`
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      显示 {shownLogs.length} / {sortedLogs.length} 条
                    </span>
                    {hasMoreLogs ? (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setVisibleLogs((value) => value + PAGE_SIZE)
                        }
                      >
                        加载更多
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  unit,
  hint,
}: {
  title: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="flex items-baseline gap-1.5 truncate text-2xl tabular-nums">
          {value}
          {unit && value !== "-" ? (
            <span className="text-sm font-normal text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </CardTitle>
        {hint ? (
          <p className="pt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardHeader>
    </Card>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

function EmptyUsage({
  onPreset,
  onRefresh,
}: {
  onPreset: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 p-6 text-center">
      <p className="text-sm font-medium">所选范围暂无用量</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        这里的 0 表示该时间段还没有调用，并不代表出错。换个时间范围试试。
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onPreset}>
          试试近 30 天
        </Button>
        <Button size="sm" variant="ghost" onClick={onRefresh}>
          刷新
        </Button>
      </div>
    </div>
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
