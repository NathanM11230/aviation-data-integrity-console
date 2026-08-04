import { describe, expect, it } from 'vitest';
import { createAppStore, selectRun } from './store';
import { MemoryPersistence } from './persistence';
import type { ValidationException } from '../domain/types';

function makeStore(adapter = new MemoryPersistence()) {
  return { store: createAppStore(adapter), adapter };
}

function firstException(store: ReturnType<typeof createAppStore>): ValidationException {
  store.getState().selectDataset('issues');
  const run = selectRun(store.getState());
  const ex = run.items[0]?.exception;
  if (!ex) throw new Error('expected exceptions in the issue dataset');
  return ex;
}

describe('review-action requirements', () => {
  it('rejects any decision without a reason', () => {
    const { store } = makeStore();
    const ex = firstException(store);
    const result = store.getState().decide({ exception: ex, action: 'reject', reason: '   ' });
    expect(result.ok).toBe(false);
    expect(store.getState().decisions).toHaveLength(0);
  });

  it('requires a corrected value for approve_corrected', () => {
    const { store } = makeStore();
    const ex = firstException(store);
    const result = store.getState().decide({ exception: ex, action: 'approve_corrected', reason: 'valid reason' });
    expect(result.ok).toBe(false);
  });

  it('rejects record actions that cannot change a feed-level finding', () => {
    const { store } = makeStore();
    store.getState().selectDataset('issues');
    const feedFinding = selectRun(store.getState()).items.find(
      (item) => item.exception.ruleId === 'broken_dependency',
    )!.exception;
    expect(
      store.getState().decide({
        exception: feedFinding,
        action: 'approve_corrected',
        reason: 'Attempted correction',
        correctedValue: '1',
      }).ok,
    ).toBe(false);
    expect(
      store.getState().decide({
        exception: feedFinding,
        action: 'quarantine',
        reason: 'Attempted quarantine',
      }).ok,
    ).toBe(false);
    expect(store.getState().decisions).toHaveLength(0);
  });

  it('rejects non-numeric corrections for monetary fields', () => {
    const { store } = makeStore();
    const ex = firstException(store);
    const result = store.getState().decide({
      exception: ex,
      action: 'approve_corrected',
      reason: 'Bad correction',
      correctedValue: 'not a number',
    });
    expect(result.ok).toBe(false);
    expect(store.getState().decisions).toHaveLength(0);
  });

  it('requires an assignee for reassignment', () => {
    const { store } = makeStore();
    const ex = firstException(store);
    const result = store.getState().decide({ exception: ex, action: 'reassign', reason: 'needs specialist' });
    expect(result.ok).toBe(false);
  });

  it('records a valid decision with reviewer attribution', () => {
    const { store } = makeStore();
    const ex = firstException(store);
    store.getState().setReviewer('A. Analyst');
    const result = store.getState().decide({ exception: ex, action: 'reject', reason: 'Provider confirmed bad extract' });
    expect(result.ok).toBe(true);
    const d = store.getState().decisions[0];
    expect(d?.reviewer).toBe('A. Analyst');
    expect(d?.reason).toBe('Provider confirmed bad extract');
  });

  it('preserves spaces while a reviewer name is being typed', () => {
    const { store } = makeStore();
    store.getState().setReviewer('Nathan ');
    store.getState().setReviewer(`${store.getState().reviewer}Mackey`);
    expect(store.getState().reviewer).toBe('Nathan Mackey');
  });

  it('keeps a rejected value blocking until another disposition resolves it', () => {
    const { store } = makeStore();
    const ex = firstException(store);
    store.getState().decide({ exception: ex, action: 'reject', reason: 'Provider value is invalid' });
    const run = selectRun(store.getState());
    const item = run.items.find((candidate) => candidate.exception.id === ex.id);
    expect(item?.status).toBe('rejected');
    expect(run.publication.some((publication) => publication.blockedBy.includes(ex.id))).toBe(true);
  });
});

