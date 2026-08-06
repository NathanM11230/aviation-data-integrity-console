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

const STARTING_SCENARIO = runScenario(DEFAULT_ASSUMPTIONS);

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
  onReset,
}: {
  assumptions: ScenarioAssumptions;
  setAssumptions: Dispatch<SetStateAction<ScenarioAssumptions>>;
  onReset: () => void;
}) {
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
          onChange={(value) => updateAssumption(setAssumptions, 'annualDemandGrowthPct', value)}
        />
      </div>
    </section>
  );
}

type NumberOrigin = {
  value: string;
  name: string;
  explanation: string;
  kind: 'Reported' | 'Slider' | 'Estimate' | 'Model rule';
  url?: string;
};

function formatLedgerMoney(millions: number): string {
  return `$${millions.toFixed(1)}M`;
}

function formatSignedMoney(millions: number, digits = 1): string {
  if (Math.abs(millions) < 0.05) return '$0M';
  return `${millions > 0 ? '+' : '-'}${formatMoney(Math.abs(millions), digits)}`;
}

function formatSignedLedgerMoney(millions: number): string {
  if (Math.abs(millions) < 0.05) return '$0.0M';
  return `${millions > 0 ? '+' : '-'}$${Math.abs(millions).toFixed(1)}M`;
}

function formatSignedPercent(current: number, starting: number): string {
  if (starting === 0) return 'n/a';
  const percentage = ((current - starting) / starting) * 100;
  if (Math.abs(percentage) < 0.05) return '0.0%';
  return `${percentage > 0 ? '+' : ''}${percentage.toFixed(1)}%`;
}

function comparisonTone(change: number): string {
  if (Math.abs(change) < 0.05) return 'cost-flat';
  return change > 0 ? 'cost-up' : 'cost-down';
}

function LedgerValue({ current, starting }: { current: string; starting: string }) {
  return <div className="ledger-value"><strong>{current}</strong><small>Start {starting}</small></div>;
}

function LedgerCost({ current, starting }: { current: number; starting: number }) {
  const change = current - starting;
  return (
    <div className="ledger-value ledger-cost">
      <strong>{formatLedgerMoney(current)}</strong>
      <small>Start {formatLedgerMoney(starting)} <em className={comparisonTone(change)}>{formatSignedLedgerMoney(change)}</em></small>
    </div>
  );
}

function LedgerDiscountedCost({ current, starting }: { current: number; starting: number }) {
  const change = current - starting;
  return (
    <div className="ledger-value ledger-comparison">
      <span><small>Current</small><strong>{formatLedgerMoney(current)}</strong></span>
      <span><small>Start</small><strong>{formatLedgerMoney(starting)}</strong></span>
      <span className={comparisonTone(change)}><small>Change</small><strong>{formatSignedLedgerMoney(change)} ({formatSignedPercent(current, starting)})</strong></span>
    </div>
  );
}

