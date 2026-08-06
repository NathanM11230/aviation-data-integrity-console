# Delta 737 Replacement Lab

I built this project around one practical question:

> What should Delta do with its 77 aging Boeing 737-800s as Boeing 737-10 deliveries approach?


The lab compares three possible actions:

1. Keep the 737-800s in service and continue improving them.
2. Replace aircraft only as 737-10s arrive.
3. Retire on schedule and temporarily lease aircraft when deliveries fall short.

This is an independent educational project by Nathan Mackey, a Finance and Computer Science student at Case Western Reserve University. It is not affiliated with Delta and does not claim to predict Delta's private fleet plan.

## Why this pair?

Delta reported 77 Boeing 737-800s with an average age of 24.3 years at the end of 2025. It also reported 100 committed Boeing 737-10 orders. Delta says the 737-10 will be 20% to 30% more fuel efficient than the retiring aircraft it replaces.

That does **not** mean Delta has said the 737-10 order directly replaces the 737-800 fleet. It has not. Allocating 77 of those orders to this example is a visible case-study assumption.

Delta also announced finlet modifications for its 737-800 and 737-900ER fleets in 2026. That makes "keep and improve" a meaningful alternative to immediate replacement. Delta did not publish an exact savings percentage or installation cost, so the model does not invent one.

## What you can test

Four controls drive the main decision:

- Fuel price
- 737-10 delivery delays
- Changes in 737-800 maintenance cost
- Annual travel-demand growth

The result updates immediately. It shows the suggested action, estimated cost through 2035, whether the schedule has enough aircraft, when replacement becomes cheaper than continued operation, and which assumption matters most.

A live calculation receipt sits beside the controls. It automatically follows the slider being used and substitutes the current values into the fuel, delivery, maintenance, or demand equation. The recommendation also shows the midpoint cost and aircraft coverage for all three choices so the winning rule is visible.

Detailed inputs remain editable on the Assumptions page. They include aircraft use, retirement timing, fuel burn, maintenance, aircraft price, transition work, lease cost, and the value assigned to future costs.

## Facts versus assumptions

The distinction matters more than the recommendation.

**Reported facts** include fleet count, average age, seat counts, the 737-10 order and delivery schedule, Delta's 2025 fuel price, and published efficiency claims. Every displayed fact links to its source.

**Model assumptions** include exact retirement years, flying hours, aircraft-level fuel use, maintenance cost, purchase price, lease cost, and assigning 77 orders to this example. Delta does not publicly disclose those details.

Sources were checked on **August 6, 2026**:

- [Delta Air Lines 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/27904/000002790426000013/dal-20251231.htm)
- [Delta Boeing 737 fleet media kit](https://news.delta.com/mediakit/boeing-737)
- [Delta Boeing 737-10 order announcement](https://ir.delta.com/news/news-details/2022/Delta-adds-state-of-the-art-fuel-efficient-Boeing-737-MAX-to-fleet/default.aspx)
- [Delta's 737NG finlet announcement](https://news.delta.com/delta-advances-fleet-efficiency-vct-finlets-across-737ng-fleet)
- [Boeing 737 MAX product page](https://www.boeing.com/commercial/737max)
- [EIA Gulf Coast jet-fuel prices](https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=W&n=PET&s=EER_EPJK_PF4_RGC_DPG)

## How the model works

The comparison covers 2026 through 2035. Each strategy is evaluated using the same assumptions. For every year, the model estimates:

- Aircraft and seats needed
- Older, newer, and temporarily leased aircraft available
- Fuel and maintenance cost
- Replacement ownership and transition cost
- Temporary leasing cost
- Average age of the modeled fleet

Delta reports 27 Boeing 737-10 deliveries in 2027, 39 in 2028, and 34 after 2028. Because the final 34 are not assigned to exact years, this case study divides them between 2029 and 2030. It then allocates 77 of the 100 orders to the replacement example.

The calculation engine is deterministic and covered by unit tests. The interface renders its outputs but does not calculate its own answers.

## Run it locally

You will need Node.js 20 or newer.

```bash
git clone https://github.com/NathanM11230/aviation-data-integrity-console.git
cd aviation-data-integrity-console
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Project structure

- `src/delta/data.ts` stores source metadata, reported facts, and reconciliation checks.
- `src/delta/model.ts` contains the scenario calculations and input boundaries.
- `src/ui/App.tsx` renders the decision, evidence, and assumptions pages.
- `src/styles.css` contains the responsive interface.
- `e2e/workflow.spec.ts` checks the key experience on desktop and mobile.

The original data-reliability prototype remains in the repository as historical context, but it is not part of the active interface.

## Limitations

- This is a fleet-family case study, not an aircraft-by-aircraft retirement tool.
- It does not know engine condition, route assignments, shop visits, negotiated prices, lease availability, or Delta's retirement plan.
- It does not estimate revenue lost when an option leaves too few aircraft.
- Manufacturer efficiency figures are claims, not observed Delta 737-10 operating results.
- Results are educational estimates, not investment advice or a company forecast.