describe('append-only audit behavior', () => {
  it('appends events with strictly increasing sequence numbers and never mutates history', () => {
    const { store } = makeStore();
    const before = store.getState().audit;
    const beforeCopy = JSON.parse(JSON.stringify(before)) as unknown;
    const ex = firstException(store);
    store.getState().decide({ exception: ex, action: 'accept_override', reason: 'Documented override' });
    const after = store.getState().audit;
    expect(after.length).toBeGreaterThan(before.length);
    // Prior events are structurally untouched.
    expect(JSON.parse(JSON.stringify(before))).toEqual(beforeCopy);
    expect(after.slice(0, before.length).map((a) => a.id)).toEqual(before.map((a) => a.id));
    const seqs = after.map((a) => a.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('records what validation produced and when data was exported', () => {
    const { store } = makeStore();
    store.getState().selectDataset('issues');
    const validate = store.getState().audit.find((a) => a.type === 'VALIDATE');
    expect(validate?.message).toMatch(/11 exception\(s\) raised \(5 critical\)/);
    expect(validate?.message).toMatch(/4 of 4 reports blocked/);

    store.getState().logExport('audit', 7);
    const exported = store.getState().audit.at(-1);
    expect(exported?.type).toBe('EXPORT');
    expect(exported?.message).toContain('7 audit row(s)');
  });

  it('logs corrections and quarantines as separate audit events', () => {
    const { store } = makeStore();
    store.getState().selectDataset('issues');
    const run = selectRun(store.getState());
    const equation = run.items.find((i) => i.exception.ruleId === 'accounting_equation')!.exception;
    store.getState().decide({
      exception: equation,
      action: 'approve_corrected',
      reason: 'Filing shows 65,501M',
      correctedValue: '65,501,000,000',
    });
    const types = store.getState().audit.map((a) => a.type);
    expect(types).toContain('DECISION');
    expect(types).toContain('CORRECTION');
    expect(store.getState().corrections[0]?.value).toBe(65_501_000_000);

    const dup = run.items.find((i) => i.exception.ruleId === 'duplicate_source_record')!.exception;
    store.getState().decide({ exception: dup, action: 'quarantine', reason: 'Provider double-sent' });
    expect(store.getState().quarantinedRecordIds).toContain(dup.sourceRecordId);
    expect(store.getState().audit.map((a) => a.type)).toContain('QUARANTINE');
  });

  it('releases a quarantine and validates the original record again', () => {
    const { store } = makeStore();
    store.getState().selectDataset('issues');
    let run = selectRun(store.getState());
    const duplicate = run.items.find((item) => item.exception.ruleId === 'duplicate_source_record')!.exception;
    store.getState().decide({ exception: duplicate, action: 'quarantine', reason: 'Duplicate load' });
    run = selectRun(store.getState());
    const cleared = run.items.find((item) => item.exception.id === duplicate.id)!;
    expect(cleared.cleared).toBe(true);

    store.getState().decide({ exception: cleared.exception, action: 'reopen', reason: 'Provider asked for re-review' });
    run = selectRun(store.getState());
    const reopened = run.items.find((item) => item.exception.id === duplicate.id);
    expect(reopened?.cleared).toBe(false);
    expect(reopened?.status).toBe('open');
    expect(store.getState().quarantinedRecordIds).not.toContain(duplicate.sourceRecordId);
    expect(store.getState().audit.map((event) => event.type)).toContain('RELEASE');
  });
});

describe('persistence and reload', () => {
  it('restores decisions, corrections, quarantines, and dataset selection after reload', () => {
    const adapter = new MemoryPersistence();
    const { store } = makeStore(adapter);
    const ex = firstException(store);
    store.getState().decide({ exception: ex, action: 'accept_override', reason: 'Persisted decision' });

    const reloaded = createAppStore(adapter).getState();
    expect(reloaded.datasetId).toBe('issues');
    expect(reloaded.decisions).toHaveLength(1);
    expect(reloaded.decisions[0]?.reason).toBe('Persisted decision');
    expect(reloaded.audit.length).toBe(store.getState().audit.length);
  });

  it('starts clean when nothing was persisted', () => {
    const { store } = makeStore();
    const s = store.getState();
    expect(s.datasetId).toBe('clean');
    expect(s.decisions).toHaveLength(0);
    expect(selectRun(s).items).toHaveLength(0);
  });

  it('resetSession clears state through the persistence adapter', () => {
    const adapter = new MemoryPersistence();
    const { store } = makeStore(adapter);
    const ex = firstException(store);
    store.getState().decide({ exception: ex, action: 'reject', reason: 'r' });
    store.getState().resetSession();
    expect(store.getState().decisions).toHaveLength(0);
    expect(store.getState().datasetId).toBe('clean');
    const reloaded = createAppStore(adapter).getState();
    expect(reloaded.decisions).toHaveLength(0);
  });
});

describe('CSV import through the store', () => {
  it('stores parse errors for rejection and keeps the current dataset', () => {
    const { store } = makeStore();
    const ok = store.getState().importCsv('not,a\nvalid', 'bad.csv');
    expect(ok).toBe(false);
    expect(store.getState().importError?.length).toBeGreaterThan(0);
    expect(store.getState().datasetId).toBe('clean');
  });

  it('activates a valid import as the working dataset', () => {
    const { store } = makeStore();
    const ok = store
      .getState()
      .importCsv('ticker,period,revenue\nUAL,2025-12-31,59070000000', 'good.csv');
    expect(ok).toBe(true);
    expect(store.getState().datasetId).toBe('imported');
    const run = selectRun(store.getState());
    expect(run.version.id).toContain('FV-CSV');
    // Missing mapped fields surface as schema/dependency findings, not silence.
    expect(run.items.length).toBeGreaterThan(0);
  });

  it('does not apply quarantine state from an earlier import to a new file', () => {
    const { store } = makeStore();
    expect(store.getState().importCsv('ticker,period,revenue\nUAL,2025-12-31,', 'first.csv')).toBe(true);
    let run = selectRun(store.getState());
    const missingRevenue = run.items.find(
      (item) => item.exception.ruleId === 'missing_required_field' && item.exception.field === 'revenue',
    )!.exception;
    store.getState().decide({ exception: missingRevenue, action: 'quarantine', reason: 'Incomplete row' });
    const firstRecordId = missingRevenue.sourceRecordId;

    expect(store.getState().importCsv('ticker,period,revenue\nDAL,2025-12-31,100', 'second.csv')).toBe(true);
    run = selectRun(store.getState());
    expect(run.originalVersion.records[0]?.recordId).not.toBe(firstRecordId);
    expect(run.version.records).toHaveLength(1);
  });
});

describe('demonstration flow: correct the $500M mismatch end to end', () => {
  it('unblocks publication once every blocking exception is resolved', () => {
    const { store } = makeStore();
    store.getState().selectDataset('issues');
    let run = selectRun(store.getState());
    expect(run.publication.some((p) => !p.eligible)).toBe(true);

    const equation = run.items.find((i) => i.exception.ruleId === 'accounting_equation')!.exception;
    store.getState().decide({
      exception: equation,
      action: 'approve_corrected',
      reason: 'Restated liabilities confirmed against the 10-K',
      correctedValue: '65501000000',
    });
    run = selectRun(store.getState());
    // The finding is retained as evidence, marked cleared, and stops blocking.
    const cleared = run.items.find((i) => i.exception.ruleId === 'accounting_equation');
    expect(cleared?.cleared).toBe(true);
    expect(cleared?.status).toBe('resolved_corrected');
    expect(run.blocked.blockingByModel.get('MD-COLLATERAL') ?? []).not.toContain(cleared!.exception.id);

    for (const item of run.items.filter((i) => i.exception.blocking && !i.cleared)) {
      store.getState().decide({
        exception: item.exception,
        action: 'accept_override',
        reason: 'Reviewed and accepted for demonstration',
      });
      run = selectRun(store.getState());
    }
    expect(run.publication.every((p) => p.eligible)).toBe(true);
  });
});
