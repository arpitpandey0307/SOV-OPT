"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { api } from "@/lib/api";
import { Wordmark } from "@/components/site-chrome";

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/models", label: "Models" },
  { href: "/runs", label: "Runs" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/system", label: "System" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`relative block rounded-xl px-3 py-2 text-sm transition-colors ${
                active ? "font-semibold text-white" : "text-ink-2 hover:bg-white/5 hover:text-ink"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={onNavigate ? "nav-pill-mobile" : "nav-pill"}
                  className="absolute inset-0 rounded-xl bg-[linear-gradient(120deg,rgba(255,154,60,0.35),rgba(124,92,255,0.45),rgba(34,211,238,0.35))] shadow-[0_0_24px_-6px_rgba(124,92,255,0.8)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative">{n.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function EngineStatus() {
  const q = useQuery({ queryKey: ["system"], queryFn: api.system, refetchInterval: 5000 });
  if (q.isError) {
    return (
      <div className="text-xs">
        <div className="flex items-center gap-2 text-risk">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-risk" />
          Service unreachable
        </div>
        <p className="mt-1 text-ink-3">Start the control plane on port 8000.</p>
      </div>
    );
  }
  const s = q.data;
  return (
    <div className="text-xs text-ink-3">
      <div className="flex items-center gap-2 text-ink-2">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s ? "bg-ok" : "bg-rule-strong"}`} />
        {s ? `Engine ${s.solver_version} online` : "Connecting"}
      </div>
      {s && (
        <div className="mt-1.5 space-y-0.5">
          <div className="truncate" title={s.gpus[0]?.name}>
            {s.gpus[0]?.name.replace("NVIDIA GeForce ", "") ?? "No GPU detected"}
          </div>
          <div>
            {s.active_runs} active {s.active_runs === 1 ? "run" : "runs"}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-white/10 bg-white/[0.02] px-3 py-5 backdrop-blur-xl lg:flex">
        <Wordmark className="px-3" />
        <nav aria-label="Workspace" className="mt-8 flex-1">
          <NavLinks />
        </nav>
        <div className="border-t border-rule px-3 pt-4">
          <EngineStatus />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-[#060913]/80 px-4 backdrop-blur-xl lg:hidden">
        <Wordmark />
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="h-9 rounded-lg border border-rule-strong px-3 text-sm text-ink">Menu</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
            <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-white/10 bg-[#0a0f22] p-5 focus:outline-none">
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-sm font-semibold">Workspace</Dialog.Title>
                <Dialog.Close className="h-9 rounded-lg px-2 text-sm text-ink-2 hover:text-ink">Close</Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">Workspace navigation</Dialog.Description>
              <nav aria-label="Workspace" className="mt-6 flex-1">
                <NavLinks onNavigate={() => setOpen(false)} />
              </nav>
              <div className="border-t border-rule pt-4">
                <EngineStatus />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {description && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
