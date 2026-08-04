import { create } from 'zustand';
import type {
  AuditEvent,
  Correction,
  FeedVersion,
  PersistedState,
  PersistenceAdapter,
  ReviewAction,
  ReviewDecision,
  ValidationException,
} from '../domain/types';
import { MONETARY_FIELDS } from '../domain/types';
import { FEED_CLEAN, FEED_ISSUES, PUBLISHED_FY2024, PUBLISHED_THROUGH_FY2025 } from '../data/feeds';
import type { PublishedRecord } from '../data/feeds';
import { isOpenStatus, runPipeline, type PipelineRun } from '../engine/pipeline';
import { csvToFeedVersion } from '../engine/csv';
import { LocalStoragePersistence, MemoryPersistence } from './persistence';

export type DatasetId = 'clean' | 'issues' | 'imported';

export const DATASET_LABELS: Record<DatasetId, string> = {
  clean: FEED_CLEAN.label,
  issues: FEED_ISSUES.label,
  imported: 'Imported CSV',
};

const ACTION_LABELS: Record<ReviewAction, string> = {
  approve_corrected: 'Approved corrected value',
  accept_override: 'Accepted with documented override',
  reject: 'Rejected incoming value',
  quarantine: 'Quarantined source record',
  reassign: 'Reassigned for specialist review',
  false_positive: 'Marked false positive',
  reopen: 'Reopened',
};

export function actionLabel(action: ReviewAction): string {
  return ACTION_LABELS[action];
}

export interface DecideInput {
  exception: ValidationException;
  action: ReviewAction;
  reason: string;
  correctedValue?: string;
  assignee?: string;
}

export interface AppState {
  datasetId: DatasetId;
  importedFeed: FeedVersion | null;
  reviewer: string;
  decisions: ReviewDecision[];
  corrections: Correction[];
  audit: AuditEvent[];
  quarantinedRecordIds: string[];
  selectedExceptionId: string | null;
  importError: string[] | null;

