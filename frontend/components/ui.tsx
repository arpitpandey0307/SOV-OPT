import Link from "next/link";
import type { HealthStatus } from "@/lib/api";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-[#f6f5f1] hover:bg-accent-ink border border-accent",
  secondary: "bg-panel text-ink border border-rule-strong hover:border-ink-3",
  ghost: "text-ink-2 hover:text-ink border border-transparent",
  danger: "bg-panel text-risk border border-rule-strong hover:border-risk",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-[3px] px-4 h-10 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const statusStyle: Record<HealthStatus | "neutral" | "accent", string> = {
  ok: "text-ok bg-ok-wash",
  warn: "text-warn bg-warn-wash",
  risk: "text-risk bg-risk-wash",
  info: "text-info bg-info-wash",
  neutral: "text-ink-2 bg-sunken",
  accent: "text-accent-ink bg-accent-wash",
};

const statusGlyph: Record<string, string> = { ok: "●", warn: "▲", risk: "■", info: "○" };

export function Badge({
  tone = "neutral",
  glyph = false,
  children,
  className = "",
}: {
  tone?: keyof typeof statusStyle;
  glyph?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[2px] px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyle[tone]} ${className}`}
    >
      {glyph && statusGlyph[tone] && (
        <span aria-hidden className="text-[0.6rem] leading-none">
          {statusGlyph[tone]}
        </span>
      )}
      {children}
    </span>
  );
}

export const healthWord: Record<HealthStatus, string> = {
  ok: "Healthy",
  warn: "Watch",
  risk: "At risk",
  info: "Note",
};

export function Stat({
  label,
  value,
  sub,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="tabular mt-1 font-mono text-xl text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="border border-rule bg-panel px-5 py-6">
      <div className="text-sm font-medium text-risk">{title}</div>
      <p className="mt-1 max-w-prose text-sm text-ink-2">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-rule-strong px-5 py-10 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function SectionHeading({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`border border-rule bg-panel ${className}`}>{children}</section>;
}
