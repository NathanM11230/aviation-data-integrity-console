import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  DATA_SNAPSHOT,
  factById,
  runDataChecks,
  sourceById,
} from '../delta/data';
import {
  ASSUMPTION_NOTES,
  DEFAULT_ASSUMPTIONS,
  runScenario,
} from '../delta/model';
import type {
  ScenarioAssumptions,
  ScenarioResult,
  LiveCalculationId,
  StrategyId,
  StrategyResult,
} from '../delta/types';

type ViewId = 'decision' | 'evidence' | 'assumptions';

const NAV_ITEMS: { id: ViewId; label: string }[] = [
  { id: 'decision', label: 'The decision' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'assumptions', label: 'Assumptions' },
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

const PRESETS: { id: string; label: string; note: string; values: Partial<ScenarioAssumptions> }[] = [
  { id: 'base', label: 'Starting point', note: 'Reported fuel price, no delay', values: DEFAULT_ASSUMPTIONS },
  { id: 'fuel', label: 'Fuel shock', note: '$4.00 fuel, higher upkeep', values: { fuelPricePerGallon: 4, maintenanceChangePct: 15 } },
  { id: 'delay', label: 'Delivery stress', note: 'Two years late, demand grows', values: { deliveryDelayYears: 2, annualDemandGrowthPct: 2, maintenanceChangePct: 10 } },
];

const EVIDENCE_FACT_IDS = [
  'b737-800-count',
  'b737-800-age',
  'b737-800-seats',
  'b737-10-orders',
  'b737-10-seats',
  'b737-10-2027',
  'b737-10-2028',
  'b737-10-after-2028',
  'fuel-price-2025',
  'max-fuel-improvement',
];

const EVIDENCE_SOURCE_IDS = [
  'delta-2025-10k',
  'delta-737-800',
  'delta-737-10-order',
  'delta-737-finlets',
  'boeing-737-max',
  'eia-jet-fuel',
];

const ADVANCED_INPUTS: {
  key: keyof ScenarioAssumptions;
  label: string;
  suffix: string;
  step: number;
}[] = [
  { key: 'annualFlightHours', label: 'Hours flown per plane', suffix: 'hours/year', step: 50 },
  { key: 'replacementStartYear', label: 'Replacement begins', suffix: 'year', step: 1 },
  { key: 'retirementYears', label: 'Replacement period', suffix: 'years', step: 1 },
  { key: 'oldFuelBurnGallonsPerHour', label: '737-800 fuel use', suffix: 'gal/hour', step: 10 },
  { key: 'newFuelEfficiencyImprovementPct', label: '737-10 fuel improvement', suffix: '%', step: 1 },
  { key: 'oldMaintenancePerPlaneM', label: '737-800 maintenance', suffix: '$M/year', step: 0.1 },
  { key: 'annualAgeMaintenanceGrowthPct', label: 'Annual aging increase', suffix: '%', step: 0.5 },
  { key: 'newMaintenancePerPlaneM', label: '737-10 maintenance', suffix: '$M/year', step: 0.1 },
  { key: 'replacementPricePerPlaneM', label: 'Replacement price', suffix: '$M/plane', step: 1 },
  { key: 'replacementUsefulLifeYears', label: 'Years used to spread price', suffix: 'years', step: 1 },
  { key: 'temporaryLeasePerPlaneM', label: 'Temporary lease', suffix: '$M/year', step: 0.5 },
  { key: 'transitionCostPerPlaneM', label: 'Transition work', suffix: '$M/plane', step: 0.1 },
  { key: 'discountRatePct', label: 'Value of future costs', suffix: '%', step: 0.5 },
];

const STRATEGY_NOTES: Record<StrategyId, string> = {
  keep: 'Best when ownership cost matters more than fuel and aging costs.',
  replace: 'Best when the newer aircraft saves enough fuel and upkeep to justify its cost.',
  lease: 'A bridge when retirements or travel demand move faster than deliveries.',
};

export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}

function currentView(): ViewId {
  const route = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (route === 'sources') return 'evidence';
  if (route === 'method') return 'assumptions';
  if (route === 'scenario' || route === 'fleet' || route === 'compare') return 'decision';
  return NAV_ITEMS.some((item) => item.id === route) ? route as ViewId : 'decision';
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
  return `${formatMoney(strategy.lowEstimateM)}–${formatMoney(strategy.highEstimateM)}`;
}

