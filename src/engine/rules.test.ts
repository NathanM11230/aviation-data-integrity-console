import { describe, expect, it } from 'vitest';
import type { FeedVersion, RawValue, ValidationException } from '../domain/types';
import { FEED_CLEAN, PUBLISHED_FY2024, PUBLISHED_THROUGH_FY2025 } from '../data/feeds';
import type { PublishedRecord } from '../data/feeds';
import { normalizeFeed } from './normalize';
import { detectDrift } from './drift';
import { runValidation } from './rules';

function cleanValues(ticker: 'UAL' | 'DAL' | 'AAL'): Record<string, RawValue> {
  const r = FEED_CLEAN.records.find((x) => String(x.values['ticker']) === ticker);
  if (!r) throw new Error('missing record');
  return { ...r.values };
}

function makeFeed(
  records: Record<string, RawValue>[],
  schema: FeedVersion['schema'] = FEED_CLEAN.schema,
): FeedVersion {
  return {
    id: 'FV-TEST',
    label: 'Test feed',
    sourceSystemId: 'SRC-SEC',
    receivedAt: '2026-03-01T00:00:00Z',
    schema,
    description: 'test',
    records: records.map((values, i) => ({ recordId: `R-T${i + 1}`, values })),
  };
}

function validate(
  version: FeedVersion,
  published: readonly PublishedRecord[] = PUBLISHED_FY2024,
): ValidationException[] {
  const norm = normalizeFeed(version, published);
  const drift = detectDrift(FEED_CLEAN, version);
  return runValidation({ version, published, norm, drift, expectedYears: [2024, 2025] });
}

const byRule = (exs: ValidationException[], rule: string) => exs.filter((e) => e.ruleId === rule);

