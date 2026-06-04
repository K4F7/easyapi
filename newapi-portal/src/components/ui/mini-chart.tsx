"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Format a number with thousands separators + optional unit suffix. */
function formatValue(value: number, unit?: string) {
  const n = Number.isFinite(value) ? value : 0;
  const text = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit ? `${text}${unit}` : text;
}

/** A "nice" round step for axis ticks (1 / 2 / 5 * 10^n). */
function niceStep(rawStep: number) {
  if (rawStep <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * pow;
}

/* -------------------------------------------------------------------------- */
/* Sparkline — minimal axis-less line/area micro chart                         */
/* -------------------------------------------------------------------------- */

export interface SparklineProps extends React.HTMLAttributes<HTMLSpanElement> {
  data: number[];
  width?: number;
  height?: number;
  /** Stroke/fill color. Defaults to currentColor (set via text-primary etc.). */
  color?: string;
  /** Render a soft area fill under the line. */
  area?: boolean;
}

const Sparkline = React.forwardRef<HTMLSpanElement, SparklineProps>(
  (
    {
      data,
      width = 96,
      height = 28,
      color = "currentColor",
      area = true,
      className,
      ...props
    },
    ref,
  ) => {
    const values = data && data.length ? data : [0];
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;

    const pad = 2;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;

    const points = values.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + innerH - ((v - min) / span) * innerH;
      return [x, y] as const;
    });

    const isFlat = max === min; // all-zero or constant => baseline
    const linePath = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const areaPath = `${linePath} L${(pad + innerW).toFixed(1)},${(
      height - pad
    ).toFixed(1)} L${pad.toFixed(1)},${(height - pad).toFixed(1)} Z`;

    return (
      <span
        ref={ref}
        className={cn("inline-flex text-primary", className)}
        {...props}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="趋势迷你图"
          className="overflow-visible"
        >
          {area && !isFlat && (
            <path d={areaPath} fill={color} opacity={0.12} stroke="none" />
          )}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={isFlat ? 0.4 : 1}
          />
        </svg>
      </span>
    );
  },
);
Sparkline.displayName = "Sparkline";

/* -------------------------------------------------------------------------- */
/* BarChart — daily bars with axes, gridlines and hover tooltip                */
/* -------------------------------------------------------------------------- */

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps extends React.HTMLAttributes<HTMLDivElement> {
  series: BarChartDatum[];
  unit?: string;
  height?: number;
  color?: string;
  emptyText?: string;
}

