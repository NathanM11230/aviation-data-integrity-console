# ADR 001 — Architecture proportionate to a recruiting prototype

**Status:** Accepted · **Date:** 2026-08-03

## Context

The prototype had to support a complete operational workflow — ingest, normalize, validate, resolve dependencies, score, decide, block or publish, audit — while deploying as a static GitHub Pages site with no backend, no paid service, and no secrets. It also has a second audience: a recruiter or engineer reading the source to judge whether the author can structure a non-trivial application.

Those two goals pull in opposite directions. Enterprise scaffolding (a service layer, a database, a message queue, a rules DSL) would demonstrate vocabulary but not judgement, and none of it can run on Pages.

## Decision

**React + TypeScript (strict) + Vite, with a pure synchronous engine and a thin presentation layer.**

1. **The engine is pure and framework-free.** `runPipeline(feed, published, corrections, decisions, quarantines)` takes plain data and returns the complete derived state. It imports nothing from React.
2. **Decisions are stored; everything else is derived.** Only reviewer actions — decisions, corrections, quarantines, the audit log — are persisted. Exceptions, scores, impact, and blocked outputs are recomputed on every render from those inputs.
3. **Zustand for UI state**, not Redux. One store, no middleware, no action constants.
4. **`PersistenceAdapter` interface** with a `localStorage` implementation and an in-memory one for tests.
5. **Hash routing**, not a history-API router.
6. **No component test framework.** Product logic is tested directly against the engine; behaviour that only exists in the browser is tested with Playwright.

## Rationale

**Purity over layering.** The valuable claim in this product is that priority is deterministic and explainable. A pure engine makes that claim testable: 88 unit tests exercise every rule, boundary, and demonstration case in ~0.5s with no DOM and no mocks. Adding a service/repository layer between the UI and the engine would add indirection without adding a seam anyone would use.

**Derived state prevents a class of bug that matters here.** If exception status were stored alongside decisions, a correction could leave a stale "open" flag on a finding the data no longer trips — precisely the silent inconsistency an audit-oriented tool must not have. Recomputing everything makes divergence structurally impossible. The cost is recomputation on each render; the pipeline runs on 5 records and 16 rules, so it is immaterial. A `selectRun` cache keyed on input identity keeps re-renders cheap.

**Zustand over Redux.** The store holds four arrays and eight actions. Redux Toolkit would triple the ceremony for the same behaviour.

**The persistence interface is the one piece of "unnecessary" abstraction, and it earns its place.** It is what makes "replace local persistence with an API later" a real claim rather than an aspiration — the store never touches `localStorage` directly, and the test suite already proves the seam works by running the entire persistence-and-reload test against a second implementation.

**Hash routing** because GitHub Pages serves static files with no rewrite rules. Path routing would 404 on reload of `/queue/EX|...`, which the verification checklist explicitly requires to work. The hash also carries the selected exception id, so an investigation is a shareable link.

**No jsdom component tests.** Component tests here would mostly assert that props render, while the behaviour worth protecting is either engine logic (covered by unit tests) or genuine browser behaviour — layout overflow, persistence across reload, focus, console errors — which jsdom cannot judge. Playwright covers the second category honestly.

## Consequences

- Adding a validation rule means editing `rules.ts` and adding a test. No UI change is required for it to appear in the queue, be scored, and block the right outputs.
- The engine can be lifted into a Node service unchanged if the product ever needs server-side validation.
- Recomputation is O(records × rules) per state change. That is fine at this scale and would need memoisation or incremental validation at thousands of records.
- Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` makes array access verbose in places. The trade is deliberate: this is a data-integrity tool, and silently reading `undefined` as a value is the exact failure mode it exists to catch.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Keep the single-file HTML prototype | No module boundaries, no type safety, and no way to unit-test the priority formula — the central claim would be unverifiable |
| Next.js | SSR and routing infrastructure with no server to run it on; slower builds for zero benefit on Pages |
| Redux Toolkit | Ceremony disproportionate to four arrays of state |
| IndexedDB via Dexie | A dependency and async complexity for a payload measured in kilobytes; `localStorage` is synchronous, which keeps the store simple |
| A rules DSL / JSON-configured validators | Indirection that would obscure the rules rather than clarify them, at 16 rules with no runtime authoring requirement |
