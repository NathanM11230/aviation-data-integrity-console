import type {
  FeedVersion,
  FieldKey,
  FieldMapping,
  NormalizedFieldValue,
  NormalizedRecord,
  RawValue,
  SourceRecord,
} from '../domain/types';
import { MONETARY_FIELDS, REQUIRED_FIELDS } from '../domain/types';
import { BASELINE_MAPPING } from '../data/secData';
import { counterpartyByTicker } from '../data/portfolio';
import type { PublishedRecord } from '../data/feeds';

export interface ExcludedRecord {
  record: SourceRecord;
  reason: 'duplicate' | 'stale';
  detail: string;
}

export interface NormalizationResult {
  records: NormalizedRecord[];
  excluded: ExcludedRecord[];
  /** Mappings that found a matching incoming field in this feed's schema. */
  mapping: FieldMapping[];
  /** Incoming schema fields with no mapping to the normalized schema. */
  unmappedIncoming: string[];
  /** Normalized fields the feed no longer supplies. */
  missingMappedFields: FieldKey[];
}

export interface Coercion {
  value: string | number | null;
  coerced: boolean;
}

/** Deterministic cleanup of numeric strings such as "5,942,000,000" or "$1.2". */
export function coerceNumber(raw: RawValue): Coercion {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, coerced: false } : { value: null, coerced: false };
  }
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(/^\$/, '').replace(/,/g, '');
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
      return { value: Number(cleaned), coerced: true };
    }
    return { value: null, coerced: false };
  }
  return { value: null, coerced: false };
}

export function isEmpty(raw: RawValue | undefined): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

function latestPublishedPeriod(published: readonly PublishedRecord[], ticker: string): string | null {
  const periods = published.filter((p) => p.ticker === ticker).map((p) => p.period);
  return periods.length ? periods.reduce((a, b) => (a > b ? a : b)) : null;
}

/**
 * Normalize a feed version: apply field mappings, coerce values, drop duplicate
 * and stale records (they are surfaced as exceptions, not silently ignored).
 */
export function normalizeFeed(
  version: FeedVersion,
  published: readonly PublishedRecord[],
): NormalizationResult {
  const schemaNames = new Set(version.schema.map((f) => f.name));
  const mapping = BASELINE_MAPPING.filter((m) => schemaNames.has(m.incoming));
  const mappedIncoming = new Set(mapping.map((m) => m.incoming));
  const unmappedIncoming = version.schema.map((f) => f.name).filter((n) => !mappedIncoming.has(n));
  const coveredNormalized = new Set(mapping.map((m) => m.normalized));
  const missingMappedFields = REQUIRED_FIELDS.filter((f) => !coveredNormalized.has(f));

  const excluded: ExcludedRecord[] = [];
  const records: NormalizedRecord[] = [];
  const seenKeys = new Set<string>();

  for (const record of version.records) {
    const ticker = String(record.values['ticker'] ?? '');
    const period = String(record.values['period'] ?? '');
    const key = `${ticker}|${period}`;

    if (seenKeys.has(key)) {
      excluded.push({
        record,
        reason: 'duplicate',
        detail: `A record for ${ticker} ${period} already exists in this feed.`,
      });
      continue;
    }
    seenKeys.add(key);

    const latest = latestPublishedPeriod(published, ticker);
    if (latest !== null && period < latest) {
      excluded.push({
        record,
        reason: 'stale',
        detail: `Incoming period ${period} is older than the published period ${latest} for ${ticker}.`,
      });
      continue;
    }

    const fields: Partial<Record<FieldKey, NormalizedFieldValue>> = {};
    for (const m of mapping) {
      const raw = record.values[m.incoming];
      if (raw === undefined) continue;
      let value: string | number | null;
      let coerced = false;
      if (MONETARY_FIELDS.includes(m.normalized)) {
        const c = coerceNumber(raw);
        value = c.value;
        coerced = c.coerced;
      } else {
        value = isEmpty(raw) ? null : raw;
      }
      fields[m.normalized] = {
        field: m.normalized,
        raw: raw,
        value,
        coerced,
        sourceRecordId: record.recordId,
        versionId: version.id,
      };
    }

    records.push({
      ticker,
      counterpartyId: counterpartyByTicker(ticker)?.id ?? null,
      sourceRecordId: record.recordId,
      versionId: version.id,
      fields,
      unmappedFields: Object.keys(record.values).filter((n) => !mappedIncoming.has(n)),
    });
  }

  return { records, excluded, mapping, unmappedIncoming, missingMappedFields };
}
