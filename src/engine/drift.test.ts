import { describe, expect, it } from 'vitest';
import { FEED_CLEAN, FEED_DRIFT_PROPOSAL, FEED_ISSUES } from '../data/feeds';
import { detectDrift, nameSimilarity } from './drift';

describe('nameSimilarity', () => {
  it('scores probable renames by shared name tokens', () => {
    expect(nameSimilarity('operatingIncome', 'operating_profit')).toBe(0.5);
    expect(nameSimilarity('cash', 'cash')).toBe(1);
    expect(nameSimilarity('cash', 'fleetCount')).toBe(0);
  });
});

describe('detectDrift: baseline vs issue resubmission', () => {
  const drift = detectDrift(FEED_CLEAN, FEED_ISSUES);
  const kinds = drift.map((d) => d.kind);

  it('detects the operatingIncome → operating_profit rename with an explanation', () => {
    const rename = drift.find((d) => d.kind === 'renamed');
    expect(rename?.fieldBefore).toBe('operatingIncome');
    expect(rename?.fieldAfter).toBe('operating_profit');
    expect(rename?.explanation).toContain('Probable rename');
    expect(rename?.affectedMappings).toContain('source.operatingIncome → normalized.operatingIncome');
    expect(rename?.affectedModelIds).toContain('MD-CREDIT');
    expect(rename?.disposition).toBe('quarantine');
  });

  it('detects the currency enum widening and currentAssets nullability change', () => {
    expect(kinds).toContain('enum_changed');
    const nullability = drift.find((d) => d.kind === 'nullability_changed');
    expect(nullability?.fieldBefore).toBe('currentAssets');
  });

  it('detects the operatingCashFlow distribution shift consistent with a unit change', () => {
    const dist = drift.find((d) => d.kind === 'distribution_changed');
    expect(dist?.fieldBefore).toBe('operatingCashFlow');
    expect(dist?.disposition).toBe('quarantine');
  });

  it('does not report an unrelated added field for the rename target', () => {
    expect(drift.filter((d) => d.kind === 'added')).toHaveLength(0);
  });
});

describe('detectDrift: baseline vs declared Q2 proposal', () => {
  const drift = detectDrift(FEED_CLEAN, FEED_DRIFT_PROPOSAL);
  const byKind = (k: string) => drift.filter((d) => d.kind === k);

  it('detects added, removed, type, unit, enum, and nullability changes', () => {
    expect(byKind('added')[0]?.fieldAfter).toBe('fleetCount');
    expect(byKind('removed')[0]?.fieldBefore).toBe('filed');
    expect(byKind('type_changed')[0]?.fieldBefore).toBe('cash');
    expect(byKind('unit_changed')[0]?.fieldBefore).toBe('revenue');
    expect(byKind('enum_changed')[0]?.fieldBefore).toBe('currency');
    expect(byKind('nullability_changed')[0]?.fieldBefore).toBe('currentAssets');
  });

  it('reports affected mappings and downstream consumers for every mapped change', () => {
    const unit = byKind('unit_changed')[0];
    expect(unit?.affectedMappings).toHaveLength(1);
    expect(unit?.affectedModelIds.length).toBeGreaterThan(0);
    expect(unit?.affectedReportIds.length).toBeGreaterThan(0);
  });

  it('recommends quarantine for type and unit changes and review for additions', () => {
    expect(byKind('type_changed')[0]?.disposition).toBe('quarantine');
    expect(byKind('unit_changed')[0]?.disposition).toBe('quarantine');
    expect(byKind('added')[0]?.disposition).toBe('review');
  });
});

describe('detectDrift: identical schemas', () => {
  it('reports nothing when nothing changed', () => {
    expect(detectDrift(FEED_CLEAN, FEED_CLEAN)).toHaveLength(0);
  });
});
