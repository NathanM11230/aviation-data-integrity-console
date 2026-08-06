import { useEffect, useMemo, useState } from 'react';
import {
  DATA_SNAPSHOT,
  DELIVERIES,
  FACTS,
  FLEET,
  SOURCES,
  factById,
  runDataChecks,
  sourceById,
} from '../delta/data';
import {
  ASSUMPTION_NOTES,
  DEFAULT_ASSUMPTIONS,
  MODEL_END_YEAR,
  runScenario,
} from '../delta/model';
import type {
  ScenarioAssumptions,
  ScenarioResult,
  StrategyResult,
} from '../delta/types';

type ViewId = 'scenario' | 'fleet' | 'compare' | 'sources' | 'method';

const NAV_ITEMS: { id: ViewId; label: string }[] = [
  { id: 'scenario', label: 'Try a scenario' },
  { id: 'fleet', label: 'Fleet today' },
  { id: 'compare', label: 'Compare choices' },
  { id: 'sources', label: 'Data and sources' },
  { id: 'method', label: 'How it works' },
];

const SCENARIO_KEYS: { key: keyof ScenarioAssumptions; short: string }[] = [
  { key: 'fuelPricePerGallon', short: 'fuel' },
  { key: 'deliveryDelayYears', short: 'delay' },
  { key: 'annualDemandGrowthPct', short: 'demand' },
  { key: 'maintenanceChangePct', short: 'maint' },
  { key: 'annualFlightHours', short: 'hours' },
  { key: 'replacementStartYear', short: 'start' },
  { key: 'oldFuelBurnGallonsPerHour', short: 'burn' },
  { key: 'newFuelEfficiencyImprovementPct', short: 'eff' },
  { key: 'oldMaintenancePerPlaneM', short: 'oldm' },
  { key: 'annualAgeMaintenanceGrowthPct', short: 'agecost' },
  { key: 'newMaintenancePerPlaneM', short: 'newm' },
  { key: 'replacementPricePerPlaneM', short: 'price' },
  { key: 'replacementUsefulLifeYears', short: 'life' },
  { key: 'temporaryLeasePerPlaneM', short: 'lease' },
  { key: 'transitionCostPerPlaneM', short: 'transition' },
  { key: 'discountRatePct', short: 'rate' },
  { key: 'retirementYears', short: 'retire' },
];

const PRESETS: { id: string; label: string; values: Partial<ScenarioAssumptions> }[] = [
  { id: 'starting', label: 'Starting point', values: DEFAULT_ASSUMPTIONS },
  { id: 'market', label: 'Latest fuel market', values: { fuelPricePerGallon: 3.736 } },
  { id: 'delay', label: 'Delivery stress', values: { deliveryDelayYears: 2, maintenanceChangePct: 10, annualDemandGrowthPct: 1.5 } },
];

// Kept for the legacy views that remain in the repository as historical context.
export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}

function currentView(): ViewId {
  const route = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return NAV_ITEMS.some((item) => item.id === route) ? route as ViewId : 'scenario';
}

function assumptionsFromHash(): ScenarioAssumptions {
  const query = window.location.hash.split('?')[1];
  if (!query) return DEFAULT_ASSUMPTIONS;
  const params = new URLSearchParams(query);
  const next = { ...DEFAULT_ASSUMPTIONS };
  for (const item of SCENARIO_KEYS) {
    if (!params.has(item.short)) continue;
    const parsed = Number(params.get(item.short));
    if (Number.isFinite(parsed)) next[item.key] = parsed;
  }
  return next;
}

function scenarioQuery(assumptions: ScenarioAssumptions): string {
  const params = new URLSearchParams();
  for (const item of SCENARIO_KEYS) params.set(item.short, String(assumptions[item.key]));
  return params.toString();
}

function formatMoney(millions: number, digits = 1): string {
  if (Math.abs(millions) >= 1_000) return `$${(millions / 1_000).toFixed(digits)}B`;
  return `$${millions.toFixed(0)}M`;
}

