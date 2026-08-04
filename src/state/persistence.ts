import type { PersistedState, PersistenceAdapter } from '../domain/types';

const STORAGE_KEY = 'adrcp-state-v1';

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
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as { schemaVersion?: unknown }).schemaVersion === 1
      ) {
        return parsed as PersistedState;
      }
      return null;
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
    return this.state;
  }
  save(state: PersistedState): void {
    this.state = JSON.parse(JSON.stringify(state)) as PersistedState;
  }
  clear(): void {
    this.state = null;
  }
}