function updateAssumption<K extends keyof ScenarioAssumptions>(
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>,
  key: K,
  value: ScenarioAssumptions[K],
): void {
  setAssumptions((current) => ({ ...current, [key]: value }));
}

function FactLink({ id }: { id: string }) {
  const fact = factById(id);
  const source = sourceById(fact.sourceId);
  return (
    <a className="fact-link" href={source.url} target="_blank" rel="noreferrer">
      <strong>{fact.displayValue}</strong>
      <span>{fact.label}</span>
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
  onActivate,
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
  onActivate: () => void;
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
        onFocus={onActivate}
        onPointerDown={onActivate}
        onChange={(event) => {
          onActivate();
          onChange(Number(event.target.value));
        }}
      />
      <p>{context}</p>
    </div>
  );
}

function LiveMathPanel({ result, active, onSelect }: {
  result: ScenarioResult;
  active: LiveCalculationId;
  onSelect: (id: LiveCalculationId) => void;
}) {
  const calculation = result.liveCalculations.find((item) => item.id === active) ?? result.liveCalculations[0]!;
  return (
    <div className="live-math" aria-live="polite">
      <div className="live-math-heading">
        <div><span>Live calculation</span><strong>See the numbers move</strong></div>
        <div className="math-tabs" role="tablist" aria-label="Live calculations">
          {result.liveCalculations.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active === item.id}
              className={active === item.id ? 'active' : ''}
              onClick={() => onSelect(item.id)}
            >
              {item.id === 'delivery' ? 'Delivery' : `${item.id[0]!.toUpperCase()}${item.id.slice(1)}`}
            </button>
          ))}
        </div>
      </div>
      <div className="math-receipt">
        <span>{calculation.label}</span>
        <div><code>{calculation.equation}</code><b>=</b><strong>{calculation.result}</strong></div>
        <p>{calculation.explanation}</p>
      </div>
    </div>
  );
}

function AircraftComparison() {
  return (
    <section className="aircraft-comparison" aria-labelledby="aircraft-title">
      <div className="section-kicker">One fleet. One possible successor.</div>
      <h2 id="aircraft-title">The replacement question</h2>
      <div className="aircraft-pair">
        <div className="aircraft-profile current-aircraft">
          <div className="aircraft-label"><span>Current fleet</span><strong>Boeing 737-800</strong></div>
          <div className="aircraft-number">77</div>
          <dl>
            <div><dt>Average age</dt><dd>24.3 years</dd></div>
            <div><dt>Delta seats</dt><dd>160</dd></div>
            <div><dt>Next step</dt><dd>Finlet upgrades announced</dd></div>
          </dl>
        </div>
        <div className="transition-marker" aria-hidden="true"><span>possible transition</span><b>→</b></div>
        <div className="aircraft-profile future-aircraft">
          <div className="aircraft-label"><span>Incoming fleet</span><strong>Boeing 737-10</strong></div>
          <div className="aircraft-number">100</div>
          <dl>
            <div><dt>Committed orders</dt><dd>100 aircraft</dd></div>
            <div><dt>Planned seats</dt><dd>182</dd></div>
            <div><dt>Reported efficiency</dt><dd>20%–30% better</dd></div>
          </dl>
        </div>
      </div>
      <p className="case-disclosure"><strong>Important:</strong> Delta has not said these 100 aircraft directly replace its 77 737-800s. This lab tests that possible allocation as a transparent case-study assumption.</p>
    </section>
  );
}

