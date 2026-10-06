"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { INDICATORS, indicatorDef, type IndicatorCategory, type IndicatorConfig } from "./catalog";
import { Badge, Button, Input, Modal, cn } from "../ui/primitives";

const CATEGORIES: ("All" | IndicatorCategory)[] = ["All", "Trend", "Momentum", "Volatility", "Volume", "Other"];

export function IndicatorDialog({
  open,
  onClose,
  active,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  active: IndicatorConfig[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return INDICATORS.filter(
      (i) => (cat === "All" || i.category === cat) && (!term || i.name.toLowerCase().includes(term) || i.label.toLowerCase().includes(term)),
    );
  }, [q, cat]);

  return (
    <Modal open={open} onClose={onClose} title="Indicators" width={640}>
      <div className="flex h-[min(560px,70vh)] flex-col">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input autoFocus placeholder="Search indicators" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cn(
                  "h-7 rounded-full px-3 text-xs font-medium transition-colors",
                  cat === c ? "bg-accent text-white" : "bg-hover text-muted hover:text-fg",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_200px]">
          <div className="min-h-0 overflow-auto p-1.5">
            {list.map((def) => {
              const count = active.filter((a) => a.name === def.name).length;
              return (
                <button
                  key={def.name}
                  onClick={() => onAdd(def.name)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      {def.label}
                      <span className="text-[11px] font-normal text-faint">{def.name}</span>
                    </div>
                    <div className="truncate text-xs text-muted">{def.description}</div>
                  </div>
                  <Badge tone={def.pane === "main" ? "accent" : "neutral"}>{def.pane === "main" ? "On price" : "Pane"}</Badge>
                  {count > 0 && <Check size={15} className="text-up" />}
                </button>
              );
            })}
            {list.length === 0 && <div className="py-10 text-center text-[13px] text-muted">No indicators match “{q}”</div>}
          </div>
          <div className="hidden min-h-0 overflow-auto border-l border-line p-3 md:block">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">On chart ({active.length})</div>
            {active.length === 0 && <div className="text-xs text-muted">None yet</div>}
            {active.map((a) => (
              <div key={a.id} className="group flex h-8 items-center justify-between rounded-md px-2 text-[13px] hover:bg-hover">
                <span>
                  {a.name}
                  {a.params.length > 0 && <span className="ml-1 text-xs text-faint">({a.params.join(", ")})</span>}
                </span>
                <button onClick={() => onRemove(a.id)} className="text-faint opacity-0 hover:text-down group-hover:opacity-100" aria-label={`Remove ${a.name}`}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function IndicatorSettingsDialog({
  config,
  onClose,
  onSave,
}: {
  config: IndicatorConfig | null;
  onClose: () => void;
  onSave: (params: number[]) => void;
}) {
  const def = config ? indicatorDef(config.name) : undefined;
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    if (config) setValues(config.params.map(String));
  }, [config]);

  if (!config) return null;
  const labels = def?.paramLabels ?? config.params.map((_, i) => `Param ${i + 1}`);
  const valid = values.every((v) => v !== "" && Number.isFinite(Number(v)) && Number(v) > 0);

  return (
    <Modal
      open={!!config}
      onClose={onClose}
      title={`${def?.label ?? config.name} settings`}
      width={380}
      footer={
        <>
          <Button variant="ghost" onClick={() => def && setValues(def.params.map(String))}>
            Reset
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave(values.map(Number))}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-4">
        {values.length === 0 && <div className="text-[13px] text-muted">This indicator has no inputs.</div>}
        {values.map((v, i) => (
          <label key={i} className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-muted">{labels[i] ?? `Param ${i + 1}`}</span>
            <Input
              type="number"
              step="any"
              min={0}
              className="w-28 text-right"
              value={v}
              onChange={(e) => setValues(values.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </label>
        ))}
      </div>
    </Modal>
  );
}
