import type {
  AnalyticalModel,
  Correction,
  ExceptionStatus,
  FeedVersion,
  ImpactResult,
  Report,
  ReviewDecision,
  ScoreBreakdown,
  ValidationException,
} from '../domain/types';
import type { PublishedRecord } from '../data/feeds';
import { FEED_CLEAN } from '../data/feeds';
import { MODELS, REPORTS, SOURCE_SYSTEMS } from '../data/portfolio';
import { normalizeFeed, type NormalizationResult } from './normalize';
import { runValidation } from './rules';
import { detectDrift, type DriftChange } from './drift';
import { impactOfException, recalculateBlocked, type BlockedState } from './dependencies';
import { scoreException } from './scoring';

export interface QueueItem {
  exception: ValidationException;
  impact: ImpactResult;
  score: ScoreBreakdown;
  status: ExceptionStatus;
  decisions: ReviewDecision[];
  assignee: string | null;
  /**
   * True when the current data no longer triggers this control because a
   * review action corrected or quarantined the underlying record. The item is
   * retained so the reviewer and any auditor can still see the original
   * finding and its outcome; it no longer blocks publication.
   */
  cleared: boolean;
}

export interface PublicationStatus {
  report: Report;
  eligible: boolean;
  blockedBy: string[]; // exception ids
}

export interface ModelStatus {
  model: AnalyticalModel;
  blocked: boolean;
  blockedBy: string[];
}

