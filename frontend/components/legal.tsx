import { MarketingHeader, SiteFooter } from "./site-chrome";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <p className="eyebrow">Draft for review</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-ink-3">Last updated {updated}</p>
        <div className="mt-6 border-l-2 border-warn pl-3 text-sm text-ink-2">
          This document describes how the software currently behaves. It has not been reviewed by a lawyer, and the items
          marked <em>to be decided</em> need an owner before any public or commercial deployment.
        </div>
        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-ink-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_p]:mt-2">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
