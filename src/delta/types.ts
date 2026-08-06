export type SourceStatus = 'checked' | 'needs-review';

export interface DataSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  asOf: string;
  accessed: string;
  note: string;
}

export interface SourcedFact<T = number | string> {
  id: string;
  label: string;
  value: T;
  displayValue: string;
  sourceId: string;
  location: string;
  status: SourceStatus;
  note?: string;
}

export interface FleetRow {
  model: string;
  owned: number;
  financeLease: number;
  operatingLease: number;
  total: number;
  averageAge: number | null;
  purchaseCommitments: number;
  options: number;
  modeled: boolean;
}

export interface DeliveryRow {
  model: string;
  year2026: number;
  year2027: number;
  year2028: number;
  after2028: number;
  total: number;
}

export interface ScenarioAssumptions {
  fuelPricePerGallon: number;
  deliveryDelayYears: number;
  annualDemandGrowthPct: number;
  maintenanceChangePct: number;
  annualFlightHours: number;
  replacementStartYear: number;
  oldFuelBurnGallonsPerHour: number;
  newFuelEfficiencyImprovementPct: number;
  oldMaintenancePerPlaneM: number;
  annualAgeMaintenanceGrowthPct: number;
  newMaintenancePerPlaneM: number;
  replacementPricePerPlaneM: number;
  replacementUsefulLifeYears: number;
  temporaryLeasePerPlaneM: number;
  transitionCostPerPlaneM: number;
  discountRatePct: number;
  retirementYears: number;
}

export type StrategyId = 'keep' | 'replace' | 'lease';

export interface YearResult {
  year: number;
  planesNeeded: number;
  oldPlanes: number;
  newPlanes: number;
  leasedPlanes: number;
  planesShort: number;
  annualCostM: number;
  fuelCostM: number;
  maintenanceCostM: number;
  ownershipCostM: number;
  averageAge: number;
}

export interface StrategyResult {
  id: StrategyId;
  label: string;
  shortLabel: string;
  description: string;
  years: YearResult[];
  tenYearCostM: number;
  lowEstimateM: number;
  highEstimateM: number;
  peakPlanesShort: number;
  maxLeasedPlanes: number;
  endAverageAge: number;
}

export type LiveCalculationId = 'fuel' | 'delivery' | 'maintenance' | 'demand';

export interface LiveCalculation {
  id: LiveCalculationId;
  label: string;
  equation: string;
  result: string;
  explanation: string;
}

export interface ScenarioResult {
  assumptions: ScenarioAssumptions;
  strategies: Record<StrategyId, StrategyResult>;
  recommendedStrategy: StrategyId;
  recommendationTitle: string;
  recommendationExplanation: string;
  replacementCheaperYear: number | null;
  firstDeliveryYear: number;
  mostInfluentialAssumption: string;
  changeSummary: string;
  liveCalculations: LiveCalculation[];
  formulas: string[];
  factIds: string[];
  assumptionIds: string[];
}

export interface DataCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  factIds: string[];
}
