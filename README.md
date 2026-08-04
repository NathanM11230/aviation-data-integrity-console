# Aviation Data Reliability Control Plane

An independent recruiting prototype by **Nathan Mackey**, Finance and Computer Science, Case Western Reserve University.

> This is not an Aerlytix product, a credit rating, an investment recommendation, or a production aviation-finance model. It uses public SEC filing data and a clearly labeled **synthetic** portfolio of aircraft, leases, loans, and funds.

---

## The problem

Aviation-finance teams do not lack dashboards that report a validation percentage. They lack a way to answer the question that actually blocks work:

> A counterparty data feed changed. Which problems deserve attention first, what do they put at risk downstream, which outputs must be held, and can a reviewer document a defensible decision?

A validation suite that reports "94% of checks passed" is useless when the 6% includes a $500 million balance-sheet mismatch on a lessee backing $348.5M of modeled exposure — and equally useless when the 6% is a comma in a number that parsed cleanly. Both are "failures". Only one should stop a report.

This application ranks exceptions by **potential decision impact**, explains the ranking, traces every affected downstream consumer, blocks only the outputs that are actually compromised, and preserves an append-only record of who decided what and why.

## Intended users

| User | What they do here |
| --- | --- |
| Data implementation analyst | Triage a new feed version, see what schema drift broke, decide whether a load may proceed |
| Portfolio / risk analyst | See which counterparties, leases, loans, and models are affected and how much modeled exposure is in doubt |
| Reporting owner | See which reports are held and exactly which exception is holding them |
| Auditor | Read an append-only trail of decisions, reasons, reviewers, and timestamps, and export it |

## Why it is useful

1. **Prioritisation is explained, not asserted.** Every exception carries a 0–100 Review Priority Score with all eight factor contributions shown on screen. No opaque "AI risk score".
2. **Impact is concrete.** An exception names the aircraft, leases, loans, portfolios, models, and reports downstream of the affected value, and the modeled exposure attached to them.
3. **Blocking is surgical.** A missing `operatingCashFlow` blocks the Lease Cash Flow Model and the reports built on it — not the whole publication run.
4. **Evidence survives decisions.** Corrections and quarantines never overwrite the incoming feed. A finding cleared by a review action stays visible, marked *no longer detected*, with its original evidence intact.

---

## Architecture

A single-page React application with a strict separation between the deterministic engine and the presentation layer. No backend, no API keys, no authentication — it deploys as a static GitHub Pages site.

```
src/
  domain/types.ts        Domain model + persistence interface (no logic)
  data/                  SEC figures, synthetic portfolio, sample feed versions
  engine/
    normalize.ts         Mapping, coercion, duplicate/stale exclusion
    rules.ts             16 validation controls → structured exceptions
    drift.ts             Schema + distribution drift between two versions
    dependencies.ts      Impact traversal, exposure, blocked-output recalculation
    scoring.ts           Review Priority Score (documented formula)
    csv.ts               Strict CSV parsing and rejection
    pipeline.ts          Orchestration: ingest → … → publish/quarantine
  state/
    persistence.ts       PersistenceAdapter (localStorage / in-memory)
    store.ts             Zustand store: decisions, corrections, audit
  ui/                    Presentation only; no validation logic
```

The engine is pure and synchronous: `runPipeline(feed, published, corrections, decisions, quarantines)` returns the entire application state. The UI never computes a verdict; it renders one. That is why 88 unit tests can cover the product logic without rendering a component.

**Data flow:** `Ingest → Normalize → Validate → Determine dependencies → Score → Human decision → Publish or quarantine → Audit`

Decisions and corrections are stored, not derived state. Exceptions, scores, impact, and blocked outputs are recomputed deterministically on every change, so the same inputs always produce the same queue.

### Why this architecture (ADR)

See [`docs/adr-001-architecture.md`](docs/adr-001-architecture.md).

## Data model

Real (public SEC EDGAR company facts, FY2025 10-K): **Counterparty** financials for UAL, DAL, AAL.

Synthetic (invented for demonstration, labeled throughout the UI):

| Entity | Count | Notes |
| --- | --- | --- |
| Aircraft | 12 | Fictional registrations `N901XA`–`N912XA`, serials `SYN-11xx` |
| Lease | 12 | 4 per airline, split across the two funds |
| Loan | 4 | Secured on specific aircraft |
| Portfolio | 2 | Narrowbody Fund I, Widebody Credit Fund |
| Analytical model | 3 | Credit Screen, Lease Cash Flow, Collateral Coverage |
| Report | 4 | 3 required, 1 optional |

Total modeled exposure is **$1.13B** (aircraft market value on lease $876.5M + loan balances $255M). Per-counterparty: UAL $355.5M, DAL $427.5M, AAL $348.5M.

Also modeled explicitly: source system, source record, data version, normalized field value, validation rule, validation exception, dependency, review decision, audit event.

