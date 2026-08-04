import type {
  FeedVersion,
  FieldKey,
  NormalizedRecord,
  RuleId,
  Severity,
  ValidationException,
  ValidationRuleDef,
} from '../domain/types';
import { MONETARY_FIELDS, REQUIRED_FIELDS } from '../domain/types';
import type { PublishedRecord } from '../data/feeds';
import { MODELS } from '../data/portfolio';
import type { NormalizationResult } from './normalize';
import { isEmpty } from './normalize';
import type { DriftChange } from './drift';

export const RULE_DEFS: readonly ValidationRuleDef[] = [
  { id: 'missing_required_field', name: 'Missing required field', severity: 'high', blocking: true, description: 'A required normalized field arrived empty.' },
  { id: 'invalid_type', name: 'Incorrect data type', severity: 'high', blocking: true, description: 'A value does not match the expected type. Recoverable formatting issues are downgraded to medium and do not block.' },
  { id: 'invalid_currency', name: 'Invalid currency or unit', severity: 'high', blocking: true, description: 'Monetary values arrived in a currency with no conversion record.' },
  { id: 'unexpected_unit_multiplier', name: 'Unexpected unit multiplier', severity: 'critical', blocking: true, description: 'A monetary value moved by ~×1000 against the published version, consistent with a units/thousands mix-up.' },
  { id: 'accounting_equation', name: 'Accounting equation', severity: 'critical', blocking: true, description: 'Assets must equal liabilities plus equity within $1M.' },
  { id: 'duplicate_source_record', name: 'Duplicate source record', severity: 'medium', blocking: false, description: 'The same entity and period appeared more than once; later copies are excluded.' },
  { id: 'stale_data', name: 'Stale data', severity: 'high', blocking: false, description: 'An older period attempted to overwrite a newer published version; the overwrite is prevented.' },
  { id: 'filing_before_period_end', name: 'Filing date before period end', severity: 'high', blocking: true, description: 'A filing date precedes its own period end.' },
  { id: 'unexpected_period', name: 'Unexpected reporting period', severity: 'medium', blocking: false, description: 'The reporting period is outside the expected fiscal cycles.' },
  { id: 'implausible_change', name: 'Implausible period-over-period change', severity: 'high', blocking: false, description: 'A value moved more than 40% against the published comparison without explanation.' },
  { id: 'schema_field_removed', name: 'Schema field removed', severity: 'high', blocking: true, description: 'A mapped source field disappeared from the feed schema.' },
  { id: 'schema_field_renamed', name: 'Schema field renamed', severity: 'high', blocking: false, description: 'A mapped source field appears under a probable new name; the mapping needs review.' },
  { id: 'schema_field_type_changed', name: 'Schema field type changed', severity: 'high', blocking: true, description: 'A source field changed type in the feed schema.' },
  { id: 'schema_unit_changed', name: 'Schema unit changed', severity: 'critical', blocking: true, description: 'A source field declared a new unit without a mapping update.' },
  { id: 'unmapped_field', name: 'Unmapped incoming field', severity: 'low', blocking: false, description: 'The feed supplies a field the normalized schema does not map.' },
  { id: 'broken_dependency', name: 'Broken downstream dependency', severity: 'high', blocking: true, description: 'A model input can no longer be supplied by this feed.' },
];

export function ruleDef(id: RuleId): ValidationRuleDef {
  const def = RULE_DEFS.find((r) => r.id === id);
  if (!def) throw new Error(`Unknown rule ${id}`);
  return def;
}

export interface ValidationInput {
  version: FeedVersion;
  published: readonly PublishedRecord[];
  norm: NormalizationResult;
  /** Drift of this feed's schema against the reference baseline schema. */
  drift: DriftChange[];
  /** Fiscal years considered current; used by the unexpected-period control. */
  expectedYears: number[];
}

function exId(ruleId: RuleId, anchor: string, field: string | null): string {
  return `EX|${ruleId}|${anchor}|${field ?? 'feed'}`;
}