function LiveDecisionLedger({ result }: { result: ScenarioResult }) {
  const strategy = result.strategies[result.recommendedStrategy];
  const startingStrategy = STARTING_SCENARIO.strategies[result.recommendedStrategy];
  const totalChange = strategy.tenYearCostM - startingStrategy.tenYearCostM;
  const coverage = strategy.peakPlanesShort === 0 ? 'Covered' : `${strategy.peakPlanesShort} short`;

  return (
    <section className="live-decision-ledger" aria-labelledby="live-ledger-title" aria-live="polite">
      <div className="live-ledger-heading">
        <div><span>Live 10-year view</span><h2 id="live-ledger-title">See the effect year by year</h2></div>
        <div className="live-strategy"><span>Suggested</span><strong>{strategy.shortLabel}</strong></div>
      </div>
      <div className="live-ledger-metrics">
        <div><small>Current midpoint</small><strong>{formatMoney(strategy.tenYearCostM, 2)}</strong></div>
        <div><small>Versus starting scenario</small><strong className={comparisonTone(totalChange)}>{formatSignedMoney(totalChange)} ({formatSignedPercent(strategy.tenYearCostM, startingStrategy.tenYearCostM)})</strong></div>
        <div><small>Aircraft coverage</small><strong>{coverage}</strong></div>
        <div><small>Most sensitive input</small><strong>{result.mostInfluentialAssumption}</strong></div>
      </div>
      <p className="live-recommendation"><strong>{result.recommendationTitle}.</strong> {result.recommendationExplanation} {result.changeSummary}</p>
      <div className="live-ledger-guide"><span>Current value</span><span>Starting value</span><span>Change from start</span></div>
      <div className="ledger-wrap live-ledger-wrap">
        <table className="cost-ledger live-cost-ledger">
          <thead><tr><th>Year</th><th>Fleet: old / new / leased</th><th>Arrivals</th><th>Needed</th><th>Fuel</th><th>Maintenance</th><th>Aircraft</th><th>2026-dollar total</th></tr></thead>
          <tbody>{strategy.years.map((year, index) => {
            const startingYear = startingStrategy.years[index]!;
            return (
              <tr key={year.year}>
                <th>{year.year}</th>
                <td><LedgerValue current={`${year.oldPlanes} / ${year.newPlanes} / ${year.leasedPlanes}`} starting={`${startingYear.oldPlanes} / ${startingYear.newPlanes} / ${startingYear.leasedPlanes}`} /></td>
                <td><LedgerValue current={String(year.newDeliveries)} starting={String(startingYear.newDeliveries)} /></td>
                <td><LedgerValue current={String(year.planesNeeded)} starting={String(startingYear.planesNeeded)} /></td>
                <td><LedgerCost current={year.fuelCostM} starting={startingYear.fuelCostM} /></td>
                <td><LedgerCost current={year.maintenanceCostM} starting={startingYear.maintenanceCostM} /></td>
                <td><LedgerCost current={year.ownershipCostM} starting={startingYear.ownershipCostM} /></td>
                <td><LedgerDiscountedCost current={year.discountedCostM} starting={startingYear.discountedCostM} /></td>
              </tr>
            );
          })}</tbody>
          <tfoot><tr><th colSpan={4}>Discounted totals</th><td><LedgerCost current={strategy.tenYearFuelCostM} starting={startingStrategy.tenYearFuelCostM} /></td><td><LedgerCost current={strategy.tenYearMaintenanceCostM} starting={startingStrategy.tenYearMaintenanceCostM} /></td><td><LedgerCost current={strategy.tenYearAircraftCostM} starting={startingStrategy.tenYearAircraftCostM} /></td><td><LedgerDiscountedCost current={strategy.tenYearCostM} starting={startingStrategy.tenYearCostM} /></td></tr></tfoot>
        </table>
      </div>
      <p className="ledger-note">Fleet is 737-800 / 737-10 / temporary aircraft. Cost columns show the current annual amount, the starting amount, and the change. The final column expresses each year in 2026 dollars.</p>
    </section>
  );
}