function formatRange(strategy: StrategyResult): string {
  return `${formatMoney(strategy.lowEstimateM)} to ${formatMoney(strategy.highEstimateM)}`;
}

function updateAssumption<K extends keyof ScenarioAssumptions>(
  setAssumptions: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>,
  key: K,
  value: ScenarioAssumptions[K],
): void {
  setAssumptions((current) => ({ ...current, [key]: value }));
}

function FactLink({ id, compact = false }: { id: string; compact?: boolean }) {
  const fact = factById(id);
  const source = sourceById(fact.sourceId);
  return (
    <a className={compact ? 'fact-link compact' : 'fact-link'} href={source.url} target="_blank" rel="noreferrer">
      <span>{fact.label}</span>
      <strong>{fact.displayValue}</strong>
    </a>
  );
}

function RangeControl({
  id,
  question,
  valueText,
  context,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  question: string;
  valueText: string;
  context: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="control-row">
      <div className="control-heading">
        <label htmlFor={id}>{question}</label>
        <output htmlFor={id}>{valueText}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <p>{context}</p>
    </div>
  );
}

function DecisionSummary({ result }: { result: ScenarioResult }) {
  const strategy = result.strategies[result.recommendedStrategy];
  return (
    <section className="decision-band" aria-labelledby="decision-title">
      <div className="decision-copy">
        <div className="eyebrow">Modeled example: 737-800 to 737-10</div>
        <h1 id="decision-title">{result.recommendationTitle}</h1>
        <p>{result.recommendationExplanation}</p>
        <div className="change-note">{result.changeSummary}</div>
      </div>
      <div className="decision-number" aria-label="Estimated ten-year cost range">
        <span>Estimated cost through 2035</span>
        <strong>{formatRange(strategy)}</strong>
        <small>Range reflects uncertainty in private costs</small>
      </div>
    </section>
  );
}

