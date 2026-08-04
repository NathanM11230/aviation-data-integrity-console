import { describe, expect, it } from 'vitest';
import type { ValidationException } from '../domain/types';
import {
  counterpartyExposureUsd,
  impactOfException,
  lineageOf,
  recalculateBlocked,
  TOTAL_EXPOSURE_USD,
} from './dependencies';

function ex(partial: Partial<ValidationException>): ValidationException {
  return {
    id: 'EX|test',
    ruleId: 'accounting_equation',
    severity: 'critical',
    blocking: true,
    explanation: 'x',
    expected: 'x',
    observed: 'x',
    field: 'liabilities',
    incomingField: null,
    counterpartyId: 'CP-AAL',
    sourceRecordId: 'R-1',
    versionId: 'FV-1',
    recommendedAction: 'x',
    scope: 'record',
    materialityUsd: null,
    materialityRatio: null,
    ...partial,
  };
}

describe('exposure calculations', () => {
  it('sums lease collateral and loan balances per counterparty (synthetic dataset)', () => {
    // UAL: aircraft AC-01..04 (49 + 58.5 + 46 + 128 = 281.5M) + loan LN-01 (74M)
    expect(counterpartyExposureUsd('CP-UAL')).toBe(355_500_000);
    // AAL: AC-09..12 (59 + 102 + 50.5 + 44 = 255.5M) + LN-03 (61M) + LN-04 (32M)
    expect(counterpartyExposureUsd('CP-AAL')).toBe(348_500_000);
    expect(TOTAL_EXPOSURE_USD).toBe(
      counterpartyExposureUsd('CP-UAL') + counterpartyExposureUsd('CP-DAL') + counterpartyExposureUsd('CP-AAL'),
    );
  });
});

describe('impactOfException', () => {
  it('limits record-scope field issues to models consuming that field', () => {
    const impact = impactOfException(ex({ field: 'cash', ruleId: 'invalid_type' }));
    const modelIds = impact.models.map((m) => m.id).sort();
    expect(modelIds).toEqual(['MD-CASHFLOW', 'MD-COLLATERAL']);
    // Reports that consume those models, but not the credit-only report.
    expect(impact.reports.map((r) => r.id)).not.toContain('RP-CREDIT');
    expect(impact.exposureUsd).toBe(counterpartyExposureUsd('CP-AAL'));
    expect(impact.leases).toHaveLength(4);
    expect(impact.loans).toHaveLength(2);
    expect(impact.dependencyCount).toBeGreaterThan(0);
  });

  it('taints every model for counterparty-scope and feed-scope issues', () => {
    const cp = impactOfException(ex({ scope: 'counterparty', field: 'currency' }));
    expect(cp.models).toHaveLength(3);
    const feed = impactOfException(ex({ scope: 'feed', counterpartyId: null, field: null }));
    expect(feed.exposureUsd).toBe(TOTAL_EXPOSURE_USD);
    expect(feed.portfolios).toHaveLength(2);
  });
});

describe('recalculateBlocked', () => {
  it('blocks only models consuming the affected field and their reports', () => {
    const blocked = recalculateBlocked([ex({ field: 'operatingCashFlow' })]);
    expect([...blocked.blockedModelIds]).toEqual(['MD-CASHFLOW']);
    expect(blocked.blockedReportIds.has('RP-PERF')).toBe(true);
    expect(blocked.blockedReportIds.has('RP-CREDIT')).toBe(false);
    expect(blocked.blockingByReport.get('RP-PERF')).toEqual(['EX|test']);
  });

  it('returns no blocks when no open blocking exceptions exist', () => {
    const blocked = recalculateBlocked([]);
    expect(blocked.blockedModelIds.size).toBe(0);
    expect(blocked.blockedReportIds.size).toBe(0);
  });

  it('feed-scope exceptions block everything', () => {
    const blocked = recalculateBlocked([ex({ scope: 'feed', field: null, counterpartyId: null })]);
    expect(blocked.blockedModelIds.size).toBe(3);
    expect(blocked.blockedReportIds.size).toBe(4);
  });
});

describe('lineage traversal', () => {
  it('walks a counterparty downstream to leases, aircraft, portfolios, models, and reports', () => {
    const lineage = lineageOf('counterparty', 'CP-UAL');
    expect(lineage).not.toBeNull();
    const downstream = lineage!.downstream;
    const leaseNodes = downstream.filter((n) => n.entity.kind === 'lease');
    expect(leaseNodes).toHaveLength(4);
    expect(leaseNodes[0]?.children.some((c) => c.entity.kind === 'aircraft')).toBe(true);
    const modelNodes = downstream.filter((n) => n.entity.kind === 'model');
    expect(modelNodes).toHaveLength(3);
    expect(modelNodes.every((m) => m.children.every((c) => c.entity.kind === 'report'))).toBe(true);
  });

  it('walks a report upstream to models and their input fields', () => {
    const lineage = lineageOf('report', 'RP-CREDIT');
    expect(lineage!.upstream).toHaveLength(1);
    const model = lineage!.upstream[0]!;
    expect(model.entity.id).toBe('MD-CREDIT');
    expect(model.children.map((c) => c.entity.id)).toContain('operatingIncome');
  });

  it('walks a field downstream to consuming models and reports', () => {
    const lineage = lineageOf('field', 'cash');
    const models = lineage!.downstream.map((n) => n.entity.id).sort();
    expect(models).toEqual(['MD-CASHFLOW', 'MD-COLLATERAL']);
  });

  it('returns null for unknown entities', () => {
    expect(lineageOf('aircraft', 'AC-99')).toBeNull();
  });
});