function CalculationAudit({ result }: { result: ScenarioResult }) {
  const strategy = result.strategies[result.recommendedStrategy];
  const startingStrategy = STARTING_SCENARIO.strategies[result.recommendedStrategy];
  const a = result.assumptions;
  const fleetSource = sourceById(factById('b737-800-count').sourceId);
  const deliverySource = sourceById(factById('b737-10-2027').sourceId);
  const efficiencySource = sourceById(factById('max-fuel-improvement').sourceId);
  const fuelSource = sourceById(factById('fuel-price-2025').sourceId);
  const maintenanceOperator = a.maintenanceChangePct >= 0 ? '+' : '-';
  const demandOperator = a.annualDemandGrowthPct >= 0 ? '+' : '-';
  const delayLabel = a.deliveryDelayYears === 1 ? '1 year' : `${a.deliveryDelayYears} years`;
  const numbers: NumberOrigin[] = [
    { value: '77', name: 'Starting 737-800 aircraft', explanation: 'Delta reported 77 aircraft at December 31, 2025.', kind: 'Reported', url: fleetSource.url },
    { value: '2026-2035', name: 'Comparison window', explanation: 'Ten annual periods used consistently for every strategy.', kind: 'Model rule' },
    { value: `$${a.fuelPricePerGallon.toFixed(2)}/gal`, name: 'Fuel price', explanation: 'Current scenario slider. The $2.30 starting point is Delta\'s reported 2025 average.', kind: 'Slider', url: fuelSource.url },
    { value: `${a.annualFlightHours.toLocaleString()} hr`, name: 'Hours per aircraft', explanation: 'Editable annual flying estimate from the Assumptions page.', kind: 'Estimate' },
    { value: `${a.oldFuelBurnGallonsPerHour.toLocaleString()} gal/hr`, name: '737-800 fuel use', explanation: 'Editable working estimate. Route and operating conditions can change actual burn.', kind: 'Estimate' },
    { value: `${a.newFuelEfficiencyImprovementPct}%`, name: '737-10 fuel improvement', explanation: 'Editable estimate starting at Boeing\'s published MAX-family improvement.', kind: 'Estimate', url: efficiencySource.url },
    { value: `$${a.oldMaintenancePerPlaneM.toFixed(1)}M`, name: '737-800 maintenance per year', explanation: 'Editable per-aircraft estimate because Delta does not disclose this fleet-level figure.', kind: 'Estimate' },
    { value: `${a.maintenanceChangePct >= 0 ? '+' : ''}${a.maintenanceChangePct}%`, name: 'Maintenance scenario change', explanation: 'Current slider adjustment applied to the older fleet\'s maintenance estimate.', kind: 'Slider' },
    { value: `${a.annualAgeMaintenanceGrowthPct}%`, name: 'Annual aging increase', explanation: 'Editable yearly increase applied to 737-800 maintenance after 2026.', kind: 'Estimate' },
    { value: `$${a.newMaintenancePerPlaneM.toFixed(1)}M`, name: '737-10 maintenance per year', explanation: 'Editable per-aircraft estimate, not a Delta-disclosed contract value.', kind: 'Estimate' },
    { value: `$${a.replacementPricePerPlaneM}M`, name: 'Replacement aircraft price', explanation: 'Editable estimate because Delta\'s negotiated unit price is private.', kind: 'Estimate' },
    { value: `${a.replacementUsefulLifeYears} years`, name: 'Years used to spread aircraft price', explanation: 'Model allocation period used to compare annual ownership cost.', kind: 'Estimate' },
    { value: `$${a.transitionCostPerPlaneM.toFixed(1)}M`, name: 'Transition cost per delivery', explanation: 'Editable allowance for training, spares, and entry-into-service work.', kind: 'Estimate' },
    { value: `$${a.temporaryLeasePerPlaneM.toFixed(1)}M`, name: 'Temporary lease per year', explanation: 'Editable estimate applied only when the lease strategy needs another aircraft.', kind: 'Estimate' },
    { value: `${a.discountRatePct}%`, name: 'Discount rate', explanation: 'Converts each future annual cost into 2026 dollars before summing.', kind: 'Estimate' },
    { value: `${a.annualDemandGrowthPct >= 0 ? '+' : ''}${a.annualDemandGrowthPct.toFixed(1)}%`, name: 'Annual demand growth', explanation: 'Current slider, compounded once per year to determine aircraft needed.', kind: 'Slider' },
    { value: '2027', name: 'Reported first delivery year', explanation: 'Delta\'s reported starting year for 737-10 commitments in the source schedule.', kind: 'Reported', url: deliverySource.url },
    { value: delayLabel, name: 'Delivery delay', explanation: 'Current slider added to every allocated delivery year.', kind: 'Slider' },
    { value: '21 / 30 / 13 / 13', name: 'Allocated replacement deliveries', explanation: 'Model allocation of 77 aircraft across 2027-2030, shifted by the selected delay.', kind: 'Model rule' },
    { value: String(a.replacementStartYear), name: 'Planned replacement start', explanation: 'Editable first year in which the case study attempts retirements.', kind: 'Estimate' },
    { value: `${a.retirementYears} years`, name: 'Replacement period', explanation: 'Editable period used to spread retirement of all 77 aircraft.', kind: 'Estimate' },
    { value: '1,000,000', name: 'Dollar-unit conversion', explanation: 'Converts dollar calculations into the millions displayed by the model.', kind: 'Model rule' },
    { value: '85% / 115%', name: 'Uncertainty bounds', explanation: 'Displays a transparent plus-or-minus 15% range around the modeled midpoint.', kind: 'Model rule' },
  ];

  return (
    <section className="calculation-audit" aria-labelledby="calculation-title">
      <div className="calculation-heading">
        <div><span>Complete calculation</span><h2 id="calculation-title">How the total is built</h2></div>
        <p>Suggested strategy: <strong>{strategy.label}</strong></p>
      </div>

      <div className="master-equation">
        <span>Master equation</span>
        <code>Total cost = Sum from y=2026 to 2035 of [(Fuel_y + Maintenance_y + Aircraft_y) x 1 / (1 + {a.discountRatePct}%)^(y - 2026)]</code>
        <div className="master-substitution">
          <div><small>Discounted fuel</small><strong>{formatMoney(strategy.tenYearFuelCostM, 2)}</strong><span className={comparisonTone(strategy.tenYearFuelCostM - startingStrategy.tenYearFuelCostM)}>Start {formatMoney(startingStrategy.tenYearFuelCostM, 2)} | {formatSignedMoney(strategy.tenYearFuelCostM - startingStrategy.tenYearFuelCostM)} change</span></div>
          <b>+</b>
          <div><small>Discounted maintenance</small><strong>{formatMoney(strategy.tenYearMaintenanceCostM, 2)}</strong><span className={comparisonTone(strategy.tenYearMaintenanceCostM - startingStrategy.tenYearMaintenanceCostM)}>Start {formatMoney(startingStrategy.tenYearMaintenanceCostM, 2)} | {formatSignedMoney(strategy.tenYearMaintenanceCostM - startingStrategy.tenYearMaintenanceCostM)} change</span></div>
          <b>+</b>
          <div><small>Discounted aircraft, transition, and leases</small><strong>{formatMoney(strategy.tenYearAircraftCostM, 2)}</strong><span className={comparisonTone(strategy.tenYearAircraftCostM - startingStrategy.tenYearAircraftCostM)}>Start {formatMoney(startingStrategy.tenYearAircraftCostM, 2)} | {formatSignedMoney(strategy.tenYearAircraftCostM - startingStrategy.tenYearAircraftCostM)} change</span></div>
          <b>=</b>
          <div className="master-total"><small>Modeled midpoint</small><strong>{formatMoney(strategy.tenYearCostM, 2)}</strong><span className={comparisonTone(strategy.tenYearCostM - startingStrategy.tenYearCostM)}>Start {formatMoney(startingStrategy.tenYearCostM, 2)} | {formatSignedMoney(strategy.tenYearCostM - startingStrategy.tenYearCostM)} ({formatSignedPercent(strategy.tenYearCostM, startingStrategy.tenYearCostM)})</span></div>
        </div>
        <div className="master-range"><code>{formatMoney(strategy.tenYearCostM, 2)} x 85% to 115%</code><b>=</b><strong>{formatRange(strategy)}</strong><span>uncertainty range</span></div>
      </div>

      <div className="subformula-heading"><span>Subdivisions</span><h3>What each annual cost contains</h3></div>
      <div className="subformula-grid">
        <article>
          <span>Fuel in year y</span>
          <code>[(old_y x {a.annualFlightHours.toLocaleString()} x {a.oldFuelBurnGallonsPerHour.toLocaleString()}) + (new_y x {a.annualFlightHours.toLocaleString()} x {a.oldFuelBurnGallonsPerHour.toLocaleString()} x (1 - {a.newFuelEfficiencyImprovementPct}%)) + (leased_y x {a.annualFlightHours.toLocaleString()} x {a.oldFuelBurnGallonsPerHour.toLocaleString()})] x ${a.fuelPricePerGallon.toFixed(2)} x activity_y / 1,000,000</code>
          <p><strong>Discounted ten-year fuel:</strong> {formatMoney(strategy.tenYearFuelCostM, 2)}. The activity factor prevents the model from charging for more flying than demand requires.</p>
        </article>
        <article>
          <span>Maintenance in year y</span>
          <code>old_y x ${a.oldMaintenancePerPlaneM.toFixed(1)}M x (1 {maintenanceOperator} {Math.abs(a.maintenanceChangePct)}%) x (1 + {a.annualAgeMaintenanceGrowthPct}%)^(y - 2026) + new_y x ${a.newMaintenancePerPlaneM.toFixed(1)}M</code>
          <p><strong>Discounted ten-year maintenance:</strong> {formatMoney(strategy.tenYearMaintenanceCostM, 2)}. Only the older fleet receives the annual aging increase.</p>
        </article>
        <article>
          <span>Aircraft, transition, and leases in year y</span>
          <code>new_y x ${a.replacementPricePerPlaneM}M / {a.replacementUsefulLifeYears} + new_deliveries_y x ${a.transitionCostPerPlaneM.toFixed(1)}M + leased_y x ${a.temporaryLeasePerPlaneM.toFixed(1)}M</code>
          <p><strong>Discounted ten-year aircraft cost:</strong> {formatMoney(strategy.tenYearAircraftCostM, 2)}. The purchase estimate is spread over the selected life; transition is charged once at delivery.</p>
        </article>
        <article>
          <span>Aircraft needed and delivery timing</span>
          <code>needed_y = ceil(77 x (1 {demandOperator} {Math.abs(a.annualDemandGrowthPct).toFixed(2)}%)^(y - 2026) x 3,000 / {a.annualFlightHours.toLocaleString()}); first arrival = 2027 + {delayLabel} = {result.firstDeliveryYear}</code>
          <p>These equations determine old_y, new_y, and leased_y. They change the cost equations even though demand and delay are not separate dollar charges.</p>
        </article>
      </div>

      <div className="symbol-key" aria-label="Equation symbol key">
        <div><code>y</code><span>Calendar year shown in the ledger</span></div>
        <div><code>old_y</code><span>737-800 aircraft available in that year</span></div>
        <div><code>new_y</code><span>737-10 aircraft available in that year</span></div>
        <div><code>leased_y</code><span>Temporary aircraft used in that year</span></div>
        <div><code>new_deliveries_y</code><span>737-10 aircraft arriving in that year</span></div>
        <div><code>activity_y</code><span>Share of available aircraft flying to meet demand</span></div>
      </div>

      <div className="audit-split-heading"><span>Number key</span><h3>Where every input comes from</h3></div>
      <div className="number-origin-list">
        {numbers.map((item) => (
          <article key={`${item.name}-${item.value}`}>
            <strong>{item.value}</strong>
            <div><span>{item.name}</span><p>{item.explanation}</p></div>
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.kind}</a> : <em className={`origin-${item.kind.toLowerCase().replace(' ', '-')}`}>{item.kind}</em>}
          </article>
        ))}
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
        <ScenarioControls assumptions={assumptions} setAssumptions={setAssumptions} onReset={onReset} />
        <LiveDecisionLedger result={result} />
      </div>
      <CalculationAudit result={result} />
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