function ScenarioView({
  assumptions,
  setAssumptions,
  result,
  onReset,
}: {
  assumptions: ScenarioAssumptions;
  setAssumptions: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>;
  result: ScenarioResult;
  onReset: () => void;
}) {
  const recommended = result.strategies[result.recommendedStrategy];
  const finalYear = recommended.years.at(-1)!;
  const visibleYears = recommended.years.filter((row) => row.year === 2026 || row.year === 2028 || row.year === 2030 || row.year === 2032 || row.year === 2035);

  const applyPreset = (values: Partial<ScenarioAssumptions>) => {
    setAssumptions(values === DEFAULT_ASSUMPTIONS ? DEFAULT_ASSUMPTIONS : { ...DEFAULT_ASSUMPTIONS, ...values });
  };

  return (
    <>
      <DecisionSummary result={result} />

      <div className="fact-strip" aria-label="Facts behind this example">
        <FactLink id="b737-800-count" compact />
        <FactLink id="b737-800-age" compact />
        <FactLink id="b737-10-orders" compact />
        <FactLink id="fuel-price-2025" compact />
      </div>

      <div className="tool-layout">
        <section className="controls-panel" aria-labelledby="controls-title">
          <div className="section-heading with-action">
            <div>
              <div className="eyebrow">Change the assumptions</div>
              <h2 id="controls-title">What could change the answer?</h2>
            </div>
            <button type="button" className="text-button" onClick={onReset}>Reset</button>
          </div>

          <div className="preset-group" aria-label="Scenario presets">
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => applyPreset(preset.values)}>{preset.label}</button>
            ))}
          </div>

          <RangeControl
            id="fuel-price"
            question="What if fuel becomes more expensive?"
            valueText={`$${assumptions.fuelPricePerGallon.toFixed(2)} per gallon`}
            context={`Delta reported $2.30 in 2025. The latest EIA market reference is $${Number(factById('fuel-market-latest').value).toFixed(3)}.`}
            min={1}
            max={6}
            step={0.05}
            value={assumptions.fuelPricePerGallon}
            onChange={(value) => updateAssumption(setAssumptions, 'fuelPricePerGallon', value)}
          />
          <RangeControl
            id="delivery-delay"
            question="What if new planes arrive late?"
            valueText={assumptions.deliveryDelayYears === 0 ? 'On the reported schedule' : `${assumptions.deliveryDelayYears} ${assumptions.deliveryDelayYears === 1 ? 'year' : 'years'} late`}
            context={`The first modeled replacements arrive in ${result.firstDeliveryYear}. Delta says timing remains uncertain.`}
            min={0}
            max={4}
            step={1}
            value={assumptions.deliveryDelayYears}
            onChange={(value) => updateAssumption(setAssumptions, 'deliveryDelayYears', value)}
          />
          <RangeControl
            id="demand-growth"
            question="What if more people want to fly?"
            valueText={`${assumptions.annualDemandGrowthPct.toFixed(1)}% growth each year`}
            context={`${finalYear.planesNeeded} 737-800-sized planes would be needed by ${MODEL_END_YEAR} at the selected flying level.`}
            min={-3}
            max={6}
            step={0.25}
            value={assumptions.annualDemandGrowthPct}
            onChange={(value) => updateAssumption(setAssumptions, 'annualDemandGrowthPct', value)}
          />
          <RangeControl
            id="maintenance-change"
            question="What if older planes cost more to maintain?"
            valueText={`${assumptions.maintenanceChangePct >= 0 ? '+' : ''}${assumptions.maintenanceChangePct}%`}
            context="This changes the illustrative maintenance assumption for the older 737-800 fleet."
            min={-20}
            max={40}
            step={1}
            value={assumptions.maintenanceChangePct}
            onChange={(value) => updateAssumption(setAssumptions, 'maintenanceChangePct', value)}
          />
          <RangeControl
            id="flight-hours"
            question="How much does each plane fly?"
            valueText={`${assumptions.annualFlightHours.toLocaleString()} hours per year`}
            context="More flying increases fuel use but lets the same number of planes carry more service."
            min={2_000}
            max={4_000}
            step={50}
            value={assumptions.annualFlightHours}
            onChange={(value) => updateAssumption(setAssumptions, 'annualFlightHours', value)}
          />
          <RangeControl
            id="replacement-year"
            question="When should replacement begin?"
            valueText={String(assumptions.replacementStartYear)}
            context={`The example replaces all 77 aircraft over ${assumptions.retirementYears} years when deliveries allow.`}
            min={2027}
            max={2033}
            step={1}
            value={assumptions.replacementStartYear}
            onChange={(value) => updateAssumption(setAssumptions, 'replacementStartYear', value)}
          />

          <details className="advanced-controls">
            <summary>Advanced assumptions</summary>
            <p className="details-intro">These values are estimates because Delta does not publish its aircraft-level contracts or maintenance costs.</p>
            <div className="number-grid">
              <NumberInput label="Older plane fuel use" suffix="gal/hour" value={assumptions.oldFuelBurnGallonsPerHour} step={10} onChange={(value) => updateAssumption(setAssumptions, 'oldFuelBurnGallonsPerHour', value)} />
              <NumberInput label="New plane fuel improvement" suffix="%" value={assumptions.newFuelEfficiencyImprovementPct} step={1} onChange={(value) => updateAssumption(setAssumptions, 'newFuelEfficiencyImprovementPct', value)} />
              <NumberInput label="Older plane maintenance" suffix="$M/year" value={assumptions.oldMaintenancePerPlaneM} step={0.1} onChange={(value) => updateAssumption(setAssumptions, 'oldMaintenancePerPlaneM', value)} />
              <NumberInput label="Annual aging increase" suffix="%" value={assumptions.annualAgeMaintenanceGrowthPct} step={0.5} onChange={(value) => updateAssumption(setAssumptions, 'annualAgeMaintenanceGrowthPct', value)} />
              <NumberInput label="New plane maintenance" suffix="$M/year" value={assumptions.newMaintenancePerPlaneM} step={0.1} onChange={(value) => updateAssumption(setAssumptions, 'newMaintenancePerPlaneM', value)} />
              <NumberInput label="Replacement aircraft price" suffix="$M" value={assumptions.replacementPricePerPlaneM} step={1} onChange={(value) => updateAssumption(setAssumptions, 'replacementPricePerPlaneM', value)} />
              <NumberInput label="Years used to spread price" suffix="years" value={assumptions.replacementUsefulLifeYears} step={1} onChange={(value) => updateAssumption(setAssumptions, 'replacementUsefulLifeYears', value)} />
              <NumberInput label="Temporary lease" suffix="$M/year" value={assumptions.temporaryLeasePerPlaneM} step={0.5} onChange={(value) => updateAssumption(setAssumptions, 'temporaryLeasePerPlaneM', value)} />
              <NumberInput label="One-time transition work" suffix="$M/plane" value={assumptions.transitionCostPerPlaneM} step={0.1} onChange={(value) => updateAssumption(setAssumptions, 'transitionCostPerPlaneM', value)} />
              <NumberInput label="Value of future costs" suffix="%" value={assumptions.discountRatePct} step={0.5} onChange={(value) => updateAssumption(setAssumptions, 'discountRatePct', value)} />
              <NumberInput label="Years to complete replacement" suffix="years" value={assumptions.retirementYears} step={1} onChange={(value) => updateAssumption(setAssumptions, 'retirementYears', value)} />
            </div>
          </details>
        </section>

        <section className="results-panel" aria-labelledby="results-title">
          <div className="section-heading">
            <div className="eyebrow">What it means</div>
            <h2 id="results-title">Results for this scenario</h2>
          </div>
          <div className="metric-grid">
            <article className="metric">
              <span>Planes Delta may be short</span>
              <strong>{recommended.peakPlanesShort}</strong>
              <small>Highest year under the suggested choice</small>
            </article>
            <article className="metric">
              <span>When replacement becomes cheaper</span>
              <strong>{result.replacementCheaperYear ?? 'After 2035'}</strong>
              <small>Compared with keeping the older fleet</small>
            </article>
            <article className="metric">
              <span>Average age in 2035</span>
              <strong>{recommended.endAverageAge.toFixed(1)} years</strong>
              <small>Modeled aircraft in this example</small>
            </article>
            <article className="metric">
              <span>Biggest driver</span>
              <strong className="metric-text">{result.mostInfluentialAssumption}</strong>
              <small>Largest change in the cost comparison</small>
            </article>
          </div>

          <div className="timeline-block">
            <div className="subheading-row">
              <h3>How the fleet changes</h3>
              <span>{recommended.label}</span>
            </div>
            <div className="timeline" role="img" aria-label="Older and newer aircraft by selected year">
              {visibleYears.map((row) => {
                const max = Math.max(row.oldPlanes + row.newPlanes + row.leasedPlanes, row.planesNeeded);
                return (
                  <div className="timeline-year" key={row.year}>
                    <div className="timeline-label"><strong>{row.year}</strong><span>{row.planesNeeded} needed</span></div>
                    <div className="timeline-track">
                      <span className="bar-old" style={{ width: `${(row.oldPlanes / max) * 100}%` }} title={`${row.oldPlanes} older planes`} />
                      <span className="bar-new" style={{ width: `${(row.newPlanes / max) * 100}%` }} title={`${row.newPlanes} new planes`} />
                      <span className="bar-lease" style={{ width: `${(row.leasedPlanes / max) * 100}%` }} title={`${row.leasedPlanes} leased planes`} />
                    </div>
                    <div className="timeline-values"><span>{row.oldPlanes} older</span><span>{row.newPlanes} new</span>{row.leasedPlanes > 0 && <span>{row.leasedPlanes} leased</span>}</div>
                  </div>
                );
              })}
            </div>
            <div className="legend"><span><i className="legend-old" />Older 737-800</span><span><i className="legend-new" />New 737-10</span><span><i className="legend-lease" />Temporarily leased</span></div>
          </div>

          <div className="plain-note">
            <strong>Read this result as a case study, not a Delta forecast.</strong>
            <p>The fleet counts and delivery schedule are reported facts. Aircraft-level prices, maintenance costs, flying hours, and retirement timing are adjustable estimates because Delta does not publish them.</p>
          </div>
        </section>
      </div>
    </>
  );
}

