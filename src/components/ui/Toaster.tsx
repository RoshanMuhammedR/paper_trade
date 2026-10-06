"use client";

import { CircleCheck, Info, CircleX, TriangleAlert, X } from "lucide-react";
import { create } from "zustand";
import { cn } from "./primitives";

type Tone = "success" | "error" | "info" | "warn";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-4), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.tone === "error" ? 7000 : 4500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (title: string, body?: string) => useToasts.getState().push({ tone: "success", title, body }),
  error: (title: string, body?: string) => useToasts.getState().push({ tone: "error", title, body }),
  info: (title: string, body?: string) => useToasts.getState().push({ tone: "info", title, body }),
  warn: (title: string, body?: string) => useToasts.getState().push({ tone: "warn", title, body }),
};

const ICONS = { success: CircleCheck, error: CircleX, info: Info, warn: TriangleAlert };

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} className="toast-in pointer-events-auto flex gap-3 rounded-lg border border-line bg-panel p-3 shadow-pop" role="status">
            <Icon
              size={18}
              className={cn(
                "mt-0.5 shrink-0",
                t.tone === "success" && "text-up",
                t.tone === "error" && "text-down",
                t.tone === "info" && "text-accent",
                t.tone === "warn" && "text-warn",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{t.title}</div>
              {t.body && <div className="mt-0.5 text-xs text-muted">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
