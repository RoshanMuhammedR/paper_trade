"use client";

import { useEffect } from "react";
import { initLocalState, openSearch, useApp } from "@/store/app";
import { bootstrap } from "@/store/data";
import { useOrderSync, useQuotePolling } from "@/store/polling";
import { TopBar } from "./TopBar";
import { SymbolSearch } from "./SymbolSearch";
import { Toaster } from "./ui/Toaster";
import { Spinner } from "./ui/primitives";

export function AppShell({ children }: { children: React.ReactNode }) {
  const ready = useApp((s) => s.ready);
  const focus = useApp((s) => s.focusMode);

  useEffect(() => {
    initLocalState();
    void bootstrap();
  }, []);

  useQuotePolling();
  useOrderSync();

  // Ctrl/Cmd+K or "/" opens search; typing a letter on the chart opens it pre-filled
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch("chart");
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || useApp.getState().searchOpen) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "/") {
        e.preventDefault();
        openSearch("chart");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {!focus && <TopBar />}
      <main className="relative min-h-0 flex-1">
        {ready ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-muted">
            <Spinner /> Loading your account…
          </div>
        )}
      </main>
      <SymbolSearch />
      <Toaster />
    </div>
  );
}