function NumberInput({ label, suffix, value, step, onChange }: { label: string; suffix: string; value: number; step: number; onChange: (value: number) => void }) {
  const id = `advanced-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label className="number-input" htmlFor={id}>
      <span>{label}</span>
      <span className="number-field"><input id={id} type="number" value={value} step={step} onChange={(event) => onChange(Number(event.target.value))} /><em>{suffix}</em></span>
    </label>
  );
}

function FleetView() {
  const olderFleet = FLEET.filter((row) => row.averageAge !== null && row.averageAge >= 20);
  const oldest = [...olderFleet].sort((a, b) => (b.averageAge ?? 0) - (a.averageAge ?? 0));
  return (
    <section className="page-section" aria-labelledby="fleet-title">
      <div className="page-heading">
        <div className="eyebrow">Reported facts</div>
        <h1 id="fleet-title">Delta's fleet today</h1>
        <p>The full mainline fleet from Delta's 2025 annual filing. The interactive example models only the 737-800 and a possible transition toward the 737-10.</p>
      </div>
      <div className="summary-band">
        <FactLink id="fleet-total" />
        <FactLink id="fleet-average-age" />
        <FactLink id="purchase-commitments" />
        <FactLink id="purchase-commitments-value" />
      </div>
      <div className="content-split">
        <div>
          <div className="section-heading">
            <div className="eyebrow">Older aircraft families</div>
            <h2>Where replacement questions are most visible</h2>
          </div>
          <div className="age-list">
            {oldest.map((row) => (
              <div className={row.modeled ? 'age-row modeled' : 'age-row'} key={row.model}>
                <div><strong>{row.model}</strong>{row.modeled && <span>Modeled example</span>}</div>
                <div className="age-track"><span style={{ width: `${((row.averageAge ?? 0) / 32) * 100}%` }} /></div>
                <strong>{row.averageAge?.toFixed(1)} years</strong>
                <span>{row.total} planes</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="context-panel">
          <h2>Why the 737-800?</h2>
          <p>It is a large, clearly reported group: 77 aircraft averaging 24.3 years. Delta also has 100 newer 737-10s on order, but the company does not publicly map each new aircraft to a specific retirement.</p>
          <p>The model therefore treats the connection as an adjustable case study rather than a disclosed Delta plan.</p>
        </aside>
      </div>
      <div className="table-section">
        <div className="section-heading">
          <div className="eyebrow">As of December 31, 2025</div>
          <h2>Complete mainline fleet</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Aircraft type</th><th>Owned</th><th>Finance lease</th><th>Operating lease</th><th>Total</th><th>Average age</th><th>Committed</th></tr></thead>
            <tbody>{FLEET.map((row) => (
              <tr className={row.modeled ? 'highlight-row' : ''} data-testid={`fleet-${row.model}`} key={row.model}>
                <th>{row.model}{row.modeled && <small>Case study</small>}</th>
                <td>{row.owned || '-'}</td><td>{row.financeLease || '-'}</td><td>{row.operatingLease || '-'}</td><td>{row.total || '-'}</td><td>{row.averageAge === null ? '-' : `${row.averageAge.toFixed(1)} years`}</td><td>{row.purchaseCommitments || '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="table-source">Source: Delta 2025 Form 10-K, Item 2, page 28. Regional aircraft are excluded.</p>
      </div>
      <div className="table-section">
        <div className="section-heading"><div className="eyebrow">Reported delivery timing</div><h2>Committed aircraft</h2></div>
        <div className="table-wrap compact-table"><table><thead><tr><th>Aircraft type</th><th>2026</th><th>2027</th><th>2028</th><th>After 2028</th><th>Total</th></tr></thead><tbody>{DELIVERIES.map((row) => <tr className={row.model === 'B737-10' ? 'highlight-row' : ''} key={row.model}><th>{row.model}</th><td>{row.year2026 || '-'}</td><td>{row.year2027 || '-'}</td><td>{row.year2028 || '-'}</td><td>{row.after2028 || '-'}</td><td>{row.total}</td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}

function CompareView({ result }: { result: ScenarioResult }) {
  const strategies = Object.values(result.strategies);
  const maxCost = Math.max(...strategies.map((strategy) => strategy.highEstimateM));
  return (
    <section className="page-section" aria-labelledby="compare-title">
      <div className="page-heading"><div className="eyebrow">Same assumptions, three choices</div><h1 id="compare-title">Compare the choices</h1><p>The lowest cost is not automatically the best choice. A plan also needs enough aircraft to operate the expected schedule.</p></div>
      <div className="comparison-list">
        {strategies.map((strategy) => (
          <article className={result.recommendedStrategy === strategy.id ? 'strategy-row recommended' : 'strategy-row'} key={strategy.id}>
            <div className="strategy-name"><span>{result.recommendedStrategy === strategy.id ? 'Suggested by this scenario' : 'Modeled choice'}</span><h2>{strategy.label}</h2><p>{strategy.description}</p></div>
            <div className="cost-visual"><div className="cost-bar"><span style={{ width: `${(strategy.tenYearCostM / maxCost) * 100}%` }} /></div><strong>{formatRange(strategy)}</strong><small>Estimated cost through 2035</small></div>
            <dl><div><dt>Planes short</dt><dd>{strategy.peakPlanesShort}</dd></div><div><dt>Most leased</dt><dd>{strategy.maxLeasedPlanes}</dd></div><div><dt>Fleet age in 2035</dt><dd>{strategy.endAverageAge.toFixed(1)} years</dd></div></dl>
          </article>
        ))}
      </div>
      <div className="comparison-explanation">
        <h2>Why the suggestion changes</h2>
        <p>Higher fuel and maintenance costs make newer aircraft more attractive. Delivery delays make it useful to keep older aircraft available. Faster demand growth increases the value of the 737-10's larger planned cabin and can create a need for temporary aircraft.</p>
        <p><strong>Most influential in this scenario:</strong> {result.mostInfluentialAssumption}</p>
      </div>
    </section>
  );
}

function SourcesView() {
  const checks = runDataChecks();
  const checked = checks.filter((check) => check.passed).length;
  return (
    <section className="page-section" aria-labelledby="sources-title">
      <div className="page-heading"><div className="eyebrow">Evidence before estimates</div><h1 id="sources-title">Data and sources</h1><p>Every reported fact links to its original source. Automated checks make sure the fleet, ownership, delivery, and fuel totals still agree before the model runs.</p></div>
      <div className="check-summary"><strong>{checked} of {checks.length} checks passed</strong><span>Data snapshot: {DATA_SNAPSHOT}</span></div>
      <div className="checks-list">
        {checks.map((check) => <div className={check.passed ? 'check-row passed' : 'check-row failed'} key={check.id}><span className="check-mark" aria-hidden="true">{check.passed ? 'OK' : '!'}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></div>)}
      </div>
      <div className="section-heading"><div className="eyebrow">Reported values</div><h2>Facts used in the case study</h2></div>
      <div className="table-wrap"><table><thead><tr><th>Fact</th><th>Value</th><th>Where it appears</th><th>Source</th></tr></thead><tbody>{FACTS.map((fact) => { const source = sourceById(fact.sourceId); return <tr key={fact.id}><th>{fact.label}{fact.note && <small>{fact.note}</small>}</th><td>{fact.displayValue}</td><td>{fact.location}</td><td><a href={source.url} target="_blank" rel="noreferrer">{source.publisher}</a></td></tr>; })}</tbody></table></div>
      <div className="section-heading source-heading"><div className="eyebrow">Primary references</div><h2>Source library</h2></div>
      <div className="source-list">{SOURCES.map((source) => <article className="source-row" key={source.id}><div><span>{source.publisher}</span><h3><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h3><p>{source.note}</p></div><dl><div><dt>Information date</dt><dd>{source.asOf}</dd></div><div><dt>Checked</dt><dd>{source.accessed}</dd></div></dl></article>)}</div>
    </section>
  );
}

function MethodView({ result }: { result: ScenarioResult }) {
  return (
    <section className="page-section" aria-labelledby="method-title">
      <div className="page-heading"><div className="eyebrow">Transparent by design</div><h1 id="method-title">How the case study works</h1><p>The model is intentionally simple enough to inspect. It combines reported fleet facts with adjustable estimates, then recalculates all three choices from the same assumptions.</p></div>
      <div className="method-flow" aria-label="Calculation flow"><div><span>1</span><strong>Reported facts</strong><p>Fleet, age, seats, deliveries, and fuel price</p></div><div><span>2</span><strong>Your assumptions</strong><p>Fuel, demand, flying, maintenance, timing, and private costs</p></div><div><span>3</span><strong>Calculated result</strong><p>Planes needed, annual costs, timing, and suggested choice</p></div></div>
      <div className="content-split method-split">
        <div><div className="section-heading"><div className="eyebrow">Plain-language formulas</div><h2>What is calculated</h2></div><ol className="formula-list">{result.formulas.map((formula) => <li key={formula}>{formula}</li>)}</ol></div>
        <aside className="context-panel warning-panel"><h2>What this cannot know</h2><p>Delta does not publicly disclose tail-level maintenance condition, engine shop visits, negotiated purchase prices, lease offers, route assignments, or the exact retirement plan for these aircraft.</p><p>Those missing details can materially change a real fleet decision. This application shows how the decision works, not what Delta has privately decided.</p></aside>
      </div>
      <div className="section-heading"><div className="eyebrow">Editable estimates</div><h2>Assumptions, not Delta facts</h2></div>
      <div className="assumption-list">{ASSUMPTION_NOTES.map((assumption) => <div className="assumption-row" key={assumption.id}><strong>{assumption.label}</strong><span>{String(result.assumptions[assumption.id])}</span><p>{assumption.note}</p></div>)}</div>
      <div className="method-note"><strong>About the 737-10 schedule</strong><p>Delta reports 27 deliveries in 2027, 39 in 2028, and 34 after 2028. Because the filing does not assign the final 34 to specific years, the case study splits them evenly between 2029 and 2030. It then allocates 77 of the 100 ordered aircraft to this example so the modeled old and new groups are the same size. Both choices are disclosed assumptions.</p></div>
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<ViewId>(() => currentView());
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(() => assumptionsFromHash());
  const result = useMemo(() => runScenario(assumptions), [assumptions]);

  useEffect(() => {
    document.title = 'Delta Fleet Decision Lab | Nathan Mackey';
    const onHashChange = () => setView(currentView());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const nextHash = `#/${view}?${scenarioQuery(result.assumptions)}`;
    if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
  }, [result.assumptions, view]);

  const navigate = (next: ViewId) => {
    setView(next);
    window.location.hash = `#/${next}?${scenarioQuery(result.assumptions)}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="#/scenario" onClick={(event) => { event.preventDefault(); navigate('scenario'); }}>
            <span className="brand-mark" aria-hidden="true">DF</span>
            <span><strong>Delta Fleet Decision Lab</strong><small>Independent case study by Nathan Mackey</small></span>
          </a>
          <div className="snapshot"><span>Data checked</span><strong>{DATA_SNAPSHOT}</strong></div>
        </div>
        <nav className="app-nav" aria-label="Main views">
          <div className="nav-inner">
            {NAV_ITEMS.map((item) => <a key={item.id} href={`#/${item.id}`} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(item.id); }}>{item.label}</a>)}
          </div>
        </nav>
      </header>
      <main>
        {view === 'scenario' && <ScenarioView assumptions={result.assumptions} setAssumptions={setAssumptions} result={result} onReset={() => setAssumptions(DEFAULT_ASSUMPTIONS)} />}
        {view === 'fleet' && <FleetView />}
        {view === 'compare' && <CompareView result={result} />}
        {view === 'sources' && <SourcesView />}
        {view === 'method' && <MethodView result={result} />}
      </main>
      <footer><p>Independent educational case study. Not affiliated with or endorsed by Delta Air Lines. Results are estimates, not company forecasts.</p></footer>
    </div>
  );
}
