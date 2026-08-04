import { describe, expect, it } from 'vitest';
import type { ReviewDecision } from '../domain/types';
import { FEED_CLEAN, FEED_ISSUES, PUBLISHED_FY2024, PUBLISHED_THROUGH_FY2025 } from '../data/feeds';
import { runPipeline, statusFromDecisions, isOpenStatus } from './pipeline';

const runClean = () => runPipeline(FEED_CLEAN, PUBLISHED_FY2024, [], [], []);
const runIssues = (
  corrections: Parameters<typeof runPipeline>[2] = [],
  decisions: Parameters<typeof runPipeline>[3] = [],
  quarantined: Parameters<typeof runPipeline>[4] = [],
) => runPipeline(FEED_ISSUES, PUBLISHED_THROUGH_FY2025, corrections, decisions, quarantined);

function decision(exceptionId: string, action: ReviewDecision['action'], n = 1): ReviewDecision {
  return {
    id: `RD-T${n}`,
    exceptionId,
    action,
    reason: 'test reason',
    reviewer: 'Tester',
    at: '2026-03-15T00:00:00Z',
  };
}

describe('clean baseline', () => {
  it('produces no exceptions and leaves every report eligible', () => {
    const run = runClean();
    expect(run.items).toHaveLength(0);
    expect(run.publication.every((p) => p.eligible)).toBe(true);
    expect(run.models.every((m) => !m.blocked)).toBe(true);
    expect(run.norm.records).toHaveLength(3);
  });
});

