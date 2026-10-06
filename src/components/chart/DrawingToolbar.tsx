"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Brush,
  Circle,
  Eye,
  EyeOff,
  Lock,
  LockKeyholeOpen,
  Magnet,
  MessageSquare,
  Minus,
  MousePointer2,
  MoveRight,
  Rows3,
  Ruler,
  SeparatorVertical,
  Slash,
  Square,
  Tag,
  TextAlignJustify,
  Trash,
  TrendingUp,
  Triangle,
  Type,
  type LucideIcon,
} from "lucide-react";
import { TOOL_LABELS, type DrawingTool, type MagnetMode } from "./catalog";
import { cn } from "../ui/primitives";

const TOOL_ICONS: Record<DrawingTool, LucideIcon> = {
  segment: TrendingUp,
  rayLine: ArrowUpRight,
  straightLine: Slash,
  pt_arrow: MoveRight,
  horizontalStraightLine: Minus,
  horizontalRayLine: MoveRight,
  horizontalSegment: Minus,
  verticalStraightLine: SeparatorVertical,
  priceLine: Tag,
  parallelStraightLine: Rows3,
  priceChannelLine: Rows3,
  fibonacciLine: TextAlignJustify,
  pt_rect: Square,
  pt_circle: Circle,
  pt_triangle: Triangle,
  pt_text: Type,
  simpleAnnotation: MessageSquare,
  simpleTag: Tag,
  brush: Brush,
  pt_measure: Ruler,
};

const GROUPS: { id: string; tools: DrawingTool[] }[] = [
  { id: "lines", tools: ["segment", "rayLine", "straightLine", "pt_arrow"] },
  { id: "hv", tools: ["horizontalStraightLine", "horizontalRayLine", "horizontalSegment", "verticalStraightLine", "priceLine"] },
  { id: "channels", tools: ["parallelStraightLine", "priceChannelLine"] },
  { id: "fib", tools: ["fibonacciLine"] },
  { id: "shapes", tools: ["pt_rect", "pt_circle", "pt_triangle"] },
  { id: "text", tools: ["pt_text", "simpleAnnotation", "simpleTag"] },
  { id: "brush", tools: ["brush"] },
  { id: "measure", tools: ["pt_measure"] },
];

const MAGNET_LABEL: Record<MagnetMode, string> = {
  normal: "Magnet off",
  weak_magnet: "Weak magnet",
  strong_magnet: "Strong magnet",
};

export function DrawingToolbar({
  activeTool,
  onTool,
  magnet,
  onMagnet,
  locked,
  onLocked,
  visible,
  onVisible,
  onClear,
}: {
  activeTool: DrawingTool | null;
  onTool: (t: DrawingTool | null) => void;
  magnet: MagnetMode;
  onMagnet: (m: MagnetMode) => void;
  locked: boolean;
  onLocked: (v: boolean) => void;
  visible: boolean;
  onVisible: (v: boolean) => void;
  onClear: () => void;
}) {
  const [current, setCurrent] = useState<Record<string, DrawingTool>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.id, g.tools[0]])),
  );
  const [flyout, setFlyout] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flyout) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setFlyout(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [flyout]);

  const nextMagnet: Record<MagnetMode, MagnetMode> = { normal: "weak_magnet", weak_magnet: "strong_magnet", strong_magnet: "normal" };

  return (
    <div ref={ref} className="flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-y-auto overflow-x-visible border-r border-line bg-panel py-1.5">
      <ToolButton title="Cursor" active={!activeTool} onClick={() => onTool(null)}>
        <MousePointer2 size={16} />
      </ToolButton>
      <div className="my-1 h-px w-6 bg-line" />
      {GROUPS.map((g) => {
        const tool = current[g.id];
        const Icon = TOOL_ICONS[tool];
        const groupActive = activeTool != null && g.tools.includes(activeTool);
        return (
          <div key={g.id} className="relative">
            <ToolButton
              title={TOOL_LABELS[tool]}
              active={groupActive}
              onClick={() => onTool(groupActive ? null : tool)}
              onContextMenu={(e) => {
                if (g.tools.length > 1) {
                  e.preventDefault();
                  setFlyout(flyout === g.id ? null : g.id);
                }
              }}
            >
              <Icon size={16} className={cn(tool === "horizontalSegment" && "scale-x-75", tool === "priceChannelLine" && "rotate-12")} />
            </ToolButton>
            {g.tools.length > 1 && (
              <button
                aria-label="More tools"
                title="More tools"
                onClick={() => setFlyout(flyout === g.id ? null : g.id)}
                className="absolute bottom-0.5 right-0 flex h-3 w-3 items-end justify-end text-faint hover:text-fg"
              >
                <svg width="5" height="5" viewBox="0 0 5 5" aria-hidden>
                  <path d="M5 0v5H0z" fill="currentColor" />
                </svg>
              </button>
            )}
            {flyout === g.id && (
              <div className="toast-in absolute left-full top-0 z-50 ml-1.5 w-48 rounded-lg border border-line bg-panel p-1 shadow-pop">
                {g.tools.map((t) => {
                  const TIcon = TOOL_ICONS[t];
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        setCurrent({ ...current, [g.id]: t });
                        setFlyout(null);
                        onTool(t);
                      }}
                      className={cn(
                        "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] hover:bg-hover",
                        activeTool === t && "bg-accent-soft text-accent",
                      )}
                    >
                      <TIcon size={15} className="text-muted" />
                      {TOOL_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="my-1 h-px w-6 bg-line" />
      <ToolButton title={MAGNET_LABEL[magnet]} active={magnet !== "normal"} onClick={() => onMagnet(nextMagnet[magnet])}>
        <Magnet size={16} className={cn(magnet === "strong_magnet" && "stroke-[2.6]")} />
      </ToolButton>
      <ToolButton title={locked ? "Unlock drawings" : "Lock drawings"} active={locked} onClick={() => onLocked(!locked)}>
        {locked ? <Lock size={16} /> : <LockKeyholeOpen size={16} />}
      </ToolButton>
      <ToolButton title={visible ? "Hide drawings" : "Show drawings"} active={!visible} onClick={() => onVisible(!visible)}>
        {visible ? <Eye size={16} /> : <EyeOff size={16} />}
      </ToolButton>
      <ToolButton title="Remove all drawings" onClick={onClear}>
        <Trash size={16} />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  active,
  title,
  children,
  onClick,
  onContextMenu,
}: {
  active?: boolean;
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}
