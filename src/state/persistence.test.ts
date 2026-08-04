import { describe, expect, it } from 'vitest';
import type { PersistedState } from '../domain/types';
import { parsePersistedState } from './persistence';

const VALID_STATE: PersistedState = {
  schemaVersion: 1,
  datasetId: 'clean',
  reviewer: 'N. Mackey',
  decisions: [],
  corrections: [],
  audit: [
    {
      id: 'AE-1',
      seq: 1,
      at: '2026-03-15T00:00:00Z',
      actor: 'system',
      type: 'INGEST',
      message: 'Loaded.',
    },
  ],
  quarantinedRecordIds: [],
  importedFeed: null,
};

describe('parsePersistedState', () => {
  it('accepts a structurally valid saved session', () => {
    expect(parsePersistedState(VALID_STATE)).toEqual(VALID_STATE);
  });

  it('rejects malformed arrays and unsupported dataset ids', () => {
    expect(parsePersistedState({ ...VALID_STATE, decisions: 'not-an-array' })).toBeNull();
    expect(parsePersistedState({ ...VALID_STATE, datasetId: 'unknown' })).toBeNull();
  });

  it('rejects invalid nested decisions, audit events, and imported feeds', () => {
    expect(parsePersistedState({ ...VALID_STATE, decisions: [{ action: 'approve_everything' }] })).toBeNull();
    expect(parsePersistedState({ ...VALID_STATE, audit: [{ seq: 'one' }] })).toBeNull();
    expect(parsePersistedState({ ...VALID_STATE, importedFeed: { id: 'broken' } })).toBeNull();
    expect(
      parsePersistedState({
        ...VALID_STATE,
        audit: [...VALID_STATE.audit, { ...VALID_STATE.audit[0]!, id: 'AE-2' }],
      }),
    ).toBeNull();
  });
});
