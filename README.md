# Aviation Data Review

I built this project to explore a simple question: when a financial data feed has several problems, how does an analyst know which one needs attention first?

A comma in a number and a $500 million balance-sheet mismatch can both make a validation check fail. They should not receive the same response. This application puts the issues that could affect real decisions at the top of the queue, shows what each issue could disrupt, and records what the reviewer decided.

**[Open the live demo](https://nathanm11230.github.io/aviation-data-integrity-console/)**

> **Project note:** This is an independent recruiting project by Nathan Mackey, a Finance and Computer Science student at Case Western Reserve University. It is not an Aerlytix product, a credit rating, an investment recommendation, or a production aviation-finance model. Public SEC figures are combined with clearly labeled synthetic aircraft, lease, loan, fund, and exposure data.

## What the app does

The app follows a practical review workflow across three screens:

- **Review Queue** tells the analyst what needs attention first and why.
- **Data & Reports** shows incoming data changes, validation results, and which reports are ready or on hold.
- **Decision History** keeps the reviewer, explanation, action, and time together in one exportable record.

The goal is not to produce another overall data-quality percentage. It is to help someone answer four useful questions:

1. What is wrong?
2. How important is it?
3. What work depends on it?
4. What did we do about it?

## Try the main workflow

1. Open the live demo and change the scenario from **Clean baseline** to **Sample with issues**.
2. Open the accounting-equation mismatch at the top of the queue.
3. Review the original SEC values, the linked synthetic exposure, and the reports placed on hold.
4. Choose a review action and add an explanation. The app will not accept an undocumented decision.
5. Open **Decision History** to see the action in the audit trail.

The highest-priority sample issue scores **71 / Urgent** because it is a large balance-sheet inconsistency tied to $348.5M of modeled exposure and several downstream outputs. A harmless formatting issue scores **25 / Low**. Both are visible, but the queue makes the difference in urgency clear.

## Why I chose aviation finance

Aviation finance is a good setting for this problem because a single counterparty value can flow into aircraft leases, loans, portfolio views, and investor reporting. A bad source value does not only affect one spreadsheet cell; it can change several decisions downstream.

The project models that dependency chain so the app can hold only the affected outputs. For example, a missing operating cash-flow value holds the lease cash-flow model and the reports built from it, rather than stopping every report in the system.

## What is real and what is synthetic

The distinction matters, so the app makes it visible throughout the interface.

**Public financial data**

- [United Airlines Holdings 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/100517/000010051726000023/0000100517-26-000023-index.htm)
- [Delta Air Lines 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/27904/000002790426000013/0000027904-26-000013-index.htm)
- [American Airlines Group 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/6201/000000620126000014/0000006201-26-000014-index.htm)

The FY2025 company figures come from those SEC filings. The application derives liabilities as `assets - stockholders' equity` when demonstrating the accounting-equation check.

**Synthetic demonstration data**

- Aircraft, leases, loans, funds, and portfolio relationships
- Exposure amounts and downstream reporting dependencies
- FY2024 comparison values
- Feed errors, schema changes, and review scenarios

None of the synthetic relationships represent a real Aerlytix portfolio or a claim about the three airlines.

## How review priority works

The **Review Priority Score** is a deterministic workflow score from 0 to 100. It is not a credit score, probability of default, or AI prediction. Every point is visible in the interface.

| Factor | What it asks |
| --- | --- |
| Severity | How serious is this type of validation failure? |
| Data criticality | Is the affected field important to a decision? |
| Materiality | How large is the discrepancy relative to the source value? |
| Linked exposure | How much synthetic exposure depends on the record? |
| Downstream impact | How many models or reports use the value? |
| Recency | Is this part of the latest feed? |
| Confidence | How certain is the control that this is a real issue? |
| Regulatory relevance | Could the field affect formal reporting? |

The stored score bands are `Critical`, `High`, `Medium`, and `Low`. The interface labels the top band **Urgent** to make the required action clearer to a reviewer.

## Review behavior

- Corrections and quarantines do not overwrite the incoming source record.
- Original evidence remains visible after an issue is cleared.
- Rejected values continue to block affected outputs.
- Reopening a decision restores the original data and runs the controls again.
- Each decision requires an explanation and is added to the local audit history.
- CSV exports protect against spreadsheet-formula injection.

## Run it locally

You will need Node.js 20 or newer.

```bash
git clone https://github.com/NathanM11230/aviation-data-integrity-console.git
cd aviation-data-integrity-console
npm install
npm run dev
```

Vite will print the local address in the terminal, usually `http://localhost:5173/aviation-data-integrity-console/`.

Other useful commands:

```bash
npm run build       # type-check and create a production build
npm run preview     # preview the production build
npm run typecheck   # run TypeScript checks
npm test            # run 108 unit tests
npm run test:e2e    # run 14 browser tests
```

The first browser-test run may also need `npx playwright install chromium`.

## How it is built

The project uses React, TypeScript, Zustand, Vite, Vitest, and Playwright. It is a static single-page application with no backend, API keys, or authentication.

The important design choice is that the interface does not calculate risk or decide whether a report is blocked. A synchronous domain engine takes the source data and review decisions, reruns every control, and returns the complete derived state:

```text
source data + review decisions
              |
              v
    normalize -> validate -> trace dependencies -> score -> block outputs
              |
              v
          interface and exports
```

That keeps the same rule from being implemented differently in the queue, reports page, and audit history. More detail is available in [the architecture decision record](docs/adr-001-architecture.md).

## Tests

The project currently has **108 unit tests** and **14 Playwright tests**.

The unit tests cover validation rules, score calculations, dependency tracing, report blocking, schema-drift detection, review actions, CSV parsing, exports, persistence, and all demonstration cases. The browser tests cover the main analyst workflow, mobile layouts, state reloads, CSV rejection, reviewer actions, console errors, and horizontal overflow at desktop and phone sizes.

## Privacy and limitations

- Imported CSV data and review history stay in the browser using `localStorage`.
- `localStorage` can be edited through browser developer tools, so the audit trail is not tamper-proof.
- There is no sign-in, access control, assignment queue, or multi-user conflict handling.
- The sample contains three counterparties and one reporting period, so its plausibility thresholds are demonstrations rather than calibrated production limits.
- Exposure is a synthetic sum of connected records, not an estimate of economic loss.
- Rename detection uses field-name similarity and data types, so an unrelated abbreviation may still need manual mapping.
- Do not import confidential or personal information into the public demo.

## What I would build next

1. A server-side audit trail with authenticated reviewers and tamper-evident events.
2. Real ingestion from SEC EDGAR and scheduled provider files.
3. Thresholds calibrated from historical data by field and counterparty.
4. An in-app mapping tool for reviewing and approving schema changes.
5. Assignment, service-level tracking, and separation between the analyst who proposes a correction and the reviewer who approves it.

## Deployment

Pushing to `main` runs the GitHub Actions workflow in `.github/workflows/deploy.yml` and publishes the production build to GitHub Pages. The app uses hash-based routes so direct links continue to work on a static host.
