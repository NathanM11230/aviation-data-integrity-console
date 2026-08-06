# ADR 001: Separate evidence, assumptions, and calculated results

## Status

Accepted for the Delta Fleet Decision Lab pivot.

## Context

The original application centered on a queue of data-quality exceptions. That architecture established useful patterns for deterministic validation and source lineage, but the interface made the controls more prominent than the decision they were meant to protect.

The Delta case study needs to answer a simpler user question while remaining honest about a difficult limitation: public sources provide fleet counts and delivery commitments, but not the private maintenance, purchase, lease, and route information required for a real Delta fleet decision.

## Decision

The application separates all inputs and outputs into three categories.

### 1. Sourced facts

`src/delta/data.ts` stores reported values with:

- A stable fact identifier
- The original publisher and URL
- The information date and access date
- The filing page or table location
- A plain-language note where context matters

Pure checks reconcile fleet totals, ownership categories, purchase commitments, the 737-10 schedule, and fuel expense. A failed check remains visible and can be used to stop publication in a future version.

### 2. Adjustable assumptions

`ScenarioAssumptions` contains every value the model needs but cannot establish as a Delta fact. Each assumption has a user-facing explanation. Values are normalized at the calculation boundary to prevent invalid or extreme input from producing meaningless output.

The URL contains the complete scenario state. Reloading or sharing that URL reproduces the same result without a backend.

### 3. Calculated results

`runScenario()` is a pure, synchronous function. It takes all assumptions and returns the three complete strategy results, the suggested choice, plain-language explanation, cost ranges, timing, formulas, and provenance identifiers.

React renders that result but does not reproduce formulas in components. This avoids different pages calculating the same metric differently.

## Modeling choices

- The model covers 2026 through 2035.
- It models aircraft families, never tail numbers.
- The 34 deliveries reported only as "after 2028" are divided evenly between 2029 and 2030.
- Seventy-seven of the 100 ordered 737-10s are allocated to the example in proportion to the reported schedule.
- The "replace" choice keeps older aircraft until allocated replacements arrive.
- The "temporary lease" choice retires on the selected schedule and leases enough capacity to cover any shortage.
- Costs are discounted to 2026 dollars and displayed with a plus or minus 15% range to make private-cost uncertainty visible.

## Consequences

### Benefits

- Every displayed fact can lead back to a primary source.
- Every estimate is visible and adjustable.
- Scenario URLs are reproducible.
- Calculations are deterministic and extensively unit tested.
- The first screen explains the decision before exposing methodology.
- The application remains deployable as a static site.

### Limitations

- The model cannot produce a real Delta retirement plan from public data.
- The uncertainty range is a communication device, not a statistical confidence interval.
- A simple capacity comparison cannot represent Delta's route network.
- Annualized ownership cost is useful for comparison but is not Delta accounting guidance.
- The original review workflow remains in the repository but is no longer part of the active interface.
