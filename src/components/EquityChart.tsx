"use client";

import { useMemo, useRef, useState } from "react";
import { fmtDate, fmtINR } from "@/lib/format";

export interface EquityPoint {
  t: number;
  equity: number;
}

/** Lightweight responsive area chart for the equity curve */
export function EquityChart({ points, baseline, height = 240 }: { points: EquityPoint[]; baseline: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 800;
  const pad = { l: 8, r: 64, t: 12, b: 24 };

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const vals = points.map((p) => p.equity).concat(baseline);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (max - min < 1) {
      min -= 1;
      max += 1;
    }
    const padV = (max - min) * 0.08;
    min -= padV;
    max += padV;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const x = (t: number) => pad.l + (t1 === t0 ? (width - pad.l - pad.r) / 2 : ((t - t0) / (t1 - t0)) * (width - pad.l - pad.r));
    const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.equity).toFixed(1)}`).join("");
    const area = `${line}L${x(t1).toFixed(1)},${height - pad.b}L${x(t0).toFixed(1)},${height - pad.b}Z`;
    const ticks = Array.from({ length: 4 }, (_, i) => min + ((max - min) * (i + 0.5)) / 4);
    return { x, y, line, area, ticks, t0, t1 };
  }, [points, baseline, height, pad.b, pad.l, pad.r, pad.t]);

  if (!geo) return <div className="flex items-center justify-center text-[13px] text-muted" style={{ height }}>No history yet</div>;

  const last = points[points.length - 1];
  const up = last.equity >= baseline;
  const color = up ? "var(--up)" : "var(--down)";
  const hp = hover != null ? points[hover] : null;

  function onMove(e: React.MouseEvent) {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geo!.x(p.t) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
        <defs>
          <linearGradient id="eqfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {geo.ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        <line
          x1={pad.l}
          x2={width - pad.r}
          y1={geo.y(baseline)}
          y2={geo.y(baseline)}
          stroke="var(--faint)"
          strokeDasharray="4 4"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path d={geo.area} fill="url(#eqfill)" />
        <path d={geo.line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hp && (
          <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={pad.t} y2={height - pad.b} stroke="var(--faint)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* y labels (HTML so they don't stretch) */}
      {geo.ticks.map((v) => (
        <div key={v} className="num pointer-events-none absolute right-1 -translate-y-1/2 text-[10px] text-faint" style={{ top: `${(geo.y(v) / height) * 100}%` }}>
          {fmtINR(v, { decimals: false })}
        </div>
      ))}
      <div className="num pointer-events-none absolute bottom-0 left-2 text-[10px] text-faint">{fmtDate(geo.t0)}</div>
      <div className="num pointer-events-none absolute bottom-0 right-16 text-[10px] text-faint">{fmtDate(geo.t1)}</div>
      {hp && (
        <>
          <div
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel"
            style={{ left: `${(geo.x(hp.t) / width) * 100}%`, top: `${(geo.y(hp.equity) / height) * 100}%`, background: color }}
          />
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-line bg-panel px-2 py-1 text-[11px] shadow-pop"
            style={{ left: `min(calc(${(geo.x(hp.t) / width) * 100}% + 8px), calc(100% - 150px))` }}
          >
            <div className="text-faint">{fmtDate(hp.t)}</div>
            <div className="num font-semibold">{fmtINR(hp.equity)}</div>
          </div>
        </>
      )}
    </div>
  );
}
