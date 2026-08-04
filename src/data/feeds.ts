import type { FeedVersion, FieldKey } from '../domain/types';
import { SEC_FILINGS_FY2025 } from './secData';

/**
 * Sample feed versions used to demonstrate the full workflow without uploads.
 *
 * - FEED_CLEAN: the published February 2026 baseline (real FY2025 SEC figures).
 * - FEED_ISSUES: a March 2026 resubmission carrying eight intentional,
 *   traceable data problems (see README, "Demonstration cases").
 * - FEED_DRIFT_PROPOSAL: a proposed Q2 schema used by the Data Feeds view to
 *   demonstrate declared schema-drift detection (add/remove/type/unit changes).
 *
 * FY2024 comparatives are SYNTHETIC prior-period baselines constructed so the
 * clean FY2025 feed passes period-over-period plausibility checks. They are
 * not real filings and are labeled as such wherever shown.
 */

const BASE_SCHEMA = [
  { name: 'ticker', type: 'string', nullable: false },
  { name: 'airline', type: 'string', nullable: false },
  { name: 'period', type: 'date', nullable: false },
  { name: 'filed', type: 'date', nullable: false },
  { name: 'currency', type: 'string', nullable: false, enumValues: ['USD'] },
  { name: 'revenue', type: 'number', unit: 'USD', nullable: false },
  { name: 'operatingIncome', type: 'number', unit: 'USD', nullable: false },
  { name: 'netIncome', type: 'number', unit: 'USD', nullable: false },
  { name: 'operatingCashFlow', type: 'number', unit: 'USD', nullable: false },
  { name: 'cash', type: 'number', unit: 'USD', nullable: false },
  { name: 'currentAssets', type: 'number', unit: 'USD', nullable: false },
  { name: 'currentLiabilities', type: 'number', unit: 'USD', nullable: false },
  { name: 'assets', type: 'number', unit: 'USD', nullable: false },
  { name: 'liabilities', type: 'number', unit: 'USD', nullable: false },
  { name: 'equity', type: 'number', unit: 'USD', nullable: false },
] satisfies FeedVersion['schema'];

function filingValues(ticker: string): Record<string, string | number> {
  const f = SEC_FILINGS_FY2025.find((x) => x.ticker === ticker);
  if (!f) throw new Error(`No FY2025 filing for ${ticker}`);
  return { ...f };
}

export const FEED_CLEAN: FeedVersion = {
  id: 'FV-2026-02-A',
  label: 'Feb 2026 baseline (clean)',
  sourceSystemId: 'SRC-SEC',
  receivedAt: '2026-02-20T09:15:00Z',
  schema: BASE_SCHEMA,
  description: 'Published FY2025 10-K dataset for UAL, DAL, AAL. Passes all blocking controls.',
  records: [
    { recordId: 'R-UAL-FY2025', values: filingValues('UAL') },
    { recordId: 'R-DAL-FY2025', values: filingValues('DAL') },
    { recordId: 'R-AAL-FY2025', values: filingValues('AAL') },
  ],
};