function ScenarioControls({
  assumptions,
  setAssumptions,
  result,
  onReset,
}: {
  assumptions: ScenarioAssumptions;
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>;
  result: ScenarioResult;
  onReset: () => void;
}) {
  const [activeMath, setActiveMath] = useState<LiveCalculationId>('fuel');
  const applyPreset = (values: Partial<ScenarioAssumptions>) => {
    setAssumptions(values === DEFAULT_ASSUMPTIONS ? DEFAULT_ASSUMPTIONS : { ...DEFAULT_ASSUMPTIONS, ...values });
  };
  return (
    <section className="scenario-controls" aria-labelledby="controls-title">
      <div className="section-heading">
        <div><span>Test the decision</span><h2 id="controls-title">What changes the answer?</h2></div>
        <button type="button" className="reset-button" onClick={onReset}>Reset</button>
      </div>
      <div className="preset-group" aria-label="Scenario presets">
        {PRESETS.map((preset) => (
          <button key={preset.id} type="button" onClick={() => applyPreset(preset.values)}>
            <strong>{preset.label}</strong><span>{preset.note}</span>
          </button>
        ))}
      </div>
      <div className="control-list">
        <RangeControl
          id="fuel-price"
          question="Fuel price"
          valueText={`$${assumptions.fuelPricePerGallon.toFixed(2)} / gallon`}
          context="Higher fuel prices favor the more efficient 737-10."
          min={1}
          max={6}
          step={0.05}
          value={assumptions.fuelPricePerGallon}
          onActivate={() => setActiveMath('fuel')}
          onChange={(value) => updateAssumption(setAssumptions, 'fuelPricePerGallon', value)}
        />
        <RangeControl
          id="delivery-delay"
          question="737-10 delivery delay"
          valueText={assumptions.deliveryDelayYears === 0 ? 'On schedule' : `${assumptions.deliveryDelayYears} ${assumptions.deliveryDelayYears === 1 ? 'year' : 'years'} late`}
          context="Late deliveries can force Delta to keep older aircraft or lease temporary capacity."
          min={0}
          max={4}
          step={1}
          value={assumptions.deliveryDelayYears}
          onActivate={() => setActiveMath('delivery')}
          onChange={(value) => updateAssumption(setAssumptions, 'deliveryDelayYears', value)}
        />
        <RangeControl
          id="maintenance-change"
          question="737-800 maintenance change"
          valueText={`${assumptions.maintenanceChangePct >= 0 ? '+' : ''}${assumptions.maintenanceChangePct}%`}
          context="Rising upkeep makes extending an older fleet less attractive."
          min={-20}
          max={40}
          step={1}
          value={assumptions.maintenanceChangePct}
          onActivate={() => setActiveMath('maintenance')}
          onChange={(value) => updateAssumption(setAssumptions, 'maintenanceChangePct', value)}
        />
        <RangeControl
          id="demand-growth"
          question="Annual travel demand"
          valueText={`${assumptions.annualDemandGrowthPct.toFixed(1)}% growth`}
          context="Faster growth rewards more seats and can create a temporary aircraft shortage."
          min={-3}
          max={6}
          step={0.25}
          value={assumptions.annualDemandGrowthPct}
          onActivate={() => setActiveMath('demand')}
          onChange={(value) => updateAssumption(setAssumptions, 'annualDemandGrowthPct', value)}
        />
      </div>
      <LiveMathPanel result={result} active={activeMath} onSelect={setActiveMath} />
    </section>
  );
}

function DecisionResult({ result }: { result: ScenarioResult }) {
  const recommended = result.strategies[result.recommendedStrategy];
  const coverage = recommended.peakPlanesShort === 0 ? 'Schedule covered' : `${recommended.peakPlanesShort} short`;
  const strategies = Object.values(result.strategies);
  return (
    <section className="decision-result" aria-labelledby="result-title" aria-live="polite">
      <div className="result-status"><span>Suggested under these assumptions</span><strong>{recommended.shortLabel}</strong></div>
      <h2 id="result-title">{result.recommendationTitle}</h2>
      <p className="result-explanation">{result.recommendationExplanation}</p>
      <p className="change-summary">{result.changeSummary}</p>
      <div className="outcome-grid">
        <div><span>Cost through 2035</span><strong>{formatRange(recommended)}</strong><small>Estimated range</small></div>
        <div><span>Aircraft coverage</span><strong>{coverage}</strong><small>Worst year in the model</small></div>
        <div><span>Replacement pays back</span><strong>{result.replacementCheaperYear ?? 'After 2035'}</strong><small>Versus keeping the 737-800s</small></div>
      </div>
      <div className="driver-line"><span>Biggest driver</span><strong>{result.mostInfluentialAssumption}</strong></div>
      <div className="decision-rule">
        <span>How the suggestion is chosen</span>
        <p>Keep choices that cover the schedule, then select the lowest midpoint cost. A tie favors the plan without temporary leasing.</p>
        <div className="decision-equation">
          {strategies.map((strategy) => (
            <div className={strategy.peakPlanesShort > 0 ? 'not-feasible' : strategy.id === result.recommendedStrategy ? 'selected' : ''} key={strategy.id}>
              <small>{strategy.shortLabel}</small>
              <strong>{formatMoney(strategy.tenYearCostM)}</strong>
              <em>{strategy.peakPlanesShort > 0 ? `${strategy.peakPlanesShort} short` : 'covered'}</em>
            </div>
          ))}
          <b aria-label="Suggested choice">= {recommended.shortLabel}</b>
        </div>
      </div>
    </section>
  );
}

