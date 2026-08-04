import type {
  Aircraft,
  AnalyticalModel,
  Counterparty,
  Lease,
  Loan,
  Portfolio,
  Report,
  SourceSystem,
} from '../domain/types';

/**
 * SYNTHETIC PORTFOLIO — every aircraft, lease, loan, and portfolio below is
 * invented for demonstration. Registrations and serial numbers are fictional.
 * Only the three counterparties are real companies (public SEC filers).
 */

export const COUNTERPARTIES: readonly Counterparty[] = [
  { id: 'CP-UAL', ticker: 'UAL', name: 'United Airlines' },
  { id: 'CP-DAL', ticker: 'DAL', name: 'Delta Air Lines' },
  { id: 'CP-AAL', ticker: 'AAL', name: 'American Airlines' },
];

export const PORTFOLIOS: readonly Portfolio[] = [
  {
    id: 'PF-NB1',
    name: 'Narrowbody Fund I (synthetic)',
    description: 'Synthetic demonstration fund holding narrowbody aircraft on operating leases.',
  },
  {
    id: 'PF-WB1',
    name: 'Widebody Credit Fund (synthetic)',
    description: 'Synthetic demonstration fund holding widebody leases and secured loans.',
  },
];

export const AIRCRAFT: readonly Aircraft[] = [
  { id: 'AC-01', registration: 'N901XA', model: 'A320neo', msn: 'SYN-1101', deliveryYear: 2021, marketValueUsd: 49_000_000 },
  { id: 'AC-02', registration: 'N902XA', model: 'A321neo', msn: 'SYN-1102', deliveryYear: 2022, marketValueUsd: 58_500_000 },
  { id: 'AC-03', registration: 'N903XA', model: '737-8', msn: 'SYN-1103', deliveryYear: 2020, marketValueUsd: 46_000_000 },
  { id: 'AC-04', registration: 'N904XA', model: '787-9', msn: 'SYN-1104', deliveryYear: 2019, marketValueUsd: 128_000_000 },
  { id: 'AC-05', registration: 'N905XA', model: 'A320neo', msn: 'SYN-1105', deliveryYear: 2023, marketValueUsd: 52_000_000 },
  { id: 'AC-06', registration: 'N906XA', model: 'A330-900', msn: 'SYN-1106', deliveryYear: 2020, marketValueUsd: 98_000_000 },
  { id: 'AC-07', registration: 'N907XA', model: '737-8', msn: 'SYN-1107', deliveryYear: 2021, marketValueUsd: 47_500_000 },
  { id: 'AC-08', registration: 'N908XA', model: 'A350-900', msn: 'SYN-1108', deliveryYear: 2022, marketValueUsd: 142_000_000 },
  { id: 'AC-09', registration: 'N909XA', model: 'A321neo', msn: 'SYN-1109', deliveryYear: 2023, marketValueUsd: 59_000_000 },
  { id: 'AC-10', registration: 'N910XA', model: '787-8', msn: 'SYN-1110', deliveryYear: 2018, marketValueUsd: 102_000_000 },
  { id: 'AC-11', registration: 'N911XA', model: 'A320neo', msn: 'SYN-1111', deliveryYear: 2022, marketValueUsd: 50_500_000 },
  { id: 'AC-12', registration: 'N912XA', model: '737-8', msn: 'SYN-1112', deliveryYear: 2019, marketValueUsd: 44_000_000 },
];

