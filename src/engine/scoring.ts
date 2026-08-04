import type {
  ImpactResult,
  ScoreBreakdown,
  ScoreFactor,
  SeverityBand,
  SourceSystem,
  ValidationException,
} from '../domain/types';
import { TOTAL_EXPOSURE_USD } from './dependencies';

/**
 * Review Priority Score — a deterministic 0..100 workflow priority.
 * NOT a credit rating or probability of default.
 *
 * Factor                     Max   Basis
 * -------------------------  ----  ------------------------------------------
 * Validation severity         25   critical 25 / high 18 / medium 10 / low 4
 * Financial materiality       20   banded USD delta or affected magnitude
 * Linked synthetic exposure   15   share of total portfolio exposure
 * Downstream dependencies     10   min(1, count / 20) × 10
 * Blocked required outputs    10   blocks a required model or report
 * Propagation                 10   feed-wide 10 / counterparty 6 / record 2
 * Data freshness              5    stale or off-cycle period
 * Source confidence           5    (1 − source confidence) × 5
 *
 * Bands: Critical ≥ 65, High ≥ 45, Medium ≥ 30, Low < 30.
 */

const SEVERITY_POINTS = { critical: 25, high: 18, medium: 10, low: 4 } as const;

export function bandFor(total: number): SeverityBand {
  if (total >= 65) return 'Critical';
  if (total >= 45) return 'High';
  if (total >= 30) return 'Medium';
  return 'Low';
}

function materialityPoints(usd: number | null): { points: number; input: string } {
  if (usd === null) return { points: 0, input: 'not quantifiable' };
  if (usd >= 250_000_000) return { points: 20, input: usdLabel(usd) + ' (≥ $250M)' };
  if (usd >= 50_000_000) return { points: 15, input: usdLabel(usd) + ' (≥ $50M)' };
  if (usd >= 10_000_000) return { points: 10, input: usdLabel(usd) + ' (≥ $10M)' };
  if (usd >= 1_000_000) return { points: 5, input: usdLabel(usd) + ' (≥ $1M)' };
  if (usd > 0) return { points: 2, input: usdLabel(usd) };
  return { points: 0, input: 'no measured delta' };
}

function usdLabel(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  return `$${abs.toLocaleString('en-US')}`;
}

/**
 * Schema-level structural findings (rename/unmapped/broken mapping) change no
 * values, so magnitude-based materiality does not apply to them.
 */
const STRUCTURAL_RULES = new Set([
  'schema_field_renamed',
  'schema_field_removed',
  'schema_field_type_changed',
  'unmapped_field',
  'broken_dependency',
]);

export function scoreException(
  ex: ValidationException,
  impact: ImpactResult,
  source: SourceSystem,
): ScoreBreakdown {
  const factors: ScoreFactor[] = [];

  const sev = SEVERITY_POINTS[ex.severity];
  factors.push({
    key: 'severity',
    label: 'Validation severity',
    input: ex.severity,
    maxPoints: 25,
    points: sev,
    rationale: `Rule "${ex.ruleId}" fired at ${ex.severity} severity.`,
  });

  const mat = STRUCTURAL_RULES.has(ex.ruleId)
    ? { points: 0, input: 'structural finding — no value change' }
    : materialityPoints(ex.materialityUsd);
  factors.push({
    key: 'materiality',
    label: 'Financial materiality',
    input: mat.input,
    maxPoints: 20,
    points: mat.points,
    rationale:
      ex.materialityRatio !== null
        ? `Delta is ${(ex.materialityRatio * 100).toFixed(2)}% of the comparison value.`
        : 'Measured as the USD magnitude the issue puts in doubt.',
  });

  const exposureShare = TOTAL_EXPOSURE_USD > 0 ? impact.exposureUsd / TOTAL_EXPOSURE_USD : 0;
  const exposurePts = Math.round(exposureShare * 15);
  factors.push({
    key: 'exposure',
    label: 'Linked synthetic exposure',
    input: `${usdLabel(impact.exposureUsd)} of ${usdLabel(TOTAL_EXPOSURE_USD)}`,
    maxPoints: 15,
    points: exposurePts,
    rationale: `${(exposureShare * 100).toFixed(0)}% of total modeled exposure is linked to the affected counterpart${ex.counterpartyId ? 'y' : 'ies'}.`,
  });

  const depPts = Math.round(Math.min(1, impact.dependencyCount / 20) * 10);
  factors.push({
    key: 'dependencies',
    label: 'Downstream dependencies',
    input: `${impact.dependencyCount} dependent entities`,
    maxPoints: 10,
    points: depPts,
    rationale: `${impact.models.length} models and ${impact.reports.length} reports consume the affected value(s).`,
  });

  const blocksRequired =
    ex.blocking &&
    (impact.models.some((m) => m.required) || impact.reports.some((r) => r.required));
  const blockPts = blocksRequired ? 10 : ex.blocking ? 6 : 0;
  factors.push({
    key: 'blocked',
    label: 'Blocked required outputs',
    input: ex.blocking
      ? blocksRequired
        ? 'blocks a required model or report'
        : 'blocks non-required outputs'
      : 'does not block publication',
    maxPoints: 10,
    points: blockPts,
    rationale: ex.blocking
      ? `Publication of ${impact.reports.filter((r) => r.required).map((r) => r.name).join(', ') || 'dependent outputs'} is held until resolution.`
      : 'The control reports the issue without holding publication.',
  });

  const propPts = ex.scope === 'feed' ? 10 : ex.scope === 'counterparty' ? 6 : 2;
  factors.push({
    key: 'propagation',
    label: 'Propagation',
    input: ex.scope === 'feed' ? 'entire feed' : ex.scope === 'counterparty' ? 'whole counterparty' : 'single record',
    maxPoints: 10,
    points: propPts,
    rationale:
      ex.scope === 'feed'
        ? 'The issue affects every record in the incoming version.'
        : ex.scope === 'counterparty'
          ? 'Every value for the counterparty is affected.'
          : 'The issue is contained to one record and field.',
  });

  const fresh = ex.ruleId === 'stale_data' || ex.ruleId === 'unexpected_period' ? 5 : 0;
  factors.push({
    key: 'freshness',
    label: 'Data freshness',
    input: fresh ? 'stale or off-cycle period' : 'current period',
    maxPoints: 5,
    points: fresh,
    rationale: fresh
      ? 'The submission carries an outdated or off-cycle period.'
      : 'The submission is for the current reporting cycle.',
  });

  const confPts = Math.round((1 - source.confidence) * 5);
  factors.push({
    key: 'source',
    label: 'Source confidence',
    input: `${source.name} (${(source.confidence * 100).toFixed(0)}% confidence)`,
    maxPoints: 5,
    points: confPts,
    rationale: 'Lower-confidence sources earn additional review priority.',
  });

  const total = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  return { total, band: bandFor(total), factors };
}