function StrategyComparison({ result }: { result: ScenarioResult }) {
  const strategies = Object.values(result.strategies);
  return (
    <section className="strategy-section" aria-labelledby="strategy-title">
      <div className="section-heading standalone"><div><span>Three actions</span><h2 id="strategy-title">How the choices compare</h2></div></div>
      <div className="strategy-grid">
        {strategies.map((strategy) => (
          <article className={strategy.id === result.recommendedStrategy ? 'strategy-card recommended' : 'strategy-card'} key={strategy.id}>
            <div className="strategy-topline"><span>{strategy.id === result.recommendedStrategy ? 'Suggested' : 'Modeled option'}</span><b>{strategy.shortLabel}</b></div>
            <h3>{strategy.label}</h3>
            <p>{strategy.description}</p>
            <strong className="strategy-cost">{formatRange(strategy)}</strong>
            <span className="strategy-cost-label">Estimated cost through 2035</span>
            <dl>
              <div><dt>Aircraft short</dt><dd>{strategy.peakPlanesShort}</dd></div>
              <div><dt>Most leased</dt><dd>{strategy.maxLeasedPlanes}</dd></div>
              <div><dt>2035 fleet age</dt><dd>{strategy.endAverageAge.toFixed(1)} yrs</dd></div>
            </dl>
            <small className="strategy-note">{STRATEGY_NOTES[strategy.id]}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function FleetTimeline({ result }: { result: ScenarioResult }) {
  const strategy = result.strategies[result.recommendedStrategy];
  const visibleYears = strategy.years.filter((row) => [2026, 2028, 2030, 2032, 2035].includes(row.year));
  return (
    <section className="timeline-section" aria-labelledby="timeline-title">
      <div className="section-heading standalone">
        <div><span>Suggested path</span><h2 id="timeline-title">How the 77-aircraft fleet changes</h2></div>
        <strong>{strategy.shortLabel}</strong>
      </div>
      <div className="timeline" role="img" aria-label="Older, newer, and temporarily leased aircraft under the suggested strategy">
        {visibleYears.map((row) => {
          const max = Math.max(row.oldPlanes + row.newPlanes + row.leasedPlanes, row.planesNeeded, 1);
          return (
            <div className="timeline-row" key={row.year}>
              <div className="timeline-year"><strong>{row.year}</strong><span>{row.planesNeeded} needed</span></div>
              <div className="timeline-bar">
                <span className="old-bar" style={{ width: `${(row.oldPlanes / max) * 100}%` }} title={`${row.oldPlanes} 737-800s`} />
                <span className="new-bar" style={{ width: `${(row.newPlanes / max) * 100}%` }} title={`${row.newPlanes} 737-10s`} />
                <span className="lease-bar" style={{ width: `${(row.leasedPlanes / max) * 100}%` }} title={`${row.leasedPlanes} leased`} />
              </div>
              <div className="timeline-counts"><span>{row.oldPlanes} old</span><span>{row.newPlanes} new</span>{row.leasedPlanes > 0 && <span>{row.leasedPlanes} leased</span>}</div>
            </div>
          );
        })}
      </div>
      <div className="legend"><span><i className="old-key" />737-800</span><span><i className="new-key" />737-10</span><span><i className="lease-key" />Temporary lease</span></div>
    </section>
  );
}

function DecisionView({
  assumptions,
  setAssumptions,
  result,
  onReset,
}: {
  assumptions: ScenarioAssumptions;
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>;
  result: ScenarioResult;
  onReset: () => void;
}) {
  return (
    <>
      <section className="decision-intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <span className="case-label">Interactive Delta case study</span>
          <h1 id="page-title">When should Delta replace its 737-800s?</h1>
          <p>Test how fuel, maintenance, travel demand, and late deliveries change the choice between keeping 77 older aircraft and moving toward the 737-10.</p>
        </div>
        <div className="intro-facts" aria-label="Key facts">
          <FactLink id="b737-800-count" />
          <FactLink id="b737-800-age" />
          <FactLink id="b737-10-orders" />
          <FactLink id="max-fuel-improvement" />
        </div>
      </section>
      <AircraftComparison />
      <div className="decision-workspace">
        <ScenarioControls assumptions={assumptions} setAssumptions={setAssumptions} result={result} onReset={onReset} />
        <DecisionResult result={result} />
      </div>
      <StrategyComparison result={result} />
      <FleetTimeline result={result} />
      <section className="reading-note"><strong>Use this as a decision exercise, not a Delta forecast.</strong><p>Public facts anchor the aircraft counts and delivery schedule. Private costs and retirement timing stay visible as assumptions.</p></section>
    </>
  );
}

function EvidenceView() {
  const checks = runDataChecks().filter((check) => ['b737-schedule-check', 'fuel-check'].includes(check.id));
  const facts = EVIDENCE_FACT_IDS.map(factById);
  const sources = EVIDENCE_SOURCE_IDS.map(sourceById);
  return (
    <section className="support-page" aria-labelledby="evidence-title">
      <div className="support-heading"><span>Evidence</span><h1 id="evidence-title">What Delta reported</h1><p>Only information that directly supports this 737 case study appears here. Each value links back to its source.</p></div>
      <div className="truth-split">
        <div><span className="truth-label reported">Reported</span><h2>Facts from public sources</h2><p>Fleet count and age, seat counts, the 737-10 order and delivery schedule, Delta's fuel price, and published efficiency claims.</p></div>
        <div><span className="truth-label assumed">Assumed</span><h2>Choices made by this model</h2><p>Allocating 77 orders to this example, exact retirement years, flying hours, maintenance cost, purchase price, and lease cost.</p></div>
      </div>
      <div className="check-band"><strong>{checks.filter((check) => check.passed).length} of {checks.length} case-study checks passed</strong><span>Sources checked {DATA_SNAPSHOT}</span></div>
      <div className="check-list">
        {checks.map((check) => <div className="check-row" key={check.id}><span aria-hidden="true">OK</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></div>)}
      </div>
      <div className="table-heading"><span>Values used</span><h2>Case-study facts</h2></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fact</th><th>Value</th><th>Source location</th></tr></thead>
          <tbody>{facts.map((fact) => { const source = sourceById(fact.sourceId); return <tr key={fact.id}><th>{fact.label}{fact.note && <small>{fact.note}</small>}</th><td>{fact.displayValue}</td><td><a href={source.url} target="_blank" rel="noreferrer">{source.publisher}: {fact.location}</a></td></tr>; })}</tbody>
        </table>
      </div>
      <div className="table-heading"><span>Original links</span><h2>Source library</h2></div>
      <div className="source-list">
        {sources.map((source) => <article className="source-row" key={source.id}><div><span>{source.publisher}</span><h3><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h3><p>{source.note}</p></div><time>{source.asOf}</time></article>)}
      </div>
    </section>
  );
}

function NumberInput({
  input,
  assumptions,
  setAssumptions,
}: {
  input: typeof ADVANCED_INPUTS[number];
  assumptions: ScenarioAssumptions;
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>;
}) {
  const id = `input-${input.key}`;
  return (
    <label className="number-input" htmlFor={id}>
      <span>{input.label}</span>
      <span className="number-field"><input id={id} type="number" value={assumptions[input.key]} step={input.step} onChange={(event) => updateAssumption(setAssumptions, input.key, Number(event.target.value))} /><em>{input.suffix}</em></span>
    </label>
  );
}

function AssumptionsView({
  assumptions,
  setAssumptions,
  result,
  onReset,
}: {
  assumptions: ScenarioAssumptions;
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>;
  result: ScenarioResult;
  onReset: () => void;
}) {
  return (
    <section className="support-page" aria-labelledby="assumptions-title">
      <div className="support-heading"><span>Assumptions</span><h1 id="assumptions-title">How the comparison works</h1><p>The model is intentionally inspectable. Change the private estimates here, then return to the decision to see the effect.</p></div>
      <div className="method-flow" aria-label="Model flow">
        <div><b>1</b><strong>Start with public facts</strong><p>77 aircraft, average age, seats, fuel price, and deliveries.</p></div>
        <div><b>2</b><strong>Apply visible estimates</strong><p>Flying, maintenance, purchase, lease, and retirement costs.</p></div>
        <div><b>3</b><strong>Compare the same years</strong><p>Every choice is evaluated from 2026 through 2035.</p></div>
      </div>
      <div className="assumption-toolbar"><div><span>Editable model</span><h2>Detailed inputs</h2></div><button type="button" className="reset-button" onClick={onReset}>Reset all</button></div>
      <div className="number-grid">
        {ADVANCED_INPUTS.map((input) => <NumberInput key={input.key} input={input} assumptions={assumptions} setAssumptions={setAssumptions} />)}
      </div>
      <div className="method-columns">
        <div><div className="table-heading"><span>Plain-language math</span><h2>What is calculated</h2></div><ol className="formula-list">{result.formulas.map((formula) => <li key={formula}>{formula}</li>)}</ol></div>
        <aside className="limitation-panel"><span>Model boundary</span><h2>What this cannot know</h2><p>Delta does not publish aircraft-level maintenance condition, engine shop visits, negotiated prices, lease offers, route assignments, or an exact 737-800 retirement plan.</p><p>A real fleet team would need those details before making a decision.</p></aside>
      </div>
      <details className="assumption-notes">
        <summary>Read the note behind every input</summary>
        <div>{ASSUMPTION_NOTES.map((item) => <article key={item.id}><strong>{item.label}</strong><span>{String(result.assumptions[item.id])}</span><p>{item.note}</p></article>)}</div>
      </details>
      <div className="method-note"><strong>About the replacement schedule</strong><p>Delta reports 27 deliveries in 2027, 39 in 2028, and 34 after 2028. The case study spreads that final group across 2029 and 2030, then allocates 77 of the 100 orders to this example. Delta has not disclosed that allocation.</p></div>
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<ViewId>(() => currentView());
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(() => assumptionsFromHash());
  const result = useMemo(() => runScenario(assumptions), [assumptions]);

  useEffect(() => {
    document.title = 'Delta 737 Replacement Lab | Nathan Mackey';
    const onHashChange = () => {
      setView(currentView());
      setAssumptions(assumptionsFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const nextHash = `#/${view}?${scenarioQuery(result.assumptions)}`;
    if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
  }, [result.assumptions, view]);

  const changeView = (next: ViewId) => {
    setView(next);
    window.location.hash = `#/${next}?${scenarioQuery(result.assumptions)}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => setAssumptions(DEFAULT_ASSUMPTIONS);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="#/decision" onClick={(event) => { event.preventDefault(); changeView('decision'); }}>
            <span className="brand-mark" aria-hidden="true">737</span>
            <span><strong>Delta 737 Replacement Lab</strong><small>Independent case study by Nathan Mackey</small></span>
          </a>
          <nav className="app-nav" aria-label="Main views">
            {NAV_ITEMS.map((item) => <a key={item.id} href={`#/${item.id}`} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); changeView(item.id); }}>{item.label}</a>)}
          </nav>
        </div>
      </header>
      <main>
        {view === 'decision' && <DecisionView assumptions={result.assumptions} setAssumptions={setAssumptions} result={result} onReset={reset} />}
        {view === 'evidence' && <EvidenceView />}
        {view === 'assumptions' && <AssumptionsView assumptions={result.assumptions} setAssumptions={setAssumptions} result={result} onReset={reset} />}
      </main>
      <footer><p>Independent educational case study. Not affiliated with or endorsed by Delta Air Lines. Results are estimates, not company forecasts.</p></footer>
    </div>
  );
}
