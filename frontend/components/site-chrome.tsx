import Link from "next/link";
import { ButtonLink } from "./ui";

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="sovopt-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a3c" />
          <stop offset="0.45" stopColor="#ff4d8d" />
          <stop offset="0.75" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M16 2 28 9v14l-12 7-12-7V9z" fill="none" stroke="url(#sovopt-g)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M8 21 13 13l5 5 6-9" fill="none" stroke="url(#sovopt-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="9" r="2.2" fill="#ff9a3c" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 text-ink ${className}`} aria-label="SOV-OPT home">
      <LogoMark />
      <span className="text-[16px] font-semibold tracking-tight">
        SOV<span className="text-gradient">-OPT</span>
      </span>
    </Link>
  );
}

const nav = [
  { href: "/models", label: "Models" },
  { href: "/runs", label: "Runs" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/system", label: "GPU" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#060913]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Wordmark />
        <nav aria-label="Primary" className="hidden items-center gap-1 text-sm text-ink-2 md:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-4 py-1.5 transition-colors hover:bg-white/5 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <ButtonLink href="/overview" className="h-9 px-4 text-[13px]">
          Launch workspace
        </ButtonLink>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/10">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#7c5cff,#22d3ee,transparent)]" />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 text-sm sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-md">
          <Wordmark />
          <p className="mt-3 text-ink-3">
            Built for Smart India Hackathon 2026, problem statement 26119, posed by Mangalore Refinery and Petrochemicals
            Limited.
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