/** 12 leases: 4 per airline, split across the two synthetic funds. */
export const LEASES: readonly Lease[] = [
  { id: 'LS-01', aircraftId: 'AC-01', lesseeId: 'CP-UAL', portfolioId: 'PF-NB1', monthlyRentUsd: 385_000, startDate: '2021-06-01', endDate: '2031-05-31' },
  { id: 'LS-02', aircraftId: 'AC-02', lesseeId: 'CP-UAL', portfolioId: 'PF-NB1', monthlyRentUsd: 452_000, startDate: '2022-03-01', endDate: '2032-02-28' },
  { id: 'LS-03', aircraftId: 'AC-03', lesseeId: 'CP-UAL', portfolioId: 'PF-NB1', monthlyRentUsd: 361_000, startDate: '2020-09-01', endDate: '2030-08-31' },
  { id: 'LS-04', aircraftId: 'AC-04', lesseeId: 'CP-UAL', portfolioId: 'PF-WB1', monthlyRentUsd: 985_000, startDate: '2019-11-01', endDate: '2031-10-31' },
  { id: 'LS-05', aircraftId: 'AC-05', lesseeId: 'CP-DAL', portfolioId: 'PF-NB1', monthlyRentUsd: 405_000, startDate: '2023-02-01', endDate: '2033-01-31' },
  { id: 'LS-06', aircraftId: 'AC-06', lesseeId: 'CP-DAL', portfolioId: 'PF-WB1', monthlyRentUsd: 762_000, startDate: '2020-07-01', endDate: '2032-06-30' },
  { id: 'LS-07', aircraftId: 'AC-07', lesseeId: 'CP-DAL', portfolioId: 'PF-NB1', monthlyRentUsd: 368_000, startDate: '2021-04-01', endDate: '2031-03-31' },
  { id: 'LS-08', aircraftId: 'AC-08', lesseeId: 'CP-DAL', portfolioId: 'PF-WB1', monthlyRentUsd: 1_095_000, startDate: '2022-10-01', endDate: '2034-09-30' },
  { id: 'LS-09', aircraftId: 'AC-09', lesseeId: 'CP-AAL', portfolioId: 'PF-NB1', monthlyRentUsd: 458_000, startDate: '2023-05-01', endDate: '2033-04-30' },
  { id: 'LS-10', aircraftId: 'AC-10', lesseeId: 'CP-AAL', portfolioId: 'PF-WB1', monthlyRentUsd: 810_000, startDate: '2018-12-01', endDate: '2030-11-30' },
  { id: 'LS-11', aircraftId: 'AC-11', lesseeId: 'CP-AAL', portfolioId: 'PF-NB1', monthlyRentUsd: 392_000, startDate: '2022-08-01', endDate: '2032-07-31' },
  { id: 'LS-12', aircraftId: 'AC-12', lesseeId: 'CP-AAL', portfolioId: 'PF-NB1', monthlyRentUsd: 348_000, startDate: '2019-10-01', endDate: '2029-09-30' },
];

/** 4 secured loans in the widebody fund. */
export const LOANS: readonly Loan[] = [
  { id: 'LN-01', borrowerId: 'CP-UAL', portfolioId: 'PF-WB1', outstandingUsd: 74_000_000, collateralAircraftIds: ['AC-04'], maturityDate: '2030-06-30' },
  { id: 'LN-02', borrowerId: 'CP-DAL', portfolioId: 'PF-WB1', outstandingUsd: 88_000_000, collateralAircraftIds: ['AC-08'], maturityDate: '2031-12-31' },
  { id: 'LN-03', borrowerId: 'CP-AAL', portfolioId: 'PF-WB1', outstandingUsd: 61_000_000, collateralAircraftIds: ['AC-10'], maturityDate: '2029-03-31' },
  { id: 'LN-04', borrowerId: 'CP-AAL', portfolioId: 'PF-NB1', outstandingUsd: 32_000_000, collateralAircraftIds: ['AC-11', 'AC-12'], maturityDate: '2028-09-30' },
];

export const MODELS: readonly AnalyticalModel[] = [
  {
    id: 'MD-CREDIT',
    name: 'Counterparty Credit Screen',
    description: 'Screens lessee/borrower financial strength from filed statements.',
    inputFields: ['revenue', 'operatingIncome', 'netIncome', 'liabilities', 'equity', 'currentAssets', 'currentLiabilities'],
    required: true,
  },
  {
    id: 'MD-CASHFLOW',
    name: 'Lease Cash Flow Model',
    description: 'Projects lease collections against lessee liquidity.',
    inputFields: ['revenue', 'operatingCashFlow', 'cash', 'currentAssets', 'currentLiabilities'],
    required: true,
  },
  {
    id: 'MD-COLLATERAL',
    name: 'Collateral Coverage Model',
    description: 'Compares loan balances to collateral values and borrower balance sheets.',
    inputFields: ['assets', 'liabilities', 'equity', 'cash'],
    required: false,
  },
];

export const REPORTS: readonly Report[] = [
  { id: 'RP-PERF', name: 'Monthly Portfolio Performance', cadence: 'monthly', modelIds: ['MD-CASHFLOW', 'MD-COLLATERAL'], required: true },
  { id: 'RP-CREDIT', name: 'Quarterly Counterparty Credit Review', cadence: 'quarterly', modelIds: ['MD-CREDIT'], required: true },
  { id: 'RP-COVENANT', name: 'Lender Covenant Compliance Pack', cadence: 'monthly', modelIds: ['MD-CREDIT', 'MD-COLLATERAL'], required: true },
  { id: 'RP-DQ', name: 'Weekly Data Quality Summary', cadence: 'weekly', modelIds: ['MD-CREDIT', 'MD-CASHFLOW', 'MD-COLLATERAL'], required: false },
];

export const SOURCE_SYSTEMS: readonly SourceSystem[] = [
  { id: 'SRC-SEC', name: 'SEC EDGAR company facts', kind: 'regulatory-filing', confidence: 0.95 },
  { id: 'SRC-UPLOAD', name: 'Analyst CSV upload', kind: 'file-upload', confidence: 0.7 },
];

export function counterpartyByTicker(ticker: string): Counterparty | undefined {
  return COUNTERPARTIES.find((c) => c.ticker === ticker);
}
