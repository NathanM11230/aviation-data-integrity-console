import { describe, expect, it } from 'vitest';
import type { ValidationException } from '../domain/types';
import { SOURCE_SYSTEMS } from '../data/portfolio';
import { impactOfException, TOTAL_EXPOSURE_USD, counterpartyExposureUsd } from './dependencies';
import { bandFor, scoreException } from './scoring';

const SEC = SOURCE_SYSTEMS[0]!;
const UPLOAD = SOURCE_SYSTEMS[1]!;

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
    materialityUsd: 500_000_000,
    materialityRatio: 0.008,
    ...partial,
  };
}

describe('bandFor boundaries', () => {
  it('maps totals to bands at the documented thresholds', () => {
    expect(bandFor(100)).toBe('Critical');
    expect(bandFor(65)).toBe('Critical');
    expect(bandFor(64)).toBe('High');
    expect(bandFor(45)).toBe('High');
    expect(bandFor(44)).toBe('Medium');
    expect(bandFor(30)).toBe('Medium');
    expect(bandFor(29)).toBe('Low');
    expect(bandFor(0)).toBe('Low');
  });
});

describe('scoreException', () => {
  it('sums factor contributions and never exceeds 100', () => {
    const e = ex({});
    const s = scoreException(e, impactOfException(e), SEC);
    expect(s.total).toBe(s.factors.reduce((a, f) => a + f.points, 0));
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.factors).toHaveLength(8);
    for (const f of s.factors) {
      expect(f.points).toBeGreaterThanOrEqual(0);
      expect(f.points).toBeLessThanOrEqual(f.maxPoints);
      expect(f.input).toBeTruthy();
      expect(f.rationale).toBeTruthy();
    }
  });

  it('awards severity points per the documented scale', () => {
    for (const [severity, pts] of [['critical', 25], ['high', 18], ['medium', 10], ['low', 4]] as const) {
      const e = ex({ severity });
      const s = scoreException(e, impactOfException(e), SEC);
      expect(s.factors.find((f) => f.key === 'severity')?.points).toBe(pts);
    }
  });

  it('bands materiality at the documented USD thresholds', () => {
    const cases: [number | null, number][] = [
      [500_000_000, 20],
      [250_000_000, 20],
      [249_999_999, 15],
      [50_000_000, 15],
      [10_000_000, 10],
      [1_000_000, 5],
      [500, 2],
      [0, 0],
      [null, 0],
    ];
    for (const [usd, pts] of cases) {
      const e = ex({ materialityUsd: usd, materialityRatio: null });
      const s = scoreException(e, impactOfException(e), SEC);
      expect(s.factors.find((f) => f.key === 'materiality')?.points, `usd=${String(usd)}`).toBe(pts);
    }
  });

  it('gives structural schema findings zero materiality points', () => {
    const e = ex({ ruleId: 'schema_field_renamed', materialityUsd: 999_000_000_000, scope: 'feed', counterpartyId: null, sourceRecordId: null });
    const s = scoreException(e, impactOfException(e), SEC);
    expect(s.factors.find((f) => f.key === 'materiality')?.points).toBe(0);
  });

  it('scales exposure points by share of total synthetic exposure', () => {
    const e = ex({});
    const s = scoreException(e, impactOfException(e), SEC);
    const expected = Math.round((counterpartyExposureUsd('CP-AAL') / TOTAL_EXPOSURE_USD) * 15);
    expect(s.factors.find((f) => f.key === 'exposure')?.points).toBe(expected);
    const feedWide = ex({ counterpartyId: null, scope: 'feed' });
    const s2 = scoreException(feedWide, impactOfException(feedWide), SEC);
    expect(s2.factors.find((f) => f.key === 'exposure')?.points).toBe(15);
  });

  it('scores propagation by scope and freshness for stale data', () => {
    const record = scoreException(ex({}), impactOfException(ex({})), SEC);
    expect(record.factors.find((f) => f.key === 'propagation')?.points).toBe(2);
    const feed = ex({ scope: 'feed', counterpartyId: null });
    expect(scoreException(feed, impactOfException(feed), SEC).factors.find((f) => f.key === 'propagation')?.points).toBe(10);
    const stale = ex({ ruleId: 'stale_data' });
    expect(scoreException(stale, impactOfException(stale), SEC).factors.find((f) => f.key === 'freshness')?.points).toBe(5);
  });

  it('adds points for lower-confidence sources', () => {
    const e = ex({});
    const impact = impactOfException(e);
    const sec = scoreException(e, impact, SEC).factors.find((f) => f.key === 'source')!.points;
    const upload = scoreException(e, impact, UPLOAD).factors.find((f) => f.key === 'source')!.points;
    expect(sec).toBe(0);
    expect(upload).toBe(2);
  });

  it('non-blocking exceptions earn no blocked-output points', () => {
    const e = ex({ blocking: false, ruleId: 'duplicate_source_record', severity: 'medium' });
    const s = scoreException(e, impactOfException(e), SEC);
    expect(s.factors.find((f) => f.key === 'blocked')?.points).toBe(0);
  });
});