/** Issue dataset: eight intentional problems (cases 1–8 in the README). */
export const FEED_ISSUES: FeedVersion = {
  id: 'FV-2026-03-B',
  label: 'Mar 2026 resubmission (issues)',
  sourceSystemId: 'SRC-SEC',
  receivedAt: '2026-03-14T08:40:00Z',
  schema: [
    { name: 'ticker', type: 'string', nullable: false },
    { name: 'airline', type: 'string', nullable: false },
    { name: 'period', type: 'date', nullable: false },
    { name: 'filed', type: 'date', nullable: false },
    // Case 2 groundwork: the feed now permits EUR without a conversion record.
    { name: 'currency', type: 'string', nullable: false, enumValues: ['USD', 'EUR'] },
    { name: 'revenue', type: 'number', unit: 'USD', nullable: false },
    // Case 5: operatingIncome arrives renamed to operating_profit.
    { name: 'operating_profit', type: 'number', unit: 'USD', nullable: false },
    { name: 'netIncome', type: 'number', unit: 'USD', nullable: false },
    // Case 6: values silently switch to thousands; declared unit is unchanged.
    { name: 'operatingCashFlow', type: 'number', unit: 'USD', nullable: false },
    { name: 'cash', type: 'number', unit: 'USD', nullable: false },
    // Case 3 groundwork: the feed now allows null currentAssets.
    { name: 'currentAssets', type: 'number', unit: 'USD', nullable: true },
    { name: 'currentLiabilities', type: 'number', unit: 'USD', nullable: false },
    { name: 'assets', type: 'number', unit: 'USD', nullable: false },
    { name: 'liabilities', type: 'number', unit: 'USD', nullable: false },
    { name: 'equity', type: 'number', unit: 'USD', nullable: false },
  ],
  description:
    'Resubmission of the FY2025 dataset containing eight intentional data-integrity issues for demonstration.',
  records: [
    {
      recordId: 'R-UAL-FY2025-RESUB',
      values: {
        ...filingValues('UAL'),
        // Case 1: numeric cash arrives as a formatted string.
        cash: '5,942,000,000',
        // Case 5: renamed key.
        operating_profit: 4_713_000_000,
        operatingIncome: undefined as never,
        // Case 6: thousands instead of units.
        operatingCashFlow: 8_431_000,
      },
    },
    {
      recordId: 'R-DAL-FY2025-RESUB',
      values: {
        ...filingValues('DAL'),
        // Case 2: currency switches to EUR with no conversion record.
        currency: 'EUR',
        operating_profit: 5_822_000_000,
        operatingIncome: undefined as never,
        operatingCashFlow: 8_342_000,
      },
    },
    {
      recordId: 'R-AAL-FY2025-RESUB',
      values: {
        ...filingValues('AAL'),
        // Case 3: current assets missing.
        currentAssets: null,
        // Case 4: liabilities overstated so A = L + E fails by exactly $500M.
        liabilities: 66_001_000_000,
        operating_profit: 1_467_000_000,
        operatingIncome: undefined as never,
        operatingCashFlow: 3_099_000,
      },
    },
    {
      // Case 7: duplicate source record for AAL FY2025.
      recordId: 'R-AAL-FY2025-DUP',
      values: {
        ...filingValues('AAL'),
        currentAssets: null,
        liabilities: 66_001_000_000,
        operating_profit: 1_467_000_000,
        operatingIncome: undefined as never,
        operatingCashFlow: 3_099_000,
      },
    },
    {
      // Case 8: stale FY2024 period attempts to overwrite the newer version.
      // Values are the synthetic FY2024 comparatives (internally consistent).
      recordId: 'R-UAL-FY2024-STALE',
      values: {
        ticker: 'UAL',
        airline: 'United Airlines',
        period: '2024-12-31',
        filed: '2025-02-20',
        currency: 'USD',
        revenue: 57_000_000_000,
        operating_profit: 4_200_000_000,
        netIncome: 2_900_000_000,
        operatingCashFlow: 7_800_000,
        cash: 6_500_000_000,
        currentAssets: 15_900_000_000,
        currentLiabilities: 25_000_000_000,
        assets: 73_500_000_000,
        liabilities: 60_500_000_000,
        equity: 13_000_000_000,
      },
    },
  ],
};

// Strip the `operatingIncome: undefined` placeholders introduced by spreads.
for (const r of FEED_ISSUES.records) {
  if (r.values['operatingIncome'] === undefined) delete r.values['operatingIncome'];
}

