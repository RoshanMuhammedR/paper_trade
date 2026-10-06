export function Sparkline({ values, base, width = 56, height = 20 }: { values: number[]; base?: number; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values, base ?? Infinity);
  const max = Math.max(...values, base ?? -Infinity);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 1 - ((v - min) / span) * (height - 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const up = values[values.length - 1] >= (base ?? values[0]);
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      {base != null && <line x1={0} x2={width} y1={y(base)} y2={y(base)} stroke="var(--line-strong)" strokeDasharray="2 2" strokeWidth={1} />}
      <path d={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
