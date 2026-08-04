import type { FeedSchemaField, FeedVersion } from '../domain/types';
import { BASELINE_MAPPING } from '../data/secData';
import { MODELS, REPORTS } from '../data/portfolio';

export type DriftKind =
  | 'added'
  | 'removed'
  | 'renamed'
  | 'type_changed'
  | 'unit_changed'
  | 'enum_changed'
  | 'nullability_changed'
  | 'distribution_changed';

export type DriftDisposition = 'proceed' | 'review' | 'quarantine';

export interface DriftChange {
  kind: DriftKind;
  fieldBefore: string | null;
  fieldAfter: string | null;
  before: string;
  after: string;
  explanation: string;
  affectedMappings: string[];
  affectedModelIds: string[];
  affectedReportIds: string[];
  disposition: DriftDisposition;
}

function describeField(f: FeedSchemaField): string {
  const parts: string[] = [f.type];
  if (f.unit) parts.push(f.unit);
  parts.push(f.nullable ? 'nullable' : 'required');
  if (f.enumValues) parts.push(`enum [${f.enumValues.join(', ')}]`);
  return parts.join(', ');
}

function tokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Token-overlap similarity used to explain probable renames. 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (ta.length === 0 || tb.size === 0) return 0;
  const shared = ta.filter((t) => tb.has(t)).length;
  return shared / Math.max(ta.length, tb.size);
}

function downstreamOfNormalized(normalized: string): { modelIds: string[]; reportIds: string[] } {
  const modelIds = MODELS.filter((m) => (m.inputFields as string[]).includes(normalized)).map((m) => m.id);
  const reportIds = REPORTS.filter((r) => r.modelIds.some((id) => modelIds.includes(id))).map((r) => r.id);
  return { modelIds, reportIds };
}

function impactFor(incomingName: string): {
  affectedMappings: string[];
  affectedModelIds: string[];
  affectedReportIds: string[];
} {
  const mapping = BASELINE_MAPPING.find((m) => m.incoming === incomingName);
  if (!mapping) return { affectedMappings: [], affectedModelIds: [], affectedReportIds: [] };
  const { modelIds, reportIds } = downstreamOfNormalized(mapping.normalized);
  return {
    // Source and normalized names are identical in the baseline mapping, so
    // both sides are labelled to keep the direction unambiguous.
    affectedMappings: [`source.${mapping.incoming} → normalized.${mapping.normalized}`],
    affectedModelIds: modelIds,
    affectedReportIds: reportIds,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return m ?? null;
}

function numericColumn(version: FeedVersion, field: string): number[] {
  const out: number[] = [];
  for (const r of version.records) {
    const v = r.values[field];
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) out.push(Math.abs(v));
  }
  return out;
}

/**
 * Compare two feed versions and report every schema and distribution change
 * with its downstream impact and a recommended disposition.
 */
