import { describe, expect, it } from 'vitest';
import { FACTS, FLEET, runDataChecks } from './data';
import {
  DEFAULT_ASSUMPTIONS,
  MODEL_END_YEAR,
  MODEL_START_YEAR,
  allocatedDeliverySchedule,
  normalizeAssumptions,
  runScenario,
} from './model';

describe('Delta source data', () => {
  it('reconciles every source check', () => {
    const checks = runDataChecks();
    expect(checks).toHaveLength(5);
    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it('keeps every fact connected to a primary source', () => {
    expect(FACTS.length).toBeGreaterThan(15);
    expect(FACTS.every((fact) => fact.sourceId && fact.location && fact.status === 'checked')).toBe(true);
  });

  it('models aircraft families rather than individual aircraft', () => {
    expect(FLEET.find((row) => row.model === 'B737-800')).toMatchObject({ total: 77, averageAge: 24.3, modeled: true });
    expect(FLEET.every((row) => !('registration' in row))).toBe(true);
  });
});

describe('delivery schedule', () => {
  it('allocates 77 replacements across the reported schedule', () => {
    const schedule = allocatedDeliverySchedule(0);
    expect(schedule).toEqual({ 2027: 21, 2028: 30, 2029: 13, 2030: 13 });
    expect(Object.values(schedule).reduce((sum, value) => sum + value, 0)).toBe(77);
  });

  it('moves every delivery by the selected delay', () => {
    expect(allocatedDeliverySchedule(2)).toEqual({ 2029: 21, 2030: 30, 2031: 13, 2032: 13 });
  });
});

describe('scenario model', () => {
  it('returns ten complete years for each choice', () => {
    const result = runScenario(DEFAULT_ASSUMPTIONS);
    for (const strategy of Object.values(result.strategies)) {
      expect(strategy.years).toHaveLength(MODEL_END_YEAR - MODEL_START_YEAR + 1);
      expect(strategy.years[0]?.year).toBe(MODEL_START_YEAR);
      expect(strategy.years.at(-1)?.year).toBe(MODEL_END_YEAR);
      expect(Number.isFinite(strategy.tenYearCostM)).toBe(true);
      expect(strategy.lowEstimateM).toBeLessThan(strategy.tenYearCostM);
      expect(strategy.highEstimateM).toBeGreaterThan(strategy.tenYearCostM);
      expect(strategy.tenYearFuelCostM + strategy.tenYearMaintenanceCostM + strategy.tenYearAircraftCostM)
        .toBeCloseTo(strategy.tenYearCostM, 8);
    }
  });

  it('uses only strategies that cover the modeled schedule for its recommendation', () => {
    const result = runScenario(DEFAULT_ASSUMPTIONS);
    expect(result.strategies[result.recommendedStrategy].peakPlanesShort).toBe(0);
  });

  it('makes replacement more attractive when fuel becomes expensive', () => {
    const lowFuel = runScenario({ ...DEFAULT_ASSUMPTIONS, fuelPricePerGallon: 1.5 });
    const highFuel = runScenario({ ...DEFAULT_ASSUMPTIONS, fuelPricePerGallon: 5.5 });
    const lowDifference = lowFuel.strategies.replace.tenYearCostM - lowFuel.strategies.keep.tenYearCostM;
    const highDifference = highFuel.strategies.replace.tenYearCostM - highFuel.strategies.keep.tenYearCostM;
    expect(highDifference).toBeLessThan(lowDifference);
  });

  it('retains older aircraft longer when deliveries are delayed', () => {
    const onTime = runScenario(DEFAULT_ASSUMPTIONS);
    const delayed = runScenario({ ...DEFAULT_ASSUMPTIONS, deliveryDelayYears: 2 });
    const onTime2029 = onTime.strategies.replace.years.find((row) => row.year === 2029)!;
    const delayed2029 = delayed.strategies.replace.years.find((row) => row.year === 2029)!;
    expect(delayed.firstDeliveryYear).toBe(2029);
    expect(delayed2029.oldPlanes).toBeGreaterThan(onTime2029.oldPlanes);
  });

  it('uses temporary aircraft to eliminate a planned shortage', () => {
    const stressed = runScenario({
      ...DEFAULT_ASSUMPTIONS,
      deliveryDelayYears: 4,
      annualDemandGrowthPct: 4,
      replacementStartYear: 2027,
    });
    expect(stressed.strategies.lease.maxLeasedPlanes).toBeGreaterThan(0);
    expect(stressed.strategies.lease.peakPlanesShort).toBe(0);
    expect(stressed.strategies.replace.peakPlanesShort).toBeGreaterThan(0);
  });

  it('preserves the facts and assumptions used by the result', () => {
    const result = runScenario(DEFAULT_ASSUMPTIONS);
    expect(result.factIds).toContain('b737-800-count');
    expect(result.factIds).toContain('b737-10-2027');
    expect(result.assumptionIds).toContain('replacementPricePerPlaneM');
    expect(result.formulas.length).toBeGreaterThanOrEqual(5);
  });

  it('builds exact live calculation receipts from the current scenario', () => {
    const result = runScenario({
      ...DEFAULT_ASSUMPTIONS,
      fuelPricePerGallon: 4.5,
      deliveryDelayYears: 2,
      maintenanceChangePct: 10,
      annualDemandGrowthPct: 3,
    });
    const calculations = Object.fromEntries(result.liveCalculations.map((item) => [item.id, item]));

    expect(calculations.fuel?.result).toBe('$831.6M');
    expect(calculations.fuel?.equation).toContain('$4.50');
    expect(calculations.delivery?.result).toBe('2029');
    expect(calculations.maintenance?.result).toBe('$406.6M');
    expect(calculations.demand?.result).toBe('101 planes');
  });

  it('clamps unsafe values at the model boundary', () => {
    const normalized = normalizeAssumptions({
      ...DEFAULT_ASSUMPTIONS,
      fuelPricePerGallon: 100,
      deliveryDelayYears: -5,
      annualFlightHours: 100,
      replacementStartYear: 2050,
    });
    expect(normalized.fuelPricePerGallon).toBe(6);
    expect(normalized.deliveryDelayYears).toBe(0);
    expect(normalized.annualFlightHours).toBe(2_000);
    expect(normalized.replacementStartYear).toBe(2033);
  });
});
