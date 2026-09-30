import Link from "next/link";
import { ButtonLink } from "./ui";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-baseline gap-1.5 text-ink ${className}`} aria-label="SOV-OPT home">
      <span className="text-[15px] font-semibold tracking-tight">SOV-OPT</span>
    </Link>
  );
}

const nav = [
  { href: "/models", label: "Models" },
  { href: "/runs", label: "Runs" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/system", label: "System" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Wordmark />
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-ink-2 md:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <ButtonLink href="/overview" className="h-8 px-3 text-[13px]">
          Open workspace
        </ButtonLink>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-md">
          <div className="font-semibold text-ink">SOV-OPT</div>
          <p className="mt-2 text-ink-3">
            Built for Smart India Hackathon 2026, problem statement 26119, posed by Mangalore Refinery and
            Petrochemicals Limited.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-ink-2">
          <Link href="/overview" className="hover:text-ink">Workspace</Link>
          <Link href="/benchmarks" className="hover:text-ink">Benchmarks</Link>
          <a href="https://github.com/arpitpandey0307/SOV-OPT" className="hover:text-ink">Source</a>
          <Link href="/terms" className="hover:text-ink">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy Policy</Link>
        </nav>
      </div>
    </footer>
  );
}