export function detectDrift(before: FeedVersion, after: FeedVersion): DriftChange[] {
  const changes: DriftChange[] = [];
  const beforeByName = new Map(before.schema.map((f) => [f.name, f]));
  const afterByName = new Map(after.schema.map((f) => [f.name, f]));

  const removed = before.schema.filter((f) => !afterByName.has(f.name));
  const added = after.schema.filter((f) => !beforeByName.has(f.name));
  const matchedRenames = new Set<string>();

  // Renames: removed + added pair with explainable similarity and same type.
  for (const r of removed) {
    let best: { field: FeedSchemaField; score: number } | null = null;
    for (const a of added) {
      if (matchedRenames.has(a.name) || a.type !== r.type) continue;
      const score = nameSimilarity(r.name, a.name);
      if (score >= 0.5 && (!best || score > best.score)) best = { field: a, score };
    }
    if (best) {
      matchedRenames.add(best.field.name);
      const impact = impactFor(r.name);
      changes.push({
        kind: 'renamed',
        fieldBefore: r.name,
        fieldAfter: best.field.name,
        before: `${r.name} (${describeField(r)})`,
        after: `${best.field.name} (${describeField(best.field)})`,
        explanation: `Probable rename: shares ${Math.round(best.score * 100)}% of name tokens with "${r.name}" and has the same type. The existing mapping no longer resolves.`,
        ...impact,
        disposition: 'quarantine',
      });
    } else {
      const impact = impactFor(r.name);
      changes.push({
        kind: 'removed',
        fieldBefore: r.name,
        fieldAfter: null,
        before: `${r.name} (${describeField(r)})`,
        after: '—',
        explanation: `Field "${r.name}" was removed from the feed.`,
        ...impact,
        disposition: impact.affectedMappings.length ? 'quarantine' : 'review',
      });
    }
  }

  for (const a of added) {
    if (matchedRenames.has(a.name)) continue;
    changes.push({
      kind: 'added',
      fieldBefore: null,
      fieldAfter: a.name,
      before: '—',
      after: `${a.name} (${describeField(a)})`,
      explanation: `New field "${a.name}" is not mapped to the normalized schema; it will be ignored until mapped.`,
      affectedMappings: [],
      affectedModelIds: [],
      affectedReportIds: [],
      disposition: 'review',
    });
  }

  // Changes on fields present in both versions.
  for (const b of before.schema) {
    const a = afterByName.get(b.name);
    if (!a) continue;
    const impact = impactFor(b.name);
    if (a.type !== b.type) {
      changes.push({
        kind: 'type_changed',
        fieldBefore: b.name,
        fieldAfter: a.name,
        before: describeField(b),
        after: describeField(a),
        explanation: `Type of "${b.name}" changed from ${b.type} to ${a.type}.`,
        ...impact,
        disposition: 'quarantine',
      });
    }
    if ((a.unit ?? null) !== (b.unit ?? null)) {
      changes.push({
        kind: 'unit_changed',
        fieldBefore: b.name,
        fieldAfter: a.name,
        before: describeField(b),
        after: describeField(a),
        explanation: `Declared unit of "${b.name}" changed from ${b.unit ?? 'none'} to ${a.unit ?? 'none'} without a mapping update.`,
        ...impact,
        disposition: 'quarantine',
      });
    }
    const be = (b.enumValues ?? []).join('|');
    const ae = (a.enumValues ?? []).join('|');
    if (be !== ae) {
      changes.push({
        kind: 'enum_changed',
        fieldBefore: b.name,
        fieldAfter: a.name,
        before: describeField(b),
        after: describeField(a),
        explanation: `Allowed values of "${b.name}" changed from [${be || '—'}] to [${ae || '—'}].`,
        ...impact,
        disposition: 'review',
      });
    }
    if (a.nullable !== b.nullable) {
      changes.push({
        kind: 'nullability_changed',
        fieldBefore: b.name,
        fieldAfter: a.name,
        before: describeField(b),
        after: describeField(a),
        explanation: `"${b.name}" is ${a.nullable ? 'now nullable; required values may go missing' : 'now required'}.`,
        ...impact,
        disposition: a.nullable ? 'review' : 'proceed',
      });
    }
    // Material distribution change on shared numeric fields with data.
    if (a.type === 'number' && b.type === 'number') {
      const mBefore = median(numericColumn(before, b.name));
      const mAfter = median(numericColumn(after, a.name));
      if (mBefore !== null && mAfter !== null && mBefore > 0 && mAfter > 0) {
        const ratio = mAfter / mBefore;
        if (ratio >= 100 || ratio <= 0.01) {
          changes.push({
            kind: 'distribution_changed',
            fieldBefore: b.name,
            fieldAfter: a.name,
            before: `median magnitude ${mBefore.toLocaleString('en-US')}`,
            after: `median magnitude ${mAfter.toLocaleString('en-US')}`,
            explanation: `Median magnitude of "${b.name}" moved by ×${ratio.toExponential(1)} — consistent with an undeclared unit change.`,
            ...impact,
            disposition: 'quarantine',
          });
        }
      }
    }
  }

  return changes;
}
