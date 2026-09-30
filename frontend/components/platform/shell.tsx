"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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
              className={`block rounded-[3px] px-3 py-1.5 text-sm ${
                active ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {n.label}
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
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-rule px-3 py-5 lg:flex">
        <Link href="/" className="px-3 text-[15px] font-semibold tracking-tight text-ink">
          SOV-OPT
        </Link>
        <nav aria-label="Workspace" className="mt-8 flex-1">
          <NavLinks />
        </nav>
        <div className="border-t border-rule px-3 pt-4">
          <EngineStatus />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-paper/95 px-4 backdrop-blur-sm lg:hidden">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">
          SOV-OPT
        </Link>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="h-9 rounded-[3px] border border-rule-strong px-3 text-sm text-ink">Menu</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
            <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-rule bg-paper p-5 focus:outline-none">
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-sm font-semibold">Workspace</Dialog.Title>
                <Dialog.Close className="h-9 rounded-[3px] px-2 text-sm text-ink-2 hover:text-ink">Close</Dialog.Close>
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
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
