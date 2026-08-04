import type { PersistedState, PersistenceAdapter } from '../domain/types';
import { FIELD_KEYS } from '../domain/types';

const STORAGE_KEY = 'adrcp-state-v1';

const REVIEW_ACTIONS = new Set([
  'approve_corrected',
  'accept_override',
  'reject',
  'quarantine',
  'reassign',
  'false_positive',
  'reopen',
]);
const AUDIT_TYPES = new Set([
  'INGEST',
  'VALIDATE',
  'DECISION',
  'CORRECTION',
  'EXPORT',
  'IMPORT',
  'DATASET',
  'QUARANTINE',
  'RELEASE',
]);
const FIELD_SET = new Set<string>(FIELD_KEYS);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isFeedVersion(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (
    !['id', 'label', 'sourceSystemId', 'receivedAt', 'description'].every(
      (key) => typeof value[key] === 'string',
    ) ||
    !Array.isArray(value['schema']) ||
    !Array.isArray(value['records'])
  ) {
    return false;
  }
  const schemaValid = value['schema'].every(
    (field) =>
      isObject(field) &&
      typeof field['name'] === 'string' &&
      ['number', 'string', 'date'].includes(String(field['type'])) &&
      typeof field['nullable'] === 'boolean' &&
      (field['unit'] === undefined || ['USD', 'USD_thousands'].includes(String(field['unit']))) &&
      (field['enumValues'] === undefined ||
        (Array.isArray(field['enumValues']) && field['enumValues'].every((v) => typeof v === 'string'))),
  );
  const recordsValid = value['records'].every(
    (record) =>
      isObject(record) &&
      typeof record['recordId'] === 'string' &&
      isObject(record['values']) &&
      Object.values(record['values']).every(
        (raw) => raw === null || typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw)),
      ),
  );
  return schemaValid && recordsValid;
}

/** Reject malformed or manually edited browser state before it reaches the engine. */
export function parsePersistedState(value: unknown): PersistedState | null {
  if (!isObject(value) || value['schemaVersion'] !== 1) return null;
  if (!['clean', 'issues', 'imported'].includes(String(value['datasetId']))) return null;
  if (typeof value['reviewer'] !== 'string') return null;
  if (
    !Array.isArray(value['decisions']) ||
    !Array.isArray(value['corrections']) ||
    !Array.isArray(value['audit']) ||
    !Array.isArray(value['quarantinedRecordIds'])
  ) {
    return null;
  }
  if (
    !value['decisions'].every(
      (decision) =>
        isObject(decision) &&
        ['id', 'exceptionId', 'reason', 'reviewer', 'at'].every(
          (key) => typeof decision[key] === 'string',
        ) &&
        REVIEW_ACTIONS.has(String(decision['action'])) &&
        isOptionalString(decision['assignee']) &&
        isOptionalString(decision['correctedValue']),
    )
  ) {
    return null;
  }
  if (
    !value['corrections'].every(
      (correction) =>
        isObject(correction) &&
        typeof correction['sourceRecordId'] === 'string' &&
        FIELD_SET.has(String(correction['field'])) &&
        (typeof correction['value'] === 'string' ||
          (typeof correction['value'] === 'number' && Number.isFinite(correction['value']))) &&
        typeof correction['exceptionId'] === 'string',
    )
  ) {
    return null;
  }
  if (
    !value['audit'].every(
      (event) =>
        isObject(event) &&
        typeof event['id'] === 'string' &&
        typeof event['seq'] === 'number' &&
        Number.isInteger(event['seq']) &&
        event['seq'] > 0 &&
        typeof event['at'] === 'string' &&
        typeof event['actor'] === 'string' &&
        AUDIT_TYPES.has(String(event['type'])) &&
        typeof event['message'] === 'string' &&
        isOptionalString(event['exceptionId']),
    )
  ) {
    return null;
  }
  const auditSeqs = value['audit'].map((event) => (event as Record<string, unknown>)['seq'] as number);
  if (auditSeqs.some((seq, index) => index > 0 && seq <= (auditSeqs[index - 1] ?? 0))) return null;
  if (!value['quarantinedRecordIds'].every((id) => typeof id === 'string')) return null;
  if (value['importedFeed'] !== null && !isFeedVersion(value['importedFeed'])) return null;
  return value as unknown as PersistedState;
}

/**
 * localStorage-backed persistence. The `PersistenceAdapter` interface is the
 * seam where an API/database client would slot in later; the store only ever
 * talks to the interface.
 */
export class LocalStoragePersistence implements PersistenceAdapter {
  constructor(private readonly storage: Storage) {}

  load(): PersistedState | null {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return parsePersistedState(parsed);
    } catch {
      return null;
    }
  }

  save(state: PersistedState): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable: the session continues in memory.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
}

/** In-memory adapter for tests and non-browser environments. */
export class MemoryPersistence implements PersistenceAdapter {
  private state: PersistedState | null = null;
  load(): PersistedState | null {
    return this.state === null ? null : JSON.parse(JSON.stringify(this.state)) as PersistedState;
  }
  save(state: PersistedState): void {
    this.state = JSON.parse(JSON.stringify(state)) as PersistedState;
  }
  clear(): void {
    this.state = null;
  }
}
