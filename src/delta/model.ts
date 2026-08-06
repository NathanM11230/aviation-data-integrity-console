import { factById } from './data';
import type {
  ScenarioAssumptions,
  ScenarioResult,
  StrategyId,
  StrategyResult,
  YearResult,
} from './types';

export const MODEL_START_YEAR = 2026;
export const MODEL_END_YEAR = 2035;

export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
  fuelPricePerGallon: 2.30,
  deliveryDelayYears: 0,
  annualDemandGrowthPct: 0,
  maintenanceChangePct: 0,
  annualFlightHours: 3_000,
  replacementStartYear: 2028,
  oldFuelBurnGallonsPerHour: 800,
  newFuelEfficiencyImprovementPct: 20,
  oldMaintenancePerPlaneM: 4.8,
  annualAgeMaintenanceGrowthPct: 3.5,
  newMaintenancePerPlaneM: 2.2,
  replacementPricePerPlaneM: 70,
  replacementUsefulLifeYears: 20,
  temporaryLeasePerPlaneM: 7,
  transitionCostPerPlaneM: 1.5,
  discountRatePct: 8,
  retirementYears: 5,
};

export const ASSUMPTION_NOTES: { id: keyof ScenarioAssumptions; label: string; note: string }[] = [
  { id: 'fuelPricePerGallon', label: 'Fuel price', note: 'Scenario input. The starting value is Delta\'s reported 2025 average, not a forecast.' },
  { id: 'deliveryDelayYears', label: 'Delivery delay', note: 'Scenario input applied to the 737-10 schedule reported in Delta\'s filing.' },
  { id: 'annualDemandGrowthPct', label: 'Annual travel-demand growth', note: 'Case-study assumption used to estimate the number of seats required.' },
  { id: 'maintenanceChangePct', label: 'Maintenance-cost change', note: 'Scenario adjustment applied to the illustrative cost of maintaining an older aircraft.' },
  { id: 'annualFlightHours', label: 'Hours flown per plane', note: 'Illustrative flying-level assumption. Delta does not publish this figure for the 737-800 fleet in its 10-K.' },
  { id: 'replacementStartYear', label: 'Planned replacement year', note: 'The year this case study begins retiring the modeled 737-800 fleet. This is not a disclosed Delta plan.' },
  { id: 'oldFuelBurnGallonsPerHour', label: 'Older-aircraft fuel use', note: 'Illustrative working assumption, editable because route and operating conditions matter.' },
  { id: 'newFuelEfficiencyImprovementPct', label: 'New-aircraft fuel improvement', note: 'Starts at Boeing\'s reported 20% improvement. Delta has stated a broader 20% to 30% range.' },
  { id: 'oldMaintenancePerPlaneM', label: 'Older-aircraft annual maintenance', note: 'Illustrative cost assumption, not a Delta-disclosed 737-800 figure.' },
  { id: 'annualAgeMaintenanceGrowthPct', label: 'Annual growth in older-aircraft maintenance', note: 'Illustrative assumption showing how aging can make continued operation more expensive.' },
  { id: 'newMaintenancePerPlaneM', label: 'New-aircraft annual maintenance', note: 'Illustrative cost assumption, not a Delta contract or forecast.' },
  { id: 'replacementPricePerPlaneM', label: 'Price per replacement aircraft', note: 'Illustrative price assumption. Delta does not disclose its negotiated 737-10 unit price.' },
  { id: 'replacementUsefulLifeYears', label: 'Years used to spread purchase cost', note: 'Case-study accounting assumption used for comparison, not Delta\'s depreciation policy.' },
  { id: 'temporaryLeasePerPlaneM', label: 'Temporary annual lease cost', note: 'Illustrative lease assumption. Actual availability and lease rates change with the market.' },
  { id: 'transitionCostPerPlaneM', label: 'One-time transition cost', note: 'Illustrative allowance for training, spares, and entry-into-service work.' },
  { id: 'discountRatePct', label: 'Value of future costs', note: 'Case-study rate used to express future costs in 2026 dollars.' },
  { id: 'retirementYears', label: 'Years to complete replacement', note: 'Case-study assumption controlling how quickly the 77 older aircraft leave the modeled fleet.' },
];