  selectDataset: (id: DatasetId) => void;
  selectException: (id: string | null) => void;
  setReviewer: (name: string) => void;
  decide: (input: DecideInput) => { ok: true } | { ok: false; error: string };
  importCsv: (text: string, fileName: string) => boolean;
  logExport: (what: string, rows: number) => void;
  clearImportError: () => void;
  resetSession: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function actorName(reviewer: string): string {
  return reviewer.trim() || 'Unnamed reviewer';
}

function correctionValue(field: Correction['field'], raw: string): string | number | null {
  const trimmed = raw.trim();
  if (!MONETARY_FIELDS.includes(field)) return trimmed;
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

let idCounter = 0;
function freshId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function persistedFrom(s: AppState): PersistedState {
  return {
    schemaVersion: 1,
    datasetId: s.datasetId,
    reviewer: s.reviewer,
    decisions: s.decisions,
    corrections: s.corrections,
    audit: s.audit,
    quarantinedRecordIds: s.quarantinedRecordIds,
    importedFeed: s.importedFeed,
  };
}

function auditEvent(
  s: { audit: AuditEvent[] },
  actor: string,
  type: AuditEvent['type'],
  message: string,
  exceptionId?: string,
): AuditEvent {
  const seq = (s.audit[s.audit.length - 1]?.seq ?? 0) + 1;
  return {
    id: freshId('AE'),
    seq,
    at: nowIso(),
    actor,
    type,
    message,
    ...(exceptionId ? { exceptionId } : {}),
  };
}

const ACTIONS_REQUIRING_CORRECTED_VALUE: ReviewAction[] = ['approve_corrected'];
const ACTIONS_REQUIRING_ASSIGNEE: ReviewAction[] = ['reassign'];

/**
 * Store factory: the app uses one instance wired to localStorage; tests build
 * instances against `MemoryPersistence` to exercise persistence and reload.
 */
export function createAppStore(persistence: PersistenceAdapter) {
  return create<AppState>((set, get) => {
  const saved = persistence.load();
  const initial = {
    datasetId: (saved?.datasetId as DatasetId | undefined) ?? 'clean',
    importedFeed: saved?.importedFeed ?? null,
    reviewer: saved?.reviewer ?? 'N. Mackey',
    decisions: saved?.decisions ?? [],
    corrections: saved?.corrections ?? [],
    audit:
      saved?.audit ??
      ([
        {
          id: freshId('AE'),
          seq: 1,
          at: nowIso(),
          actor: 'system',
          type: 'INGEST',
          message: `Loaded sample feed "${FEED_CLEAN.label}" (3 records, source SEC EDGAR).`,
        },
      ] satisfies AuditEvent[]),
    quarantinedRecordIds: saved?.quarantinedRecordIds ?? [],
    selectedExceptionId: null,
    importError: null,
  };
  if (initial.datasetId === 'imported' && !initial.importedFeed) initial.datasetId = 'clean';

  const persist = () => persistence.save(persistedFrom(get()));

  /** Record what the engine produced for the newly active data, for the audit trail. */
  const appendValidationEvent = (label: string) => {
    const run = selectRun(get());
    const critical = run.items.filter((i) => i.score.band === 'Critical').length;
    const blocked = run.publication.filter((p) => !p.eligible).length;
    const s = get();
    set({
      audit: [
        ...s.audit,
        auditEvent(
          s,
          'system',
          'VALIDATE',
          `Validated "${label}": ${run.items.length} exception(s) raised (${critical} critical); ` +
            `${blocked} of ${run.publication.length} reports blocked from publication.`,
        ),
      ],
    });
  };

  return {
    ...initial,

    selectDataset: (id) => {
      const s = get();
      if (id === 'imported' && !s.importedFeed) return;
      const label = id === 'imported' ? (s.importedFeed?.label ?? 'Imported CSV') : DATASET_LABELS[id];
      set({
        datasetId: id,
        selectedExceptionId: null,
        audit: [...s.audit, auditEvent(s, actorName(s.reviewer), 'DATASET', `Switched active dataset to "${label}".`)],
      });
      appendValidationEvent(label);
      persist();
    },

    logExport: (what, rows) => {
      const s = get();
      set({
        audit: [
          ...s.audit,
          auditEvent(s, actorName(s.reviewer), 'EXPORT', `Exported ${rows} ${what} row(s) to CSV.`),
        ],
      });
      persist();
    },

    selectException: (id) => set({ selectedExceptionId: id }),

    setReviewer: (name) => {
      // Preserve in-progress whitespace so names such as "Nathan Mackey" can
      // be typed naturally. Audit events normalize the final actor label.
      set({ reviewer: name });
      persist();
    },

    decide: (input) => {
      const { exception, action, reason, correctedValue, assignee } = input;
      if (!reason.trim()) {
        return { ok: false, error: 'A decision reason is required.' };
      }
      if (ACTIONS_REQUIRING_CORRECTED_VALUE.includes(action) && !correctedValue?.trim()) {
        return { ok: false, error: 'Enter the corrected value to approve.' };
      }
      if (ACTIONS_REQUIRING_ASSIGNEE.includes(action) && !assignee?.trim()) {
        return { ok: false, error: 'Name the specialist to reassign to.' };
      }

      const s = get();
      const activeRun = selectRun(s);
      const currentItem = activeRun.items.find((item) => item.exception.id === exception.id);
      if (!currentItem) {
        return { ok: false, error: 'This exception is no longer available in the active dataset.' };
      }
      const currentException = currentItem.exception;
      if (currentItem.cleared && action !== 'reopen') {
        return { ok: false, error: 'This finding is no longer detected. Reopen it before taking another action.' };
      }
      if (action === 'reopen' && !currentItem.cleared && isOpenStatus(currentItem.status)) {
        return { ok: false, error: 'This exception is already open.' };
      }
      if (action === 'quarantine' && !currentException.sourceRecordId) {
        return { ok: false, error: 'Feed-level findings cannot quarantine a nonexistent source record.' };
      }

      let parsedCorrection: string | number | null = null;
      if (action === 'approve_corrected') {
        if (!currentException.sourceRecordId || !currentException.field) {
          return { ok: false, error: 'This finding cannot be resolved with a record-level value correction.' };
        }
        const fieldIsWritable = activeRun.originalVersion.schema.some(
          (field) => field.name === currentException.field,
        );
        if (!fieldIsWritable) {
          return { ok: false, error: 'The source field is not writable in this feed. Resolve its mapping instead.' };
        }
        parsedCorrection = correctionValue(currentException.field, correctedValue ?? '');
        if (parsedCorrection === null) {
          return { ok: false, error: 'Enter a valid numeric correction for this monetary field.' };
        }
      }

      const actor = actorName(s.reviewer);
      const decision: ReviewDecision = {
        id: freshId('RD'),
        exceptionId: currentException.id,
        action,
        reason: reason.trim(),
        reviewer: actor,
        at: nowIso(),
        ...(correctedValue !== undefined ? { correctedValue: correctedValue.trim() } : {}),
        ...(assignee !== undefined ? { assignee: assignee.trim() } : {}),
      };

      const audit = [...s.audit];
      const decisions = [...s.decisions, decision];
      let corrections = s.corrections;
      let quarantinedRecordIds = s.quarantinedRecordIds;

      audit.push(
        auditEvent(
          { audit },
          actor,
          'DECISION',
          `${ACTION_LABELS[action]} on ${currentException.id} (${currentException.ruleId}). Reason: ${decision.reason}`,
          currentException.id,
        ),
      );

      if (
        action === 'approve_corrected' &&
        currentException.sourceRecordId &&
        currentException.field &&
        parsedCorrection !== null
      ) {
        corrections = [
          ...corrections,
          {
            sourceRecordId: currentException.sourceRecordId,
            field: currentException.field,
            value: parsedCorrection,
            exceptionId: currentException.id,
          },
        ];
        audit.push(
          auditEvent(
            { audit },
            actor,
            'CORRECTION',
            `Corrected ${currentException.field} on ${currentException.sourceRecordId} to ${String(parsedCorrection)}. Original values remain in the source record history.`,
            currentException.id,
          ),
        );
      }

      if (action === 'quarantine' && currentException.sourceRecordId) {
        if (!quarantinedRecordIds.includes(currentException.sourceRecordId)) {
          quarantinedRecordIds = [...quarantinedRecordIds, currentException.sourceRecordId];
        }
        audit.push(
          auditEvent(
            { audit },
            actor,
            'QUARANTINE',
            `Source record ${currentException.sourceRecordId} quarantined; it is excluded from normalization until released.`,
            currentException.id,
          ),
        );
      }

      if (action === 'reopen' && currentItem.cleared && currentException.sourceRecordId) {
        const recordId = currentException.sourceRecordId;
        const removedCorrections = corrections.filter((correction) => correction.sourceRecordId === recordId).length;
        const releasedQuarantine = quarantinedRecordIds.includes(recordId);
        corrections = corrections.filter((correction) => correction.sourceRecordId !== recordId);
        quarantinedRecordIds = quarantinedRecordIds.filter((id) => id !== recordId);
        if (removedCorrections > 0 || releasedQuarantine) {
          audit.push(
            auditEvent(
              { audit },
              actor,
              'RELEASE',
              `Reopened source record ${recordId}: removed ${removedCorrections} active correction(s)` +
                `${releasedQuarantine ? ' and released its quarantine' : ''}. The original data will be validated again.`,
              currentException.id,
            ),
          );
        }
      }

      set({ decisions, corrections, quarantinedRecordIds, audit });
      persist();
      return { ok: true };
    },

    importCsv: (text, fileName) => {
      const s = get();
      const result = csvToFeedVersion(text, fileName, nowIso());
      if (!result.ok) {
        set({ importError: result.errors });
        return false;
      }
      set({
        importedFeed: result.version,
        datasetId: 'imported',
        selectedExceptionId: null,
        importError: null,
        audit: [
          ...s.audit,
          auditEvent(
            s,
            actorName(s.reviewer),
            'IMPORT',
            `Imported ${fileName} (${result.version.records.length} rows) as ${result.version.id}. Processed locally only.`,
          ),
        ],
      });
      appendValidationEvent(result.version.label);
      persist();
      return true;
    },

    clearImportError: () => set({ importError: null }),

    resetSession: () => {
      persistence.clear();
      set({
        datasetId: 'clean',
        importedFeed: null,
        decisions: [],
        corrections: [],
        quarantinedRecordIds: [],
        selectedExceptionId: null,
        importError: null,
        audit: [
          auditEvent({ audit: [] }, actorName(get().reviewer), 'DATASET', 'Session reset: decisions, corrections, and quarantines cleared.'),
        ],
      });
      persist();
    },
  };
  });
}

export const useAppStore = createAppStore(
  typeof localStorage === 'undefined'
    ? new MemoryPersistence()
    : new LocalStoragePersistence(localStorage),
);

// ---------------------------------------------------------------------------
// Derived pipeline run (memoized on inputs)
// ---------------------------------------------------------------------------

function feedFor(state: Pick<AppState, 'datasetId' | 'importedFeed'>): {
  version: FeedVersion;
  published: readonly PublishedRecord[];
} {
  if (state.datasetId === 'issues') return { version: FEED_ISSUES, published: PUBLISHED_THROUGH_FY2025 };
  if (state.datasetId === 'imported' && state.importedFeed)
    return { version: state.importedFeed, published: PUBLISHED_THROUGH_FY2025 };
  return { version: FEED_CLEAN, published: PUBLISHED_FY2024 };
}

let cache: { key: string; deps: unknown[]; run: PipelineRun } | null = null;

export function selectRun(state: AppState): PipelineRun {
  const { version, published } = feedFor(state);
  const deps = [version, state.corrections, state.decisions, state.quarantinedRecordIds];
  const key = version.id;
  if (cache && cache.key === key && cache.deps.every((d, i) => d === deps[i])) return cache.run;
  const run = runPipeline(version, published, state.corrections, state.decisions, state.quarantinedRecordIds);
  cache = { key, deps, run };
  return run;
}