/** Declared-drift sample for the Data Feeds comparison workflow. */
export const FEED_DRIFT_PROPOSAL: FeedVersion = {
  id: 'FV-2026-Q2-PROPOSAL',
  label: 'Q2 2026 schema proposal',
  sourceSystemId: 'SRC-SEC',
  receivedAt: '2026-04-01T12:00:00Z',
  schema: [
    { name: 'ticker', type: 'string', nullable: false },
    { name: 'airline', type: 'string', nullable: false },
    { name: 'period', type: 'date', nullable: false },
    // Removed: filed
    { name: 'currency', type: 'string', nullable: false, enumValues: ['USD', 'EUR', 'GBP'] },
    { name: 'revenue', type: 'number', unit: 'USD_thousands', nullable: false }, // unit change
    { name: 'operatingIncome', type: 'number', unit: 'USD', nullable: false },
    { name: 'netIncome', type: 'number', unit: 'USD', nullable: false },
    { name: 'operatingCashFlow', type: 'number', unit: 'USD', nullable: false },
    { name: 'cash', type: 'string', unit: 'USD', nullable: false }, // type change
    { name: 'currentAssets', type: 'number', unit: 'USD', nullable: true }, // nullability change
    { name: 'currentLiabilities', type: 'number', unit: 'USD', nullable: false },
    { name: 'assets', type: 'number', unit: 'USD', nullable: false },
    { name: 'liabilities', type: 'number', unit: 'USD', nullable: false },
    { name: 'equity', type: 'number', unit: 'USD', nullable: false },
    { name: 'fleetCount', type: 'number', nullable: true }, // added field
  ],
  description: 'Proposed provider schema for Q2 2026. Not loadable as a dataset; used for drift review.',
  records: [],
};

export const SAMPLE_FEEDS: readonly FeedVersion[] = [FEED_CLEAN, FEED_ISSUES, FEED_DRIFT_PROPOSAL];

/**
 * SYNTHETIC FY2024 comparatives per ticker. Constructed (not filed figures) so
 * that FY2025 period-over-period changes stay inside plausibility thresholds.
 */
export const SYNTHETIC_FY2024: Record<string, Record<FieldKey, string | number>> = {
  UAL: {
    ticker: 'UAL', airline: 'United Airlines', period: '2024-12-31', filed: '2025-02-20', currency: 'USD',
    revenue: 57_000_000_000, operatingIncome: 4_200_000_000, netIncome: 2_900_000_000,
    operatingCashFlow: 7_800_000_000, cash: 6_500_000_000, currentAssets: 15_900_000_000,
    currentLiabilities: 25_000_000_000, assets: 73_500_000_000, liabilities: 60_500_000_000, equity: 13_000_000_000,
  },
  DAL: {
    ticker: 'DAL', airline: 'Delta Air Lines', period: '2024-12-31', filed: '2025-02-15', currency: 'USD',
    revenue: 61_600_000_000, operatingIncome: 5_300_000_000, netIncome: 4_500_000_000,
    operatingCashFlow: 7_900_000_000, cash: 4_000_000_000, currentAssets: 10_300_000_000,
    currentLiabilities: 26_800_000_000, assets: 78_900_000_000, liabilities: 59_800_000_000, equity: 19_100_000_000,
  },
  AAL: {
    ticker: 'AAL', airline: 'American Airlines', period: '2024-12-31', filed: '2025-02-21', currency: 'USD',
    revenue: 53_200_000_000, operatingIncome: 1_300_000_000, netIncome: 150_000_000,
    operatingCashFlow: 2_900_000_000, cash: 900_000_000, currentAssets: 11_500_000_000,
    currentLiabilities: 23_800_000_000, assets: 60_800_000_000, liabilities: 64_300_000_000, equity: -3_500_000_000,
  },
};

export interface PublishedRecord {
  recordId: string;
  ticker: string;
  period: string;
  versionId: string;
  values: Record<string, string | number>;
}

/** Published history when validating the CLEAN feed: FY2024 comparatives only. */
export const PUBLISHED_FY2024: readonly PublishedRecord[] = Object.entries(SYNTHETIC_FY2024).map(
  ([ticker, values]) => ({
    recordId: `PUB-${ticker}-FY2024`,
    ticker,
    period: String(values.period),
    versionId: 'FV-2025-02-HIST',
    values,
  }),
);

/** Published history when validating the ISSUE feed: clean FY2025 + FY2024. */
export const PUBLISHED_THROUGH_FY2025: readonly PublishedRecord[] = [
  ...PUBLISHED_FY2024,
  ...FEED_CLEAN.records.map((r) => ({
    recordId: `PUB-${String(r.values['ticker'])}-FY2025`,
    ticker: String(r.values['ticker']),
    period: String(r.values['period']),
    versionId: FEED_CLEAN.id,
    values: r.values as Record<string, string | number>,
  })),
];