const STRATEGY_COPY: Record<StrategyId, Pick<StrategyResult, 'label' | 'shortLabel' | 'description'>> = {
  keep: {
    label: 'Keep and improve the 737-800s',
    shortLabel: 'Keep + improve',
    description: 'Continue operating all 77 aircraft through 2035 while making Delta\'s announced efficiency improvements. No unsupported finlet savings are added to the estimate.',
  },
  replace: {
    label: 'Replace aircraft as deliveries arrive',
    shortLabel: 'Replace',
    description: 'Retire aircraft only when an allocated replacement has arrived, even if the original retirement plan moves faster.',
  },
  lease: {
    label: 'Retire on plan and lease the difference',
    shortLabel: 'Lease temporarily',
    description: 'Follow the selected retirement timing and temporarily lease aircraft whenever deliveries or demand leave too few seats.',
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAssumptions(input: ScenarioAssumptions): ScenarioAssumptions {
  return {
    fuelPricePerGallon: clamp(input.fuelPricePerGallon, 1, 6),
    deliveryDelayYears: Math.round(clamp(input.deliveryDelayYears, 0, 4)),
    annualDemandGrowthPct: clamp(input.annualDemandGrowthPct, -3, 6),
    maintenanceChangePct: clamp(input.maintenanceChangePct, -20, 40),
    annualFlightHours: Math.round(clamp(input.annualFlightHours, 2_000, 4_000)),
    replacementStartYear: Math.round(clamp(input.replacementStartYear, 2027, 2033)),
    oldFuelBurnGallonsPerHour: clamp(input.oldFuelBurnGallonsPerHour, 600, 1_000),
    newFuelEfficiencyImprovementPct: clamp(input.newFuelEfficiencyImprovementPct, 10, 35),
    oldMaintenancePerPlaneM: clamp(input.oldMaintenancePerPlaneM, 2, 9),
    annualAgeMaintenanceGrowthPct: clamp(input.annualAgeMaintenanceGrowthPct, 0, 10),
    newMaintenancePerPlaneM: clamp(input.newMaintenancePerPlaneM, 1, 6),
    replacementPricePerPlaneM: clamp(input.replacementPricePerPlaneM, 45, 110),
    replacementUsefulLifeYears: Math.round(clamp(input.replacementUsefulLifeYears, 15, 30)),
    temporaryLeasePerPlaneM: clamp(input.temporaryLeasePerPlaneM, 3, 15),
    transitionCostPerPlaneM: clamp(input.transitionCostPerPlaneM, 0, 5),
    discountRatePct: clamp(input.discountRatePct, 0, 15),
    retirementYears: Math.round(clamp(input.retirementYears, 3, 8)),
  };
}

/**
 * The filing reports 34 deliveries only as "after 2028". The case study splits
 * that bucket evenly between 2029 and 2030, then allocates 77 of the 100 orders
 * to this example in proportion to the reported delivery schedule.
 */
export function allocatedDeliverySchedule(delayYears: number): Record<number, number> {
  const base = [
    [2027, 21],
    [2028, 30],
    [2029, 13],
    [2030, 13],
  ] as const;
  return Object.fromEntries(base.map(([year, count]) => [year + delayYears, count]));
}

function plannedRetirements(year: number, assumptions: ScenarioAssumptions, fleetSize: number): number {
  if (year < assumptions.replacementStartYear) return 0;
  const elapsed = year - assumptions.replacementStartYear + 1;
  return Math.min(fleetSize, Math.ceil((fleetSize * elapsed) / assumptions.retirementYears));
}

function calculateStrategy(id: StrategyId, assumptions: ScenarioAssumptions): StrategyResult {
  const oldFleetSize = Number(factById('b737-800-count').value);
  const oldAverageAge = Number(factById('b737-800-age').value);
  const oldSeats = Number(factById('b737-800-seats').value);
  const newSeats = Number(factById('b737-10-seats').value);
  const deliveries = allocatedDeliverySchedule(assumptions.deliveryDelayYears);
  const years: YearResult[] = [];
  let delivered = 0;
  let previousNewPlanes = 0;

  for (let year = MODEL_START_YEAR; year <= MODEL_END_YEAR; year += 1) {
    delivered = Math.min(oldFleetSize, delivered + (deliveries[year] ?? 0));
    const targetRetired = plannedRetirements(year, assumptions, oldFleetSize);
    const retired = id === 'keep' ? 0 : id === 'replace' ? Math.min(targetRetired, delivered) : targetRetired;
    const oldPlanes = oldFleetSize - retired;
    // Only replacements actually assigned to the retiring cohort enter this
    // case study. Other committed deliveries may support growth or other fleets.
    const newPlanes = id === 'keep' ? 0 : Math.min(delivered, targetRetired);
    const yearsFromStart = year - MODEL_START_YEAR;
    const demandMultiplier = (1 + assumptions.annualDemandGrowthPct / 100) ** yearsFromStart;
    const utilizationMultiplier = DEFAULT_ASSUMPTIONS.annualFlightHours / assumptions.annualFlightHours;
    const seatsNeeded = oldFleetSize * oldSeats * demandMultiplier * utilizationMultiplier;
    const planesNeeded = Math.ceil(seatsNeeded / oldSeats);
    const availableSeatsBeforeLease = oldPlanes * oldSeats + newPlanes * newSeats;
    const missingSeats = Math.max(0, seatsNeeded - availableSeatsBeforeLease);
    const leaseNeed = Math.ceil(missingSeats / oldSeats);
    const leasedPlanes = id === 'lease' ? leaseNeed : 0;
    const planesShort = id === 'lease' ? 0 : leaseNeed;
    const totalAvailableSeats = availableSeatsBeforeLease + leasedPlanes * oldSeats;
    const activityRatio = totalAvailableSeats > 0 ? Math.min(1, seatsNeeded / totalAvailableSeats) : 1;

    const oldFuelM = oldPlanes * assumptions.annualFlightHours * assumptions.oldFuelBurnGallonsPerHour * assumptions.fuelPricePerGallon / 1_000_000;
    const newFuelM = newPlanes * assumptions.annualFlightHours * assumptions.oldFuelBurnGallonsPerHour
      * (1 - assumptions.newFuelEfficiencyImprovementPct / 100) * assumptions.fuelPricePerGallon / 1_000_000;
    const leasedFuelM = leasedPlanes * assumptions.annualFlightHours * assumptions.oldFuelBurnGallonsPerHour
      * assumptions.fuelPricePerGallon / 1_000_000;
    const fuelCostM = (oldFuelM + newFuelM + leasedFuelM) * activityRatio;

    const agingFactor = (1 + assumptions.annualAgeMaintenanceGrowthPct / 100) ** yearsFromStart;
    const maintenanceCostM = oldPlanes * assumptions.oldMaintenancePerPlaneM
      * (1 + assumptions.maintenanceChangePct / 100) * agingFactor
      + newPlanes * assumptions.newMaintenancePerPlaneM;
    const newlyDelivered = Math.max(0, newPlanes - previousNewPlanes);
    const ownershipCostM = newPlanes * assumptions.replacementPricePerPlaneM / assumptions.replacementUsefulLifeYears
      + newlyDelivered * assumptions.transitionCostPerPlaneM
      + leasedPlanes * assumptions.temporaryLeasePerPlaneM;
    const annualCostM = fuelCostM + maintenanceCostM + ownershipCostM;
    const totalPlanes = oldPlanes + newPlanes + leasedPlanes;
    const averageAge = totalPlanes > 0
      ? (oldPlanes * (oldAverageAge + yearsFromStart) + newPlanes * Math.max(0.5, yearsFromStart / 2) + leasedPlanes * 8) / totalPlanes
      : 0;

    years.push({
      year,
      planesNeeded,
      oldPlanes,
      newPlanes,
      leasedPlanes,
      planesShort,
      annualCostM,
      fuelCostM,
      maintenanceCostM,
      ownershipCostM,
      averageAge,
    });
    previousNewPlanes = newPlanes;
  }

  const rate = assumptions.discountRatePct / 100;
  const tenYearCostM = years.reduce((sum, row, index) => sum + row.annualCostM / (1 + rate) ** index, 0);
  return {
    id,
    ...STRATEGY_COPY[id],
    years,
    tenYearCostM,
    lowEstimateM: tenYearCostM * 0.85,
    highEstimateM: tenYearCostM * 1.15,
    peakPlanesShort: Math.max(...years.map((row) => row.planesShort)),
    maxLeasedPlanes: Math.max(...years.map((row) => row.leasedPlanes)),
    endAverageAge: years.at(-1)?.averageAge ?? 0,
  };
}

function findReplacementCheaperYear(keep: StrategyResult, replace: StrategyResult, rate: number): number | null {
  let keepTotal = 0;
  let replaceTotal = 0;
  for (let index = 0; index < keep.years.length; index += 1) {
    const keepYear = keep.years[index];
    const replaceYear = replace.years[index];
    if (!keepYear || !replaceYear) continue;
    keepTotal += keepYear.annualCostM / (1 + rate) ** index;
    replaceTotal += replaceYear.annualCostM / (1 + rate) ** index;
    if (replaceYear.newPlanes > 0 && replaceTotal <= keepTotal) return replaceYear.year;
  }
  return null;
}

function chooseRecommendation(strategies: Record<StrategyId, StrategyResult>): StrategyId {
  const feasible = (Object.values(strategies) as StrategyResult[]).filter((strategy) => strategy.peakPlanesShort === 0);
  const choices = feasible.length > 0 ? feasible : Object.values(strategies);
  return choices.reduce((best, candidate) => candidate.tenYearCostM < best.tenYearCostM ? candidate : best).id;
}

function explanationFor(
  recommendation: StrategyId,
  strategies: Record<StrategyId, StrategyResult>,
  replacementCheaperYear: number | null,
  assumptions: ScenarioAssumptions,
): { title: string; explanation: string } {
  const replace = strategies.replace;
  if (recommendation === 'keep') {
    const saving = Math.max(0, replace.tenYearCostM - strategies.keep.tenYearCostM);
    return {
      title: 'Keep and improve the 737-800s for longer',
      explanation: `The model estimates that keeping the older fleet costs about $${Math.round(saving)} million less through 2035. Replacement does not recover its added ownership cost${replacementCheaperYear ? ` until ${replacementCheaperYear}` : ' within the modeled period'}.`,
    };
  }
  if (recommendation === 'lease') {
    const leaseCount = strategies.lease.maxLeasedPlanes;
    const leaseLabel = leaseCount === 1 ? 'one plane' : `${leaseCount} planes`;
    const pressure = assumptions.deliveryDelayYears > 0
      ? `A ${assumptions.deliveryDelayYears}-year delivery delay`
      : 'The selected demand and retirement timing';
    return {
      title: 'Lease planes temporarily while deliveries catch up',
      explanation: `${pressure} leave too few seats. Temporarily leasing up to ${leaseLabel} keeps the schedule covered while replacements arrive.`,
    };
  }
  const saving = strategies.keep.tenYearCostM - replace.tenYearCostM;
  const delayText = assumptions.deliveryDelayYears > 0
    ? ` Older aircraft stay in service until the delayed replacements arrive.`
    : '';
  if (strategies.keep.peakPlanesShort > 0 && saving <= 0) {
    return {
      title: 'Replace aircraft as the new planes arrive',
      explanation: `Keeping only the older fleet could leave the schedule short by up to ${strategies.keep.peakPlanesShort} planes as demand grows. Replacement provides enough seats, although this public-data model estimates it costs about $${Math.round(Math.abs(saving))} million more through 2035.${delayText}`,
    };
  }
  return {
    title: 'Replace aircraft as the new planes arrive',
    explanation: `The model estimates about $${Math.round(Math.max(0, saving))} million lower cost through 2035 while providing enough seats.${delayText}`,
  };
}

function rawScenario(assumptions: ScenarioAssumptions): {
  strategies: Record<StrategyId, StrategyResult>;
  replacementCheaperYear: number | null;
} {
  const keep = calculateStrategy('keep', assumptions);
  const replace = calculateStrategy('replace', assumptions);
  const lease = calculateStrategy('lease', assumptions);
  return {
    strategies: { keep, replace, lease },
    replacementCheaperYear: findReplacementCheaperYear(keep, replace, assumptions.discountRatePct / 100),
  };
}

function findMostInfluentialAssumption(assumptions: ScenarioAssumptions, baseDifference: number): string {
  const tests: { key: keyof ScenarioAssumptions; amount: number; label: string }[] = [
    { key: 'fuelPricePerGallon', amount: 0.5, label: 'Fuel price' },
    { key: 'deliveryDelayYears', amount: 1, label: 'Delivery timing' },
    { key: 'annualDemandGrowthPct', amount: 0.5, label: 'Travel demand' },
    { key: 'maintenanceChangePct', amount: 5, label: 'Maintenance cost' },
    { key: 'annualFlightHours', amount: 250, label: 'Hours flown per plane' },
    { key: 'replacementStartYear', amount: 1, label: 'Replacement timing' },
  ];
  const ranked = tests.map((test) => {
    const changed = normalizeAssumptions({ ...assumptions, [test.key]: assumptions[test.key] + test.amount });
    const result = rawScenario(changed).strategies;
    const difference = result.replace.tenYearCostM - result.keep.tenYearCostM;
    return { label: test.label, impact: Math.abs(difference - baseDifference) };
  }).sort((a, b) => b.impact - a.impact);
  return ranked[0]?.label ?? 'Fuel price';
}

function summarizeChanges(assumptions: ScenarioAssumptions): string {
  const changes: string[] = [];
  if (assumptions.fuelPricePerGallon !== DEFAULT_ASSUMPTIONS.fuelPricePerGallon) changes.push(`fuel at $${assumptions.fuelPricePerGallon.toFixed(2)}`);
  if (assumptions.deliveryDelayYears !== DEFAULT_ASSUMPTIONS.deliveryDelayYears) changes.push(`${assumptions.deliveryDelayYears}-year delivery delay`);
  if (assumptions.annualDemandGrowthPct !== DEFAULT_ASSUMPTIONS.annualDemandGrowthPct) changes.push(`${assumptions.annualDemandGrowthPct.toFixed(1)}% demand growth`);
  if (assumptions.maintenanceChangePct !== DEFAULT_ASSUMPTIONS.maintenanceChangePct) changes.push(`${assumptions.maintenanceChangePct > 0 ? '+' : ''}${assumptions.maintenanceChangePct}% maintenance`);
  if (assumptions.annualFlightHours !== DEFAULT_ASSUMPTIONS.annualFlightHours) changes.push(`${assumptions.annualFlightHours.toLocaleString()} hours per plane`);
  if (assumptions.replacementStartYear !== DEFAULT_ASSUMPTIONS.replacementStartYear) changes.push(`replacement starting ${assumptions.replacementStartYear}`);
  return changes.length === 0 ? 'This is the starting scenario.' : `Changed from the starting scenario: ${changes.join(', ')}.`;
}

export function runScenario(input: ScenarioAssumptions): ScenarioResult {
  const assumptions = normalizeAssumptions(input);
  const { strategies, replacementCheaperYear } = rawScenario(assumptions);
  const recommendedStrategy = chooseRecommendation(strategies);
  const copy = explanationFor(recommendedStrategy, strategies, replacementCheaperYear, assumptions);
  const baseDifference = strategies.replace.tenYearCostM - strategies.keep.tenYearCostM;

  return {
    assumptions,
    strategies,
    recommendedStrategy,
    recommendationTitle: copy.title,
    recommendationExplanation: copy.explanation,
    replacementCheaperYear,
    firstDeliveryYear: 2027 + assumptions.deliveryDelayYears,
    mostInfluentialAssumption: findMostInfluentialAssumption(assumptions, baseDifference),
    changeSummary: summarizeChanges(assumptions),
    formulas: [
      'Planes needed = 77 starting aircraft x travel-demand growth x 3,000 baseline hours / selected hours flown.',
      'Fuel cost = aircraft x hours flown x estimated gallons per hour x selected fuel price.',
      'Expected maintenance cost = aircraft x annual maintenance assumption, with the selected increase and aging adjustment.',
      'Replacement ownership cost = estimated aircraft price / years used to spread that cost, plus a one-time transition allowance.',
      'Ten-year estimated cost = annual costs from 2026 through 2035, expressed in 2026 dollars using the selected rate.',
    ],
    factIds: [
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
    ],
    assumptionIds: ASSUMPTION_NOTES.map((item) => item.id),
  };
}
