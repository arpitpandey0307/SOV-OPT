# SOV-OPT web

Next.js (App Router) interface for the SOV-OPT control plane.

```bash
npm install
npm run dev          # http://localhost:3000
```

The app expects the API at `http://localhost:8000` (see `backend/README.md`). Override with:

```bash
NEXT_PUBLIC_API_URL=http://host:8000 npm run dev
```

## Structure

```text
app/
  page.tsx                   landing page
  (platform)/                workspace (sidebar layout)
    overview/                workspace summary
    models/                  catalog, upload
    models/[collection]/[name]  Model Studio: structure, health, runs
    runs/                    run list
    runs/[id]/               Run Center: live progress, timeline, numerics, GPU, evidence
    benchmarks/              suites compared against published references
    system/                  GPU observatory (live nvidia-smi telemetry)
  terms/, privacy/           drafts for review
components/
  views/                     one client view per page
  platform/                  shell, run table, new-run dialog
  charts/                    ECharts wrapper, coefficient histogram
  sparsity-plot.tsx          canvas sparsity pattern with hover inspection
lib/
  api.ts                     typed API client
  use-run-stream.ts          resumable SSE subscription
  format.ts                  number and label formatting
```

## Design

Warm paper background (`--paper`), near-black ink, one ink-blue accent (`--accent`), IBM Plex Sans and
Mono, hairline rules and 2 to 4 px corners. Tokens live in `app/globals.css`. Charts use a validated
two-series palette (`--series-1`, `--series-2`) and one axis per chart.