describe('the eight demonstration cases', () => {
  const run = runIssues();
  const find = (idPart: string) => run.items.find((i) => i.exception.id.includes(idPart));

  it('case 1: UAL cash as formatted string → recoverable type exception, Low band', () => {
    const item = find('invalid_type|R-UAL-FY2025-RESUB|cash');
    expect(item).toBeDefined();
    expect(item?.exception.severity).toBe('medium');
    expect(item?.score.band).toBe('Low');
  });

  it('case 2: DAL currency EUR without conversion → counterparty-scope blocking exception', () => {
    const item = find('invalid_currency|R-DAL-FY2025-RESUB');
    expect(item?.exception.blocking).toBe(true);
    expect(item?.exception.scope).toBe('counterparty');
    expect(['Critical', 'High']).toContain(item?.score.band);
  });

  it('case 3: AAL missing current assets → blocking High exception with published magnitude', () => {
    const item = find('missing_required_field|R-AAL-FY2025-RESUB|currentAssets');
    expect(item?.exception.materialityUsd).toBe(12_205_000_000);
    expect(item?.score.band).toBe('High');
  });

  it('case 4: $500M accounting-equation mismatch → Critical and ranked above the formatting issue', () => {
    const mismatch = find('accounting_equation|R-AAL-FY2025-RESUB');
    const formatting = find('invalid_type|R-UAL-FY2025-RESUB|cash');
    expect(mismatch?.exception.materialityUsd).toBe(500_000_000);
    expect(mismatch?.score.band).toBe('Critical');
    expect(mismatch!.score.total).toBeGreaterThan(formatting!.score.total + 30);
  });

  it('case 5: operatingIncome renamed → rename finding plus broken model dependency', () => {
    expect(find('schema_field_renamed|FV-2026-03-B|operatingIncome')).toBeDefined();
    const broken = find('broken_dependency|FV-2026-03-B|operatingIncome');
    expect(broken?.exception.blocking).toBe(true);
    expect(broken?.impact.models.length).toBeGreaterThan(0);
  });

  it('case 6: units→thousands shift → critical unit-multiplier exception per affected record', () => {
    const hits = run.items.filter((i) => i.exception.ruleId === 'unexpected_unit_multiplier');
    expect(hits).toHaveLength(3);
    expect(hits.every((h) => h.exception.field === 'operatingCashFlow')).toBe(true);
    expect(hits.every((h) => h.score.band === 'Critical')).toBe(true);
  });

  it('case 7: duplicate AAL record → excluded from normalization with a Low/Medium exception', () => {
    const item = find('duplicate_source_record|R-AAL-FY2025-DUP');
    expect(item).toBeDefined();
    expect(run.norm.records.filter((r) => r.ticker === 'AAL')).toHaveLength(1);
    expect(['Low', 'Medium']).toContain(item?.score.band);
  });

  it('case 8: stale FY2024 record → overwrite prevented, Medium review priority', () => {
    const item = find('stale_data|R-UAL-FY2024-STALE');
    expect(item).toBeDefined();
    expect(item?.score.band).toBe('Medium');
    expect(run.norm.records.find((r) => r.sourceRecordId === 'R-UAL-FY2024-STALE')).toBeUndefined();
    // The published FY2025 UAL version remains the comparison basis.
    expect(item?.exception.explanation).toContain('2025-12-31');
  });

  it('ranks the queue by score descending', () => {
    const totals = run.items.map((i) => i.score.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it('blocks every required report while blocking exceptions stay open', () => {
    expect(run.publication.filter((p) => p.report.required).every((p) => !p.eligible)).toBe(true);
    for (const p of run.publication) {
      if (!p.eligible) expect(p.blockedBy.length).toBeGreaterThan(0);
    }
  });
});

describe('decisions, corrections, and blocked-output recalculation', () => {
  const base = runIssues();
  const equationId = base.items.find((i) => i.exception.ruleId === 'accounting_equation')!.exception.id;

  it('a correction clears the exception on re-run while retaining its evidence', () => {
    const run = runIssues([
      { sourceRecordId: 'R-AAL-FY2025-RESUB', field: 'liabilities', value: 65_501_000_000, exceptionId: equationId },
    ]);
    const retained = run.items.find((i) => i.exception.ruleId === 'accounting_equation');
    expect(retained?.cleared).toBe(true);
    expect(retained?.status).toBe('resolved_corrected');
    // The incoming feed object itself is untouched (original evidence preserved).
    const original = FEED_ISSUES.records.find((r) => r.recordId === 'R-AAL-FY2025-RESUB');
    expect(original?.values['liabilities']).toBe(66_001_000_000);
  });

  it('quarantining a source record excludes it from processing', () => {
    const run = runIssues([], [], ['R-AAL-FY2025-DUP']);
    expect(run.version.records.find((r) => r.recordId === 'R-AAL-FY2025-DUP')).toBeUndefined();
    const retained = run.items.find((i) => i.exception.ruleId === 'duplicate_source_record');
    expect(retained?.cleared).toBe(true);
    expect(retained?.status).toBe('quarantined');
    expect(run.quarantinedRecordIds).toContain('R-AAL-FY2025-DUP');
  });

  it('keeps a failed correction open when the same control still fires', () => {
    const run = runIssues(
      [{ sourceRecordId: 'R-AAL-FY2025-RESUB', field: 'liabilities', value: 66_000_000_000, exceptionId: equationId }],
      [decision(equationId, 'approve_corrected')],
    );
    const item = run.items.find((candidate) => candidate.exception.id === equationId);
    expect(item?.cleared).toBe(false);
    expect(item?.status).toBe('open');
    expect(run.publication.some((publication) => publication.blockedBy.includes(equationId))).toBe(true);
  });

  it('resolving decisions releases blocks; publication becomes eligible when none remain open', () => {
    const withOverrides: ReviewDecision[] = base.items
      .filter((i) => i.exception.blocking)
      .map((i, n) => decision(i.exception.id, 'accept_override', n));
    const corrected = runIssues(
      [{ sourceRecordId: 'R-AAL-FY2025-RESUB', field: 'liabilities', value: 65_501_000_000, exceptionId: equationId }],
      withOverrides,
    );
    expect(corrected.publication.every((p) => p.eligible)).toBe(true);
    expect(corrected.models.every((m) => !m.blocked)).toBe(true);
  });

  it('a reassigned exception keeps blocking; reopening restores the block after resolution', () => {
    const reassigned = runIssues([], [decision(equationId, 'reassign')]);
    expect(reassigned.publication.some((p) => !p.eligible)).toBe(true);
    const resolvedThenReopened = runIssues(
      [],
      [decision(equationId, 'accept_override', 1), decision(equationId, 'reopen', 2)],
    );
    const item = resolvedThenReopened.items.find((i) => i.exception.id === equationId);
    expect(item?.status).toBe('open');
    expect(resolvedThenReopened.publication.filter((p) => p.report.required).every((p) => !p.eligible)).toBe(true);
  });

  it('retains a decided exception as evidence once the data no longer trips the control', () => {
    const dupId = base.items.find((i) => i.exception.ruleId === 'duplicate_source_record')!.exception.id;
    const run = runIssues([], [decision(dupId, 'quarantine')], ['R-AAL-FY2025-DUP']);
    const item = run.items.find((i) => i.exception.id === dupId);
    expect(item).toBeDefined();
    expect(item?.cleared).toBe(true);
    expect(item?.status).toBe('quarantined');
    // The record itself is gone from processing, but the evidence remains reachable.
    expect(run.version.records.find((r) => r.recordId === 'R-AAL-FY2025-DUP')).toBeUndefined();
    expect(run.originalVersion.records.find((r) => r.recordId === 'R-AAL-FY2025-DUP')).toBeDefined();
  });

  it('retains undecided findings that a correction incidentally cleared', () => {
    const run = runIssues([
      { sourceRecordId: 'R-AAL-FY2025-RESUB', field: 'liabilities', value: 65_501_000_000, exceptionId: 'EX|other' },
    ]);
    const item = run.items.find((i) => i.exception.ruleId === 'accounting_equation');
    expect(item?.cleared).toBe(true);
    expect(item?.status).toBe('resolved_corrected');
  });

  it('sorts actionable work above anything already decided', () => {
    const topId = base.items[0]!.exception.id;
    const run = runIssues([], [decision(topId, 'accept_override')]);
    const idx = run.items.findIndex((i) => i.exception.id === topId);
    expect(idx).toBeGreaterThan(0);
  });

  it('derives statuses from the latest decision', () => {
    expect(statusFromDecisions([])).toBe('open');
    expect(statusFromDecisions([decision('x', 'quarantine')])).toBe('quarantined');
    expect(statusFromDecisions([decision('x', 'reject', 1), decision('x', 'reopen', 2)])).toBe('open');
    expect(isOpenStatus('reassigned')).toBe(true);
    expect(isOpenStatus('rejected')).toBe(true);
    expect(isOpenStatus('resolved_override')).toBe(false);
  });
});
