# Delta Fleet Decision Lab

I built this project to explore a practical question:

A comma in a number and a $500 million balance-sheet mismatch can both make a validation check fail. They should not receive the same response. This application puts the issues that could affect real decisions at the top of the queue, shows what each issue could disrupt, and records what the reviewer decided. It's targeted and has features specifically for the aviation-finance field.

The application uses Delta Air Lines as a public case study. It focuses on Delta's 77 Boeing 737-800s, which averaged 24.3 years old at the end of 2025, and the company's order for 100 Boeing 737-10 aircraft.


This is an independent educational and recruiting project by Nathan Mackey, a Finance and Computer Science student at Case Western Reserve University. It is not affiliated with Delta, endorsed by Delta, or intended to predict the company's actual fleet plan.

## What you can explore

The first screen gives a plain-language suggestion under the selected assumptions. You can change:

- Fuel price
- Delivery delays
- Travel-demand growth
- Expected maintenance costs
- How much each aircraft flies
- When replacement begins

The application immediately recalculates:

- Estimated aircraft needed
- Planes the selected choice may be short
- Fuel, maintenance, ownership, and temporary leasing costs
- The year replacement becomes less expensive than continued operation
- Average fleet age through 2035
- Which assumption changes the result most

Three choices are compared using the same assumptions: keep the older aircraft, replace them as new aircraft arrive, or retire on schedule and temporarily lease the difference.

## What is reported and what is estimated

This distinction is the most important part of the project.

### Reported facts

Delta's 2025 Form 10-K supplies the mainline fleet, average ages, ownership categories, aircraft commitments, delivery timing, fuel consumption, and fuel expense. Delta and Boeing pages provide the planned seat count and published fuel-efficiency claims. The EIA supplies the latest Gulf Coast jet-fuel market reference.

Every fact is stored with its original URL, date, and location in the source. Five automatic checks confirm that the fleet, ownership, aircraft-order, 737-10 delivery, and fuel totals still reconcile.

### Adjustable estimates

Delta does not publicly disclose the negotiated price of each 737-10, aircraft-level maintenance condition, engine shop visits, temporary lease offers, route assignments, or an exact retirement schedule for the 737-800 fleet.

The model therefore treats those values as visible, adjustable estimates. Estimated outputs are shown as ranges. The project never presents an invented retirement probability or claims to know what Delta has privately decided.

## Data snapshot

Sources were checked on **August 5, 2026**.

- [Delta Air Lines 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/27904/000002790426000013/dal-20251231.htm)
- [Delta Boeing 737 fleet media kit](https://news.delta.com/mediakit/boeing-737)
- [Delta Boeing 737-10 order announcement](https://pro.delta.com/content/agency/gb/en/news/products---services-archive/2022/july-2022/delta-adds-state-of-the-art--fuel-efficient-boeing-737-max-to-fl.html)
- [Boeing 737 MAX product page](https://www.boeing.com/commercial/737max)
- [EIA Gulf Coast jet-fuel spot prices](https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=W&n=PET&s=EER_EPJK_PF4_RGC_DPG)
- [BTS Air Carrier Financial Schedule P-5.2](https://www.transtats.bts.gov/DL_SelectFields.aspx?QO_fu146_anzr=Nv4+Pn44vr4+Sv0n0pvny&gnoyr_VQ=FMK)

None of the synthetic relationships represent a real claim about the three airlines.

## How the comparison works

The model covers 2026 through 2035. For every year it estimates the seats needed, aircraft available, fuel cost, maintenance cost, ownership cost, temporary leasing cost, and average age.

The filing reports 27 Boeing 737-10 deliveries in 2027, 39 in 2028, and 34 after 2028. Because Delta does not assign the last group to exact years, this case study divides it evenly between 2029 and 2030. It then allocates 77 of the 100 ordered aircraft to the example so the modeled old and new groups are the same size. Both choices are disclosed assumptions, not Delta guidance.

Future annual costs are expressed in 2026 dollars using the selected rate. The interface explains each formula in ordinary language, while the calculation engine remains deterministic and testable.

More detail is available in [the architecture and modeling decision record](docs/adr-001-architecture.md).

## Run it locally

You will need Node.js 20 or newer.

```bash
git clone https://github.com/NathanM11230/aviation-data-integrity-console.git
cd aviation-data-integrity-console
npm install
npm run dev
```

Vite will print a local URL, normally `http://localhost:5173/aviation-data-integrity-console/`.

Useful commands:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Project structure

The active case-study code lives in three layers:

```text
primary-source facts + visible assumptions
                    |
                    v
       deterministic scenario engine
                    |
                    v
 recommendation, comparisons, sources, and methodology
```

- `src/delta/data.ts` contains sourced fleet facts, source metadata, and data checks.
- `src/delta/model.ts` contains the calculation engine and assumption boundaries.
- `src/ui/App.tsx` renders the decision experience without calculating results itself.

The original data-reliability engine remains in the repository with its tests as historical context. Its strongest ideas, provenance and deterministic validation, now support the Data and Sources view instead of serving as the main product.

## Limitations

- The model examines aircraft families, not individual tail numbers.
- Public information cannot support a real aircraft-by-aircraft retirement recommendation.
- Purchase, maintenance, transition, and lease costs are illustrative assumptions.
- Seat capacity is a useful comparison but does not replace route, schedule, or network analysis.
- The model does not estimate ticket revenue lost when a strategy leaves too few aircraft.
- Manufacturer fuel-efficiency figures are claims, not observed Delta 737-10 operating results.
- Results are a transparent case study, not investment advice or a company forecast.

## Deployment

The project remains a static React application with no backend, file upload, API key, or private data. GitHub Pages can host it directly. Pushing a completed change to `main` runs the existing GitHub Actions deployment workflow.