> **Synthetic-data disclosure.** No aircraft, registration, serial number, lease, loan, portfolio, model, report, or exposure figure in this application is real. They exist to demonstrate downstream impact traversal. Only the three counterparties and their filed financial statements are real.

## Validation approach

Sixteen controls, each producing a structured result: rule id, plain-English explanation, expected condition, observed value, source record and version, severity, affected normalized field, and a recommended reviewer action.

| Rule | Severity | Blocking |
| --- | --- | --- |
| `missing_required_field` | high | yes |
| `invalid_type` | high (medium if recoverable) | yes (no if recoverable) |
| `invalid_currency` | high | yes |
| `unexpected_unit_multiplier` | critical | yes |
| `accounting_equation` | critical | yes |
| `duplicate_source_record` | medium | no |
| `stale_data` | high | no |
| `filing_before_period_end` | high | yes |
| `unexpected_period` | medium | no |
| `implausible_change` | high | no |
| `schema_field_removed` | high | yes |
| `schema_field_renamed` | high | no |
| `schema_field_type_changed` | high | yes |
| `schema_unit_changed` | critical | yes |
| `unmapped_field` | low | no |
| `broken_dependency` | high | yes |

Notable behaviours:

- A numeric arriving as `"5,942,000,000"` is **recovered** by the parser and downgraded to medium/non-blocking — the value is not in doubt, the format is. An unparseable string stays high and blocking.
- Duplicate and stale records are **excluded from normalization** rather than silently merged, and the exclusion is reported as an exception.
- A ×1000 magnitude shift against the published version is classified as a unit-multiplier error rather than an implausible change, because the remediation differs.

## Review Priority Score

Deterministic, 0–100, **a workflow priority — not a credit rating or probability of default.** Implemented in `src/engine/scoring.ts` and shown factor-by-factor whenever an exception is opened.

| Factor | Max | Basis |
| --- | --- | --- |
| Validation severity | 25 | critical 25 · high 18 · medium 10 · low 4 |
| Financial materiality | 20 | ≥$250M → 20 · ≥$50M → 15 · ≥$10M → 10 · ≥$1M → 5 · >0 → 2 |
| Linked synthetic exposure | 15 | `round(counterparty exposure ÷ $1.13B × 15)` |
| Downstream dependencies | 10 | `round(min(1, dependents ÷ 20) × 10)` |
| Blocked required outputs | 10 | blocks a required model/report → 10 · blocks other outputs → 6 · non-blocking → 0 |
| Propagation | 10 | feed-wide 10 · counterparty 6 · single record 2 |
| Data freshness | 5 | stale or off-cycle period → 5 |
| Source confidence | 5 | `round((1 − source confidence) × 5)`; SEC 0.95, CSV upload 0.70 |

**Bands:** Critical ≥ 65 · High ≥ 45 · Medium ≥ 30 · Low < 30.

Structural schema findings (rename, removal, type change, unmapped, broken mapping) score **zero** materiality: they change no values, so a magnitude-based score would be meaningless.

Worked example — the $500M mismatch scores **71 (Critical)**: severity 25 + materiality 20 + exposure 5 + dependencies 9 + blocked 10 + propagation 2 + freshness 0 + source 0. The formatted-string cash issue scores **25 (Low)**. That 46-point gap is the product's core claim.

## Demonstration cases

Switch the **Dataset** selector to *Mar 2026 resubmission (issues)*:

| # | Case | Result |
| --- | --- | --- |
| 1 | UAL cash becomes a formatted string | `invalid_type`, recovered, **Low 25** |
| 2 | DAL currency becomes EUR, no conversion record | `invalid_currency`, counterparty-wide, **Critical 69** |
| 3 | AAL current assets missing | `missing_required_field`, **High 64** |
| 4 | AAL liabilities overstated by exactly $500M | `accounting_equation`, **Critical 71** |
| 5 | `operatingIncome` renamed to `operating_profit` | `schema_field_renamed` **High 53** + `broken_dependency` **High 63** |
| 6 | Monetary field switches units → thousands | `unexpected_unit_multiplier` ×3, **Critical 69–70** |
| 7 | Duplicate source record submitted | `duplicate_source_record`, excluded, **Low 27** |
| 8 | Stale FY2024 period tries to overwrite FY2025 | `stale_data`, overwrite prevented, **Medium 39** |

The clean baseline produces **zero exceptions** and leaves all four reports eligible.

## Public data sources

- **SEC EDGAR company facts (XBRL)** — FY2025 10-K figures for United Airlines (UAL), Delta Air Lines (DAL), American Airlines (AAL): revenue, operating income, net income, operating cash flow, cash, current assets, current liabilities, assets, liabilities, equity. `liabilities` is derived as `Assets − StockholdersEquity` and reconciled.
- FY2024 comparatives used for period-over-period plausibility checks are **synthetic constructed baselines**, not filed figures, and are labeled as such in `src/data/feeds.ts`.

## Privacy and security limitations