function publishedValue(
  published: readonly PublishedRecord[],
  ticker: string,
  field: FieldKey,
): number | null {
  const rows = published.filter((p) => p.ticker === ticker).sort((a, b) => (a.period < b.period ? 1 : -1));
  for (const row of rows) {
    const v = row.values[field];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

const money = (v: number): string => {
  const abs = Math.abs(v);
  const fmt =
    abs >= 1e9 ? `$${(abs / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}B` : abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M` : `$${abs.toLocaleString('en-US')}`;
  return v < 0 ? `-${fmt}` : fmt;
};

interface Draft {
  ruleId: RuleId;
  anchor: string;
  field?: FieldKey | null;
  incomingField?: string | null;
  counterpartyId?: string | null;
  sourceRecordId?: string | null;
  explanation: string;
  expected: string;
  observed: string;
  recommendedAction: string;
  scope: ValidationException['scope'];
  severity?: Severity;
  blocking?: boolean;
  materialityUsd?: number | null;
  materialityRatio?: number | null;
}

/** Run every control against a normalized feed and produce structured exceptions. */
export function runValidation(input: ValidationInput): ValidationException[] {
  const { version, published, norm, drift, expectedYears } = input;
  const drafts: Draft[] = [];
  const mappedFields = new Set(norm.mapping.map((mapping) => mapping.normalized));

  for (const record of norm.records) {
    validateRecord(record, published, expectedYears, mappedFields, drafts);
  }

  // Duplicate and stale records surfaced during normalization.
  for (const ex of norm.excluded) {
    const ticker = String(ex.record.values['ticker'] ?? 'unknown');
    const cpId = norm.records.find((r) => r.ticker === ticker)?.counterpartyId ?? tickerToCp(ticker);
    if (ex.reason === 'duplicate') {
      drafts.push({
        ruleId: 'duplicate_source_record',
        anchor: ex.record.recordId,
        sourceRecordId: ex.record.recordId,
        counterpartyId: cpId,
        explanation: `${ex.detail} The duplicate has been excluded from normalization to prevent double counting.`,
        expected: 'One record per counterparty and period',
        observed: `Second record ${ex.record.recordId} for ${ticker} ${String(ex.record.values['period'] ?? '')}`,
        recommendedAction: 'Quarantine the duplicate record and confirm with the provider which submission is authoritative.',
        scope: 'record',
        field: null,
      });
    } else {
      drafts.push({
        ruleId: 'stale_data',
        anchor: ex.record.recordId,
        sourceRecordId: ex.record.recordId,
        counterpartyId: cpId,
        explanation: `${ex.detail} The overwrite was prevented; the published version is retained.`,
        expected: 'Incoming period is the same or newer than the published period',
        observed: `Incoming period ${String(ex.record.values['period'] ?? '')}`,
        recommendedAction: 'Reject the stale submission and investigate why the provider re-sent an old period.',
        scope: 'record',
        field: null,
      });
    }
  }

  // Schema drift against the reference baseline.
  for (const change of drift) {
    if (change.kind === 'renamed' && change.fieldBefore && change.fieldAfter) {
      drafts.push({
        ruleId: 'schema_field_renamed',
        anchor: version.id,
        incomingField: change.fieldAfter,
        field: normalizedFor(change.fieldBefore),
        explanation: change.explanation,
        expected: change.before,
        observed: change.after,
        recommendedAction: `Confirm the rename with the provider, then update the mapping "${change.fieldBefore}" → "${change.fieldAfter}".`,
        scope: 'feed',
      });
    } else if (change.kind === 'removed' && change.fieldBefore && change.affectedMappings.length) {
      drafts.push({
        ruleId: 'schema_field_removed',
        anchor: version.id,
        incomingField: change.fieldBefore,
        field: normalizedFor(change.fieldBefore),
        explanation: change.explanation,
        expected: change.before,
        observed: 'Field absent from incoming schema',
        recommendedAction: 'Quarantine the load until the provider restores the field or the mapping is redesigned.',
        scope: 'feed',
      });
    } else if (change.kind === 'type_changed' && change.fieldBefore) {
      drafts.push({
        ruleId: 'schema_field_type_changed',
        anchor: version.id,
        incomingField: change.fieldBefore,
        field: normalizedFor(change.fieldBefore),
        explanation: change.explanation,
        expected: change.before,
        observed: change.after,
        recommendedAction: 'Quarantine the load and update the parser/mapping before accepting the new type.',
        scope: 'feed',
      });
    } else if (change.kind === 'unit_changed' && change.fieldBefore) {
      drafts.push({
        ruleId: 'schema_unit_changed',
        anchor: version.id,
        incomingField: change.fieldBefore,
        field: normalizedFor(change.fieldBefore),
        explanation: change.explanation,
        expected: change.before,
        observed: change.after,
        recommendedAction: 'Quarantine the load; monetary magnitudes are not comparable until the mapping applies the new unit.',
        scope: 'feed',
      });
    }
  }

  // Unmapped incoming fields not already explained as renames.
  const renameTargets = new Set(
    drift.filter((c) => c.kind === 'renamed').map((c) => c.fieldAfter ?? ''),
  );
  for (const name of norm.unmappedIncoming) {
    if (renameTargets.has(name)) continue;
    drafts.push({
      ruleId: 'unmapped_field',
      anchor: version.id,
      incomingField: name,
      explanation: `The feed supplies "${name}" but no mapping brings it into the normalized schema; the values are ignored.`,
      expected: 'Every supplied field mapped or intentionally excluded',
      observed: `Unmapped incoming field "${name}"`,
      recommendedAction: 'Decide whether to map the field or document it as intentionally ignored.',
      scope: 'feed',
      field: null,
    });
  }

  // Broken model dependencies: required inputs the feed can no longer supply.
  for (const field of norm.missingMappedFields) {
    const models = MODELS.filter((m) => m.inputFields.includes(field));
    if (!models.length) continue;
    drafts.push({
      ruleId: 'broken_dependency',
      anchor: version.id,
      field,
      explanation: `Normalized field "${field}" has no source in this feed, so ${models.map((m) => m.name).join(' and ')} cannot run on the incoming version.`,
      expected: `A mapped source for "${field}"`,
      observed: 'No incoming field maps to it',
      recommendedAction: 'Restore the mapping (or approve a documented override) before dependent models are rerun.',
      scope: 'feed',
    });
  }

  return drafts.map((d) => finalize(d, version.id));
}

function tickerToCp(ticker: string): string | null {
  return ['UAL', 'DAL', 'AAL'].includes(ticker) ? `CP-${ticker}` : null;
}

function normalizedFor(incoming: string): FieldKey | null {
  return (REQUIRED_FIELDS as readonly string[]).includes(incoming) ? (incoming as FieldKey) : null;
}

function validateRecord(
  record: NormalizedRecord,
  published: readonly PublishedRecord[],
  expectedYears: number[],
  mappedFields: ReadonlySet<FieldKey>,
  drafts: Draft[],
): void {
  const anchor = record.sourceRecordId;
  const base = {
    anchor,
    sourceRecordId: record.sourceRecordId,
    counterpartyId: record.counterpartyId,
    scope: 'record' as const,
  };
  // Missing required fields (only where the feed maps the field at all —
  // feed-wide mapping loss is reported once by the schema/dependency rules).
  for (const field of REQUIRED_FIELDS) {
    const nfv = record.fields[field];
    if (!mappedFields.has(field)) continue;
    if (nfv === undefined || isEmpty(nfv.raw)) {
      const prior = MONETARY_FIELDS.includes(field) ? publishedValue(published, record.ticker, field) : null;
      drafts.push({
        ...base,
        ruleId: 'missing_required_field',
        field,
        explanation: `${record.ticker} arrived without a value for "${field}", which is required for credit and liquidity analysis.`,
        expected: 'A non-empty value',
        observed: 'Empty',
        recommendedAction: 'Reject the incoming record or approve a corrected value sourced from the filing.',
        materialityUsd: prior !== null ? Math.abs(prior) : null,
      });
    }
  }

  // Type checks for identifiers and dates. Monetary values are handled below
  // because recoverable formatted numerics receive a different disposition.
  for (const field of ['ticker', 'airline', 'currency'] as const) {
    const nfv = record.fields[field];
    if (!nfv || isEmpty(nfv.raw) || typeof nfv.raw === 'string') continue;
    drafts.push({
      ...base,
      ruleId: 'invalid_type',
      field,
      explanation: `${record.ticker || 'This record'} "${field}" must be text, but the incoming value is ${typeof nfv.raw}.`,
      expected: 'Text value',
      observed: `${String(nfv.raw)} (${typeof nfv.raw})`,
      recommendedAction: 'Reject the incoming value or approve a corrected text value.',
    });
  }

  for (const field of ['period', 'filed'] as const) {
    const nfv = record.fields[field];
    if (!nfv || isEmpty(nfv.raw)) continue;
    if (typeof nfv.raw !== 'string' || !isIsoCalendarDate(nfv.raw)) {
      drafts.push({
        ...base,
        ruleId: 'invalid_type',
        field,
        explanation: `${record.ticker || 'This record'} "${field}" is not a valid ISO calendar date.`,
        expected: 'A real calendar date in YYYY-MM-DD format',
        observed: `${String(nfv.raw)} (${typeof nfv.raw})`,
        recommendedAction: 'Reject the incoming value or approve a corrected ISO date.',
      });
    }
  }

  // Type checks on monetary fields.
  for (const field of MONETARY_FIELDS) {
    const nfv = record.fields[field];
    if (!nfv || isEmpty(nfv.raw)) continue;
    if (typeof nfv.raw === 'string') {
      if (nfv.coerced && typeof nfv.value === 'number') {
        const prior = publishedValue(published, record.ticker, field);
        const delta = prior !== null ? Math.abs(nfv.value - prior) : null;
        drafts.push({
          ...base,
          ruleId: 'invalid_type',
          field,
          severity: 'medium',
          blocking: false,
          explanation: `${record.ticker} "${field}" arrived as formatted text instead of a number. The parser recovered ${money(nfv.value)}${delta === 0 ? ', which matches the published value exactly' : ''}.`,
          expected: 'Numeric value',
          observed: `"${nfv.raw}" (string)`,
          recommendedAction: 'Approve the parsed value and ask the provider to send unformatted numerics.',
          materialityUsd: delta,
          materialityRatio: prior ? (delta ?? 0) / Math.abs(prior) : null,
        });
      } else {
        const prior = publishedValue(published, record.ticker, field);
        drafts.push({
          ...base,
          ruleId: 'invalid_type',
          field,
          explanation: `${record.ticker} "${field}" arrived as text that cannot be parsed as a number; the field is unusable.`,
          expected: 'Numeric value',
          observed: `"${nfv.raw}" (unparseable string)`,
          recommendedAction: 'Reject the incoming value or approve a corrected value from the filing.',
          materialityUsd: prior !== null ? Math.abs(prior) : null,
        });
      }
    }
  }

  // Currency control.
  const currency = record.fields['currency']?.value;
  if (typeof currency === 'string' && currency !== 'USD') {
    const assets = publishedValue(published, record.ticker, 'assets');
    drafts.push({
      ...base,
      ruleId: 'invalid_currency',
      field: 'currency',
      scope: 'counterparty',
      explanation: `${record.ticker} reported in ${currency} with no conversion record. Every monetary value on the record is suspect until converted or rejected.`,
      expected: 'USD (or a documented conversion record)',
      observed: currency,
      recommendedAction: 'Reject the incoming version or attach a documented conversion before accepting.',
      materialityUsd: assets !== null ? Math.abs(assets) : null,
    });
  }

  // Unit multiplier and plausibility against the published comparison.
  for (const field of MONETARY_FIELDS) {
    const nfv = record.fields[field];
    if (!nfv || typeof nfv.value !== 'number' || nfv.value === 0) continue;
    const prior = publishedValue(published, record.ticker, field);
    if (prior === null || prior === 0) continue;
    const ratio = Math.abs(nfv.value / prior);
    if ((ratio >= 1 / 1100 && ratio <= 1 / 900) || (ratio >= 900 && ratio <= 1100)) {
      drafts.push({
        ...base,
        ruleId: 'unexpected_unit_multiplier',
        field,
        explanation: `${record.ticker} "${field}" is ${money(nfv.value)} against a published ${money(prior)} — a ×${ratio < 1 ? '1/1000' : '1000'} shift consistent with a units/thousands mix-up with no mapping update.`,
        expected: `Same order of magnitude as published ${money(prior)}`,
        observed: money(nfv.value),
        recommendedAction: 'Quarantine the load or approve corrected full-unit values; confirm the provider’s unit declaration.',
        materialityUsd: Math.abs(nfv.value - prior),
        materialityRatio: Math.abs(nfv.value - prior) / Math.abs(prior),
      });
    } else if (Math.abs(nfv.value - prior) / Math.max(Math.abs(prior), 1) > 0.4) {
      drafts.push({
        ...base,
        ruleId: 'implausible_change',
        field,
        explanation: `${record.ticker} "${field}" moved ${(((nfv.value - prior) / Math.abs(prior)) * 100).toFixed(1)}% against the published comparison — outside the 40% plausibility band.`,
        expected: `Within ±40% of ${money(prior)}`,
        observed: money(nfv.value),
        recommendedAction: 'Verify the movement against the filing before accepting; large true movements can be accepted with a documented override.',
        materialityUsd: Math.abs(nfv.value - prior),
        materialityRatio: Math.abs(nfv.value - prior) / Math.abs(prior),
      });
    }
  }

  // Accounting equation.
  const assets = record.fields['assets']?.value;
  const liabilities = record.fields['liabilities']?.value;
  const equity = record.fields['equity']?.value;
  if (typeof assets === 'number' && typeof liabilities === 'number' && typeof equity === 'number') {
    const diff = Math.abs(assets - (liabilities + equity));
    if (diff > 1_000_000) {
      drafts.push({
        ...base,
        ruleId: 'accounting_equation',
        field: 'liabilities',
        explanation: `${record.ticker} balance sheet does not reconcile: assets ${money(assets)} vs liabilities + equity ${money(liabilities + equity)} — off by ${money(diff)}. A mismatch of this size invalidates leverage and coverage analysis.`,
        expected: 'Assets = liabilities + equity (±$1M)',
        observed: `Difference of ${money(diff)}`,
        recommendedAction: 'Quarantine the source record and confirm restated liabilities or equity against the filing before publication.',
        materialityUsd: diff,
        materialityRatio: diff / Math.abs(assets),
      });
    }
  }

  // Filing sequence.
  const period = record.fields['period']?.value;
  const filed = record.fields['filed']?.value;
  if (
    typeof period === 'string' &&
    typeof filed === 'string' &&
    isIsoCalendarDate(period) &&
    isIsoCalendarDate(filed)
  ) {
    const p = Date.parse(period);
    const f = Date.parse(filed);
    if (Number.isFinite(p) && Number.isFinite(f) && f <= p) {
      drafts.push({
        ...base,
        ruleId: 'filing_before_period_end',
        field: 'filed',
        explanation: `${record.ticker} filing date ${filed} does not follow the period end ${period}; the record timeline is corrupt.`,
        expected: `Filed after ${period}`,
        observed: filed,
        recommendedAction: 'Reject the record and request a corrected submission.',
      });
    }
  }

  // Expected reporting period.
  if (typeof period === 'string' && isIsoCalendarDate(period)) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period)!;
    const year = Number(match[1]);
    const monthDay = `${match[2]}-${match[3]}`;
    if (monthDay !== '12-31' || !expectedYears.includes(year)) {
      drafts.push({
        ...base,
        ruleId: 'unexpected_period',
        field: 'period',
        explanation: `${record.ticker} period "${period}" is outside the expected calendar-year cycles (${expectedYears.map((y) => `${y}-12-31`).join(', ')}).`,
        expected: expectedYears.map((y) => `${y}-12-31`).join(' or '),
        observed: period,
        recommendedAction: 'Confirm the filer’s fiscal calendar before accepting an off-cycle period.',
      });
    }
  }
}

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function finalize(d: Draft, versionId: string): ValidationException {
  const def = ruleDef(d.ruleId);
  return {
    id: exId(d.ruleId, d.anchor, d.field ?? d.incomingField ?? null),
    ruleId: d.ruleId,
    severity: d.severity ?? def.severity,
    blocking: d.blocking ?? def.blocking,
    explanation: d.explanation,
    expected: d.expected,
    observed: d.observed,
    field: d.field ?? null,
    incomingField: d.incomingField ?? null,
    counterpartyId: d.counterpartyId ?? null,
    sourceRecordId: d.sourceRecordId ?? null,
    versionId,
    recommendedAction: d.recommendedAction,
    scope: d.scope,
    materialityUsd: d.materialityUsd ?? null,
    materialityRatio: d.materialityRatio ?? null,
  };
}