export interface PipelineRun {
  version: FeedVersion;
  /** The feed exactly as received, before corrections or quarantines. */
  originalVersion: FeedVersion;
  norm: NormalizationResult;
  drift: DriftChange[];
  items: QueueItem[];
  blocked: BlockedState;
  publication: PublicationStatus[];
  models: ModelStatus[];
  quarantinedRecordIds: string[];
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function statusFromDecisions(decisions: readonly ReviewDecision[]): ExceptionStatus {
  const last = decisions[decisions.length - 1];
  if (!last) return 'open';
  switch (last.action) {
    case 'approve_corrected':
      return 'resolved_corrected';
    case 'accept_override':
      return 'resolved_override';
    case 'reject':
      return 'rejected';
    case 'quarantine':
      return 'quarantined';
    case 'reassign':
      return 'reassigned';
    case 'false_positive':
      return 'false_positive';
    case 'reopen':
      return 'open';
  }
}

/** Open statuses keep blocking publication until a resolving decision lands. */
export function isOpenStatus(status: ExceptionStatus): boolean {
  return status === 'open' || status === 'reassigned';
}

/** An item still requiring reviewer attention on the current data. */
export function isActionable(item: QueueItem): boolean {
  return !item.cleared && isOpenStatus(item.status);
}

function applyCorrections(version: FeedVersion, corrections: readonly Correction[]): FeedVersion {
  if (!corrections.length) return version;
  const incomingByNormalized = new Map(
    version.schema
      .map((f) => f.name)
      .map((name) => [name, name] as const),
  );
  const records = version.records.map((r) => {
    const applicable = corrections.filter((c) => c.sourceRecordId === r.recordId);
    if (!applicable.length) return r;
    const values = { ...r.values };
    for (const c of applicable) {
      // The demo mappings use identical incoming/normalized names; renamed
      // fields cannot be corrected by value (mapping review handles those).
      const incoming = incomingByNormalized.get(c.field);
      if (incoming) values[incoming] = c.value;
    }
    return { ...r, values };
  });
  return { ...version, records };
}

function removeQuarantined(version: FeedVersion, quarantined: ReadonlySet<string>): FeedVersion {
  if (!quarantined.size) return version;
  return { ...version, records: version.records.filter((r) => !quarantined.has(r.recordId)) };
}

/**
 * Deterministic end-to-end run:
 * ingest → normalize → validate → dependencies → score → apply decisions →
 * recalculate blocked outputs and publication eligibility.
 */
function evaluate(
  version: FeedVersion,
  published: readonly PublishedRecord[],
): { norm: NormalizationResult; drift: DriftChange[]; exceptions: ValidationException[] } {
  const norm = normalizeFeed(version, published);
  const drift = version.id === FEED_CLEAN.id ? [] : detectDrift(FEED_CLEAN, version);
  const exceptions = runValidation({ version, published, norm, drift, expectedYears: [2024, 2025] });
  return { norm, drift, exceptions };
}

export function runPipeline(
  incoming: FeedVersion,
  published: readonly PublishedRecord[],
  corrections: readonly Correction[],
  decisions: readonly ReviewDecision[],
  quarantinedRecordIds: readonly string[],
): PipelineRun {
  const quarantined = new Set(quarantinedRecordIds);
  const version = removeQuarantined(applyCorrections(incoming, corrections), quarantined);

  const current = evaluate(version, published);
  // Baseline evidence: what the feed produced before any review action. Used to
  // retain findings that a correction or quarantine has since cleared.
  const original =
    corrections.length || quarantined.size ? evaluate(incoming, published) : current;

  const source =
    SOURCE_SYSTEMS.find((s) => s.id === version.sourceSystemId) ?? SOURCE_SYSTEMS[0]!;

  const decisionsByException = new Map<string, ReviewDecision[]>();
  for (const d of decisions) {
    const list = decisionsByException.get(d.exceptionId) ?? [];
    list.push(d);
    decisionsByException.set(d.exceptionId, list);
  }

  const currentIds = new Set(current.exceptions.map((e) => e.id));
  const clearedExceptions = original.exceptions.filter(
    (e) => !currentIds.has(e.id) && decisionsByException.has(e.id),
  );

  const toItem = (exception: ValidationException, cleared: boolean): QueueItem => {
    const impact = impactOfException(exception);
    const score = scoreException(exception, impact, source);
    const exDecisions = decisionsByException.get(exception.id) ?? [];
    const status = statusFromDecisions(exDecisions);
    const lastReassign = [...exDecisions].reverse().find((d) => d.action === 'reassign');
    return {
      exception,
      impact,
      score,
      status,
      decisions: exDecisions,
      assignee: status === 'reassigned' ? (lastReassign?.assignee ?? null) : null,
      cleared,
    };
  };

  const items: QueueItem[] = [
    ...current.exceptions.map((e) => toItem(e, false)),
    ...clearedExceptions.map((e) => toItem(e, true)),
  ];
  const { norm, drift } = current;

  items.sort((a, b) => {
    // Work still needing attention outranks anything already decided.
    const aOpen = isOpenStatus(a.status) && !a.cleared;
    const bOpen = isOpenStatus(b.status) && !b.cleared;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    const sev = SEVERITY_ORDER[a.exception.severity] - SEVERITY_ORDER[b.exception.severity];
    if (sev !== 0) return sev;
    return a.exception.id.localeCompare(b.exception.id);
  });

  // Cleared findings never block: the current data no longer violates the control.
  const openBlocking = items
    .filter((i) => !i.cleared && i.exception.blocking && isOpenStatus(i.status))
    .map((i) => i.exception);
  const blocked = recalculateBlocked(openBlocking);

  const models: ModelStatus[] = MODELS.map((model) => ({
    model,
    blocked: blocked.blockedModelIds.has(model.id),
    blockedBy: blocked.blockingByModel.get(model.id) ?? [],
  }));

  const publication: PublicationStatus[] = REPORTS.map((report) => ({
    report,
    eligible: !blocked.blockedReportIds.has(report.id),
    blockedBy: blocked.blockingByReport.get(report.id) ?? [],
  }));

  return {
    version,
    originalVersion: incoming,
    norm,
    drift,
    items,
    blocked,
    publication,
    models,
    quarantinedRecordIds: [...quarantined],
  };
}