- Everything runs in the browser. Imported CSVs are parsed locally and **never uploaded** — there is no server to upload to.
- Session state (decisions, corrections, quarantines, audit log) is stored in `localStorage`, which is **not encrypted** and is readable by anything with access to the browser profile. Do not import confidential data.
- The audit log is append-only *from the application's perspective*: nothing in the UI edits or deletes an event. It is not tamper-proof — a user with devtools can edit `localStorage` directly. Production use would need a server-side append-only store with authenticated actors.
- There is no authentication. The "Reviewer" field is a self-declared label, not an identity.

## Local development

```bash
npm install
npm run dev          # http://localhost:5173/aviation-data-integrity-console/
```

```bash
npm run build        # typecheck + production build to dist/
npm run preview      # serve the production build on :4173
npm run typecheck    # tsc -b, strict mode
```

## Testing

```bash
npm test             # 88 unit tests (Vitest)
npm run test:e2e     # 9 end-to-end tests (Playwright); builds and serves automatically
```

First e2e run needs the browser binary: `npx playwright install chromium`.

Unit tests cover every validation rule, score calculation and band boundaries, materiality banding, dependency traversal, blocked-output recalculation, schema-drift detection, review-action requirements, append-only audit behaviour, CSV parsing and rejection, persistence and reload, the clean baseline, and all eight demonstration cases.

End-to-end tests cover the full required journey — switch to the issue dataset, investigate the $500M mismatch, view downstream exposure, quarantine the record, be refused without a reason, confirm the audit event, confirm reports stay blocked, correct the value, re-validate, and confirm publication becomes eligible — plus drift review, lineage traversal, CSV rejection, console-error checks, and horizontal-overflow checks at 1440×900 and 390×844.

## Deployment (GitHub Pages)

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes `dist/` to Pages. Enable it once under **Settings → Pages → Source → GitHub Actions**.

The Vite `base` is `/aviation-data-integrity-console/`, matching the repository name. Routing uses the URL hash (`#/queue/...`), so reloading a deep route works on Pages without a rewrite rule or 404 fallback.

## Five-minute demonstration script

1. **Start clean (30s).** Default view, clean baseline: zero exceptions, all four reports eligible. This is what a good day looks like.
2. **Break it (30s).** Switch Dataset → *Mar 2026 resubmission (issues)*. Eleven exceptions appear, ranked. All four reports go blocked.
3. **The core claim (60s).** Top row is the $500M accounting-equation mismatch at **71 Critical**; bottom row is a formatting issue at **25 Low**. Open the top one and walk the eight score factors — materiality 20/20, blocked outputs 10/10 — then the formatting one, where materiality is 0 because the parser recovered the exact published value.
4. **Impact (60s).** In the mismatch panel: $348.5M modeled exposure, 18 dependent entities, the specific reports held. Click a chip through to Lineage & Impact and trace AAL → leases → aircraft → funds → models → reports.
5. **Drift (45s).** Data Feeds → compare Feb baseline against Mar resubmission. The `operatingIncome` → `operating_profit` rename is detected with a token-overlap explanation, the affected mapping, the models and reports it breaks, and a **Quarantine** disposition.
6. **Decide (60s).** Back in the queue, quarantine the duplicate record with no reason — refused. Add a reason, record it. The row stays, marked *no longer detected*, evidence intact.
7. **Prove it (45s).** Reviews & Audit: the decision and quarantine as separate sequenced events with reviewer and timestamp. Export the audit log. Reload the page — everything persists.

## Current limitations

- Three counterparties and one reporting period. Period-over-period checks compare against a single published baseline rather than a real time series.
- The FY2024 comparatives are synthetic, so plausibility thresholds are demonstrative rather than calibrated.
- Rename detection uses token overlap plus a type match. It explains its confidence but will not catch a rename that shares no tokens (`operatingIncome` → `opInc`).
- Corrections apply to feeds whose incoming and normalized field names match. A renamed field is resolved by mapping review, not by correcting a value.
- Quarantine is not reversible in the UI; releasing a quarantined record requires a session reset.
- Exposure is a static synthetic sum, not a valuation model. It measures *what is attached to the affected data*, not economic loss.
- Single-user. There is no assignment queue, notification, or concurrent-reviewer conflict handling.

## Credible next steps for production

1. **Server-side append-only audit** with authenticated actors and hash-chained events, so the trail is defensible rather than merely append-only by convention.
2. **Replace `LocalStoragePersistence`** with an API-backed adapter — the `PersistenceAdapter` interface already isolates every call site.
3. **Real feed connectors** (SEC EDGAR submissions API, provider SFTP drops) with scheduled ingestion and version pinning, replacing the sample-feed selector.
4. **Calibrated thresholds** — derive the 40% plausibility band and materiality bands from historical distributions per field and counterparty instead of fixed constants.
5. **Mapping management UI** so a rename can be resolved by editing the mapping in-app, with the mapping change itself versioned and audited.
6. **Reviewer identity and workload routing** — real assignment, SLAs on Critical items, and segregation of duties between the analyst who corrects and the reviewer who approves.