describe('validation rules', () => {
  it('passes the clean baseline with zero exceptions', () => {
    const exs = validate(FEED_CLEAN);
    expect(exs).toHaveLength(0);
  });

  it('missing_required_field fires for an empty mapped field', () => {
    const exs = validate(makeFeed([{ ...cleanValues('AAL'), currentAssets: null }]));
    const hits = byRule(exs, 'missing_required_field');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.field).toBe('currentAssets');
    expect(hits[0]?.blocking).toBe(true);
  });

  it('missing_required_field carries the published magnitude as materiality when available', () => {
    const exs = validate(
      makeFeed([{ ...cleanValues('AAL'), currentAssets: null }]),
      PUBLISHED_THROUGH_FY2025,
    );
    const hit = byRule(exs, 'missing_required_field')[0];
    expect(hit?.materialityUsd).toBe(12_205_000_000);
  });

  it('invalid_type downgrades to medium non-blocking when the value is recoverable', () => {
    const exs = validate(makeFeed([{ ...cleanValues('UAL'), cash: '5,942,000,000' }]));
    const hit = byRule(exs, 'invalid_type')[0];
    expect(hit?.severity).toBe('medium');
    expect(hit?.blocking).toBe(false);
    expect(hit?.observed).toContain('5,942,000,000');
  });

  it('invalid_type stays high and blocking when the value is unparseable', () => {
    const exs = validate(makeFeed([{ ...cleanValues('UAL'), cash: 'five billion' }]));
    const hit = byRule(exs, 'invalid_type')[0];
    expect(hit?.severity).toBe('high');
    expect(hit?.blocking).toBe(true);
  });

  it('invalid_currency fires for non-USD reporting without conversion', () => {
    const exs = validate(makeFeed([{ ...cleanValues('DAL'), currency: 'EUR' }]));
    const hit = byRule(exs, 'invalid_currency')[0];
    expect(hit?.scope).toBe('counterparty');
    expect(hit?.observed).toBe('EUR');
  });

  it('unexpected_unit_multiplier fires on a ×1/1000 shift and suppresses implausible_change', () => {
    const exs = validate(
      makeFeed([{ ...cleanValues('UAL'), operatingCashFlow: 8_431_000 }]),
      PUBLISHED_THROUGH_FY2025,
    );
    expect(byRule(exs, 'unexpected_unit_multiplier')).toHaveLength(1);
    expect(byRule(exs, 'implausible_change')).toHaveLength(0);
  });

  it('accounting_equation fires with the exact USD difference as materiality', () => {
    const exs = validate(
      makeFeed([{ ...cleanValues('AAL'), liabilities: 66_001_000_000 }]),
      PUBLISHED_THROUGH_FY2025,
    );
    const hit = byRule(exs, 'accounting_equation')[0];
    expect(hit?.severity).toBe('critical');
    expect(hit?.materialityUsd).toBe(500_000_000);
  });

  it('accounting_equation tolerates differences within $1M', () => {
    const exs = validate(makeFeed([{ ...cleanValues('AAL'), liabilities: 65_501_000_000 + 999_999 }]));
    expect(byRule(exs, 'accounting_equation')).toHaveLength(0);
  });

  it('duplicate_source_record fires for a repeated ticker+period and excludes the copy', () => {
    const version = makeFeed([cleanValues('UAL'), cleanValues('UAL')]);
    const norm = normalizeFeed(version, PUBLISHED_FY2024);
    expect(norm.records).toHaveLength(1);
    const exs = validate(version);
    expect(byRule(exs, 'duplicate_source_record')).toHaveLength(1);
  });

  it('stale_data fires when an older period tries to overwrite a published newer one', () => {
    const stale = { ...cleanValues('UAL'), period: '2024-12-31', filed: '2025-02-20', revenue: 57_000_000_000 };
    const exs = validate(makeFeed([stale]), PUBLISHED_THROUGH_FY2025);
    const hits = byRule(exs, 'stale_data');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.blocking).toBe(false);
    // The stale record produces no other record-level noise.
    expect(exs.filter((e) => e.sourceRecordId === hits[0]?.sourceRecordId)).toHaveLength(1);
  });

  it('filing_before_period_end fires when the filing precedes the period end', () => {
    const exs = validate(makeFeed([{ ...cleanValues('UAL'), filed: '2025-06-30' }]));
    expect(byRule(exs, 'filing_before_period_end')).toHaveLength(1);
  });

  it('unexpected_period fires for an off-cycle period', () => {
    const exs = validate(makeFeed([{ ...cleanValues('UAL'), period: '2025-06-30', filed: '2025-08-01' }]));
    expect(byRule(exs, 'unexpected_period')).toHaveLength(1);
  });

  it('implausible_change fires beyond the 40% band', () => {
    const exs = validate(
      makeFeed([{ ...cleanValues('UAL'), revenue: 118_140_000_000 }]),
      PUBLISHED_THROUGH_FY2025,
    );
    const hit = byRule(exs, 'implausible_change')[0];
    expect(hit?.field).toBe('revenue');
    expect(hit?.blocking).toBe(false);
  });

  it('schema_field_removed fires when a mapped field disappears', () => {
    const schema = FEED_CLEAN.schema.filter((f) => f.name !== 'filed');
    const values = { ...cleanValues('UAL') };
    delete values['filed'];
    const exs = validate(makeFeed([values], schema));
    const hit = byRule(exs, 'schema_field_removed')[0];
    expect(hit?.incomingField).toBe('filed');
    expect(hit?.scope).toBe('feed');
  });

  it('schema_field_renamed fires with a probable-match explanation and no duplicate unmapped_field', () => {
    const schema = FEED_CLEAN.schema.map((f) =>
      f.name === 'operatingIncome' ? { ...f, name: 'operating_profit' } : f,
    );
    const values: Record<string, RawValue> = { ...cleanValues('UAL'), operating_profit: 4_713_000_000 };
    delete values['operatingIncome'];
    const exs = validate(makeFeed([values], schema));
    const renamed = byRule(exs, 'schema_field_renamed')[0];
    expect(renamed?.explanation).toContain('Probable rename');
    expect(byRule(exs, 'unmapped_field')).toHaveLength(0);
    // The lost mapping also breaks the credit model input.
    const broken = byRule(exs, 'broken_dependency')[0];
    expect(broken?.field).toBe('operatingIncome');
    expect(broken?.explanation).toContain('Counterparty Credit Screen');
  });

  it('schema_field_type_changed fires when a mapped field changes type', () => {
    const schema = FEED_CLEAN.schema.map((f) => (f.name === 'cash' ? { ...f, type: 'string' as const } : f));
    const exs = validate(makeFeed([{ ...cleanValues('UAL'), cash: '5942000000' }], schema));
    expect(byRule(exs, 'schema_field_type_changed')).toHaveLength(1);
  });

  it('schema_unit_changed fires when a declared unit changes', () => {
    const schema = FEED_CLEAN.schema.map((f) =>
      f.name === 'operatingCashFlow' ? { ...f, unit: 'USD_thousands' as const } : f,
    );
    const exs = validate(makeFeed([cleanValues('UAL')], schema));
    const hit = byRule(exs, 'schema_unit_changed')[0];
    expect(hit?.severity).toBe('critical');
    expect(hit?.blocking).toBe(true);
  });

  it('unmapped_field fires for an unknown incoming column', () => {
    const schema = [...FEED_CLEAN.schema, { name: 'fleetCount', type: 'number' as const, nullable: true }];
    const exs = validate(makeFeed([{ ...cleanValues('UAL'), fleetCount: 900 }], schema));
    const hit = byRule(exs, 'unmapped_field')[0];
    expect(hit?.incomingField).toBe('fleetCount');
    expect(hit?.severity).toBe('low');
  });

  it('produces structured results with rule id, expected, observed, source record, and action', () => {
    const exs = validate(makeFeed([{ ...cleanValues('AAL'), liabilities: 66_001_000_000 }]));
    const hit = exs.find((e) => e.ruleId === 'accounting_equation');
    expect(hit).toMatchObject({
      ruleId: 'accounting_equation',
      versionId: 'FV-TEST',
      sourceRecordId: 'R-T1',
      field: 'liabilities',
    });
    expect(hit?.expected).toBeTruthy();
    expect(hit?.observed).toBeTruthy();
    expect(hit?.recommendedAction).toBeTruthy();
    expect(hit?.explanation.length).toBeGreaterThan(20);
  });
});