const BarChart = React.forwardRef<HTMLDivElement, BarChartProps>(
  (
    {
      series,
      unit,
      height = 220,
      color = "hsl(var(--primary))",
      emptyText = "暂无数据",
      className,
      ...props
    },
    ref,
  ) => {
    const [hover, setHover] = React.useState<number | null>(null);

    const max = series.length ? Math.max(...series.map((d) => d.value)) : 0;
    const isEmpty = !series.length || max <= 0;

    if (isEmpty) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center justify-center rounded-xl border border-dashed bg-muted/30 py-10 text-sm text-muted-foreground",
            className,
          )}
          {...props}
        >
          {emptyText}
        </div>
      );
    }

    // layout in a fixed viewBox; SVG scales to 100% width.
    const VB_W = 640;
    const VB_H = height;
    const padL = 48;
    const padR = 12;
    const padT = 12;
    const padB = 28;
    const plotW = VB_W - padL - padR;
    const plotH = VB_H - padT - padB;

    const ticks = 4;
    const step = niceStep(max / ticks);
    const top = step * Math.ceil(max / step) || 1;

    const yLines = Array.from({ length: ticks + 1 }, (_, i) => {
      const value = (top / ticks) * i;
      const y = padT + plotH - (value / top) * plotH;
      return { value, y };
    });

    const slot = plotW / series.length;
    const barW = Math.min(slot * 0.6, 40);

    // show at most ~8 x labels to avoid crowding
    const labelEvery = Math.ceil(series.length / 8);

    return (
      <div ref={ref} className={cn("relative w-full", className)} {...props}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          role="img"
          aria-label={`按日柱状图，最高 ${formatValue(max, unit)}`}
          onMouseLeave={() => setHover(null)}
        >
          {/* gridlines + Y axis labels */}
          {yLines.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={VB_W - padR}
                y1={t.y}
                y2={t.y}
                stroke="hsl(var(--border))"
                strokeWidth={1}
                opacity={i === 0 ? 0.9 : 0.5}
              />
              <text
                x={padL - 8}
                y={t.y}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-muted-foreground tabular-nums"
                fontSize={11}
              >
                {formatValue(t.value, unit)}
              </text>
            </g>
          ))}

          {/* bars */}
          {series.map((d, i) => {
            const h = (d.value / top) * plotH;
            const x = padL + slot * i + (slot - barW) / 2;
            const y = padT + plotH - h;
            const active = hover === i;
            return (
              <g key={i}>
                {/* hit area spans the full slot for easy hovering */}
                <rect
                  x={padL + slot * i}
                  y={padT}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, 1)}
                  rx={3}
                  fill={color}
                  opacity={active ? 1 : 0.85}
                  pointerEvents="none"
                />
                {i % labelEvery === 0 && (
                  <text
                    x={padL + slot * i + slot / 2}
                    y={VB_H - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={11}
                    pointerEvents="none"
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* tooltip */}
        {hover !== null && series[hover] && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-card px-3 py-1.5 text-xs shadow-soft"
            style={{
              left: `${((padL + slot * hover + slot / 2) / VB_W) * 100}%`,
              top: `${(padT / VB_H) * 100}%`,
            }}
          >
            <div className="font-medium text-foreground">{series[hover].label}</div>
            <div className="tabular-nums text-muted-foreground">
              {formatValue(series[hover].value, unit)}
            </div>
          </div>
        )}
      </div>
    );
  },
);
BarChart.displayName = "BarChart";

/* -------------------------------------------------------------------------- */
/* TopNBars — horizontal ranked bars (e.g. top tokens / models)                */
/* -------------------------------------------------------------------------- */

export interface TopNItem {
  label: string;
  value: number;
}

export interface TopNBarsProps extends React.HTMLAttributes<HTMLDivElement> {
  items: TopNItem[];
  unit?: string;
  /** Reference value for full-width bar. Defaults to the largest item value. */
  max?: number;
  /** Colorblind-safe, low-saturation neutral ramp (primary orange + slate). */
  colorScheme?: string[];
  emptyText?: string;
}

const DEFAULT_SCHEME = [
  "hsl(var(--primary))", // brand orange
  "hsl(215 25% 55%)", // slate
  "hsl(215 18% 65%)",
  "hsl(214 14% 75%)",
  "hsl(214 12% 84%)", // ~ --border, lightest
];

const TopNBars = React.forwardRef<HTMLDivElement, TopNBarsProps>(
  (
    {
      items,
      unit,
      max,
      colorScheme = DEFAULT_SCHEME,
      emptyText = "暂无数据",
      className,
      ...props
    },
    ref,
  ) => {
    const total = items.reduce((s, d) => s + (d.value > 0 ? d.value : 0), 0);
    const isEmpty = !items.length || total <= 0;

    if (isEmpty) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center justify-center rounded-xl border border-dashed bg-muted/30 py-10 text-sm text-muted-foreground",
            className,
          )}
          {...props}
        >
          {emptyText}
        </div>
      );
    }

    const ceiling = max ?? Math.max(...items.map((d) => d.value)) ?? 1;

    return (
      <div
        ref={ref}
        className={cn("flex flex-col gap-3", className)}
        role="img"
        aria-label="排名条形图"
        {...props}
      >
        {items.map((d, i) => {
          const pct = ceiling > 0 ? Math.max((d.value / ceiling) * 100, 1) : 0;
          const fill = colorScheme[Math.min(i, colorScheme.length - 1)];
          return (
            <div key={`${d.label}-${i}`} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium text-foreground" title={d.label}>
                  {d.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatValue(d.value, unit)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: fill }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);
TopNBars.displayName = "TopNBars";

export { Sparkline, BarChart, TopNBars };
