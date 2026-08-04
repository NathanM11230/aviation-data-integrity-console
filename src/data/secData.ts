import type { FieldMapping } from '../domain/types';

/**
 * Public FY2025 10-K figures carried over from the original prototype.
 * Source: SEC EDGAR company facts (XBRL). These are the only real numbers in
 * the application; everything in `portfolio.ts` is synthetic.
 */
export interface SecFiling {
  ticker: string;
  airline: string;
  period: string;
  filed: string;
  currency: string;
  revenue: number;
  operatingIncome: number;
  netIncome: number;
  operatingCashFlow: number;
  cash: number;
  currentAssets: number;
  currentLiabilities: number;
  assets: number;
  liabilities: number;
  equity: number;
}

export interface SecFilingReference {
  ticker: string;
  airline: string;
  accession: string;
  filed: string;
  filingUrl: string;
}

/** Human-readable SEC filing pages supporting the FY2025 sample financials. */
export const SEC_FILING_REFERENCES: readonly SecFilingReference[] = [
  {
    ticker: 'UAL',
    airline: 'United Airlines Holdings',
    accession: '0000100517-26-000023',
    filed: '2026-02-12',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/100517/000010051726000023/0000100517-26-000023-index.htm',
  },
  {
    ticker: 'DAL',
    airline: 'Delta Air Lines',
    accession: '0000027904-26-000013',
    filed: '2026-02-11',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/27904/000002790426000013/0000027904-26-000013-index.htm',
  },
  {
    ticker: 'AAL',
    airline: 'American Airlines Group',
    accession: '0000006201-26-000014',
    filed: '2026-02-18',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/6201/000000620126000014/0000006201-26-000014-index.htm',
  },
];

export const SEC_FILINGS_FY2025: readonly SecFiling[] = [
  {
    ticker: 'UAL',
    airline: 'United Airlines',
    period: '2025-12-31',
    filed: '2026-02-12',
    currency: 'USD',
    revenue: 59_070_000_000,
    operatingIncome: 4_713_000_000,
    netIncome: 3_353_000_000,
    operatingCashFlow: 8_431_000_000,
    cash: 5_942_000_000,
    currentAssets: 16_857_000_000,
    currentLiabilities: 26_133_000_000,
    assets: 76_448_000_000,
    liabilities: 61_166_000_000,
    equity: 15_282_000_000,
  },
  {
    ticker: 'DAL',
    airline: 'Delta Air Lines',
    period: '2025-12-31',
    filed: '2026-02-11',
    currency: 'USD',
    revenue: 63_364_000_000,
    operatingIncome: 5_822_000_000,
    netIncome: 5_005_000_000,
    operatingCashFlow: 8_342_000_000,
    cash: 4_310_000_000,
    currentAssets: 10_968_000_000,
    currentLiabilities: 27_624_000_000,
    assets: 81_317_000_000,
    liabilities: 60_464_000_000,
    equity: 20_853_000_000,
  },
  {
    ticker: 'AAL',
    airline: 'American Airlines',
    period: '2025-12-31',
    filed: '2026-02-18',
    currency: 'USD',
    revenue: 54_633_000_000,
    operatingIncome: 1_467_000_000,
    netIncome: 111_000_000,
    operatingCashFlow: 3_099_000_000,
    cash: 1_056_000_000,
    currentAssets: 12_205_000_000,
    currentLiabilities: 24_492_000_000,
    assets: 61_774_000_000,
    liabilities: 65_501_000_000,
    equity: -3_727_000_000,
  },
];

/** SEC XBRL concept lineage for every normalized field. */
export const FIELD_LINEAGE: readonly {
  field: string;
  sourceConcept: string;
  transform: string;
}[] = [
  { field: 'ticker', sourceConcept: 'Entity trading symbol', transform: 'Direct' },
  { field: 'airline', sourceConcept: 'Entity name', transform: 'Direct' },
  { field: 'period', sourceConcept: 'Document fiscal period end date', transform: 'ISO date' },
  { field: 'filed', sourceConcept: 'Filing accepted date', transform: 'ISO date' },
  { field: 'currency', sourceConcept: 'Reporting currency', transform: 'Direct' },
  { field: 'revenue', sourceConcept: 'RevenueFromContractWithCustomerExcludingAssessedTax', transform: 'USD, FY 10-K' },
  { field: 'operatingIncome', sourceConcept: 'OperatingIncomeLoss', transform: 'USD, FY 10-K' },
  { field: 'netIncome', sourceConcept: 'NetIncomeLoss', transform: 'USD, FY 10-K' },
  { field: 'operatingCashFlow', sourceConcept: 'NetCashProvidedByUsedInOperatingActivities', transform: 'USD, FY 10-K' },
  { field: 'cash', sourceConcept: 'CashAndCashEquivalentsAtCarryingValue', transform: 'USD, point-in-time' },
  { field: 'currentAssets', sourceConcept: 'AssetsCurrent', transform: 'USD, point-in-time' },
  { field: 'currentLiabilities', sourceConcept: 'LiabilitiesCurrent', transform: 'USD, point-in-time' },
  { field: 'assets', sourceConcept: 'Assets', transform: 'USD, point-in-time' },
  { field: 'liabilities', sourceConcept: 'Assets less StockholdersEquity', transform: 'Derived and reconciled' },
  { field: 'equity', sourceConcept: 'StockholdersEquity', transform: 'USD, point-in-time' },
];

/** Baseline mapping: incoming feed names are identical to normalized keys. */
export const BASELINE_MAPPING: readonly FieldMapping[] = [
  { incoming: 'ticker', normalized: 'ticker', transform: 'direct' },
  { incoming: 'airline', normalized: 'airline', transform: 'direct' },
  { incoming: 'period', normalized: 'period', transform: 'iso-date' },
  { incoming: 'filed', normalized: 'filed', transform: 'iso-date' },
  { incoming: 'currency', normalized: 'currency', transform: 'direct' },
  { incoming: 'revenue', normalized: 'revenue', transform: 'usd' },
  { incoming: 'operatingIncome', normalized: 'operatingIncome', transform: 'usd' },
  { incoming: 'netIncome', normalized: 'netIncome', transform: 'usd' },
  { incoming: 'operatingCashFlow', normalized: 'operatingCashFlow', transform: 'usd' },
  { incoming: 'cash', normalized: 'cash', transform: 'usd' },
  { incoming: 'currentAssets', normalized: 'currentAssets', transform: 'usd' },
  { incoming: 'currentLiabilities', normalized: 'currentLiabilities', transform: 'usd' },
  { incoming: 'assets', normalized: 'assets', transform: 'usd' },
  { incoming: 'liabilities', normalized: 'liabilities', transform: 'usd' },
  { incoming: 'equity', normalized: 'equity', transform: 'usd' },
];
