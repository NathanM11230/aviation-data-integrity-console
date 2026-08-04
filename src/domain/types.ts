/**
 * Domain model for the Aviation Data Reliability Control Plane.
 *
 * Every entity here is either (a) public SEC financial data, or (b) clearly
 * labeled synthetic portfolio structure used to demonstrate downstream impact.
 */

// ---------------------------------------------------------------------------
// Normalized financial schema
// ---------------------------------------------------------------------------

export const FIELD_KEYS = [
  'ticker',
  'airline',
  'period',
  'filed',
  'currency',
  'revenue',
  'operatingIncome',
  'netIncome',
  'operatingCashFlow',
  'cash',
  'currentAssets',
  'currentLiabilities',
  'assets',
  'liabilities',
  'equity',
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export const MONETARY_FIELDS: readonly FieldKey[] = [
  'revenue',
  'operatingIncome',
  'netIncome',
  'operatingCashFlow',
  'cash',
  'currentAssets',
  'currentLiabilities',
  'assets',
  'liabilities',
  'equity',
];

export const REQUIRED_FIELDS: readonly FieldKey[] = FIELD_KEYS;

// ---------------------------------------------------------------------------
// Portfolio entities (synthetic except Counterparty financials)
// ---------------------------------------------------------------------------

export interface Counterparty {
  id: string;
  ticker: string;
  name: string;
}

export interface Aircraft {
  id: string;
  /** Synthetic registration; not a real tail number assignment. */
  registration: string;
  model: string;
  msn: string;
  deliveryYear: number;
  marketValueUsd: number;
}

export interface Lease {
  id: string;
  aircraftId: string;
  lesseeId: string; // Counterparty id
  portfolioId: string;
  monthlyRentUsd: number;
  startDate: string;
  endDate: string;
}

export interface Loan {
  id: string;
  borrowerId: string; // Counterparty id
  portfolioId: string;
  outstandingUsd: number;
  collateralAircraftIds: string[];
  maturityDate: string;
}

export interface Portfolio {
  id: string;
  name: string;
  description: string;
}

export interface AnalyticalModel {
  id: string;
  name: string;
  description: string;
  /** Normalized fields consumed by the model. */
  inputFields: FieldKey[];
  /** Whether publication of dependent reports requires this model. */
  required: boolean;
}

export interface Report {
  id: string;
  name: string;
  cadence: 'weekly' | 'monthly' | 'quarterly';
  modelIds: string[];
  required: boolean;
}

// ---------------------------------------------------------------------------
// Sources, feeds, versions
// ---------------------------------------------------------------------------

export interface SourceSystem {
  id: string;
  name: string;
  kind: 'regulatory-filing' | 'file-upload' | 'internal';
  /** 0..1 — deterministic operator-assigned trust level, documented in README. */
  confidence: number;
}

export type FeedFieldType = 'number' | 'string' | 'date';

export interface FeedSchemaField {
  name: string;
  type: FeedFieldType;
  /** Unit declared by the feed for monetary fields. */
  unit?: 'USD' | 'USD_thousands';
  nullable: boolean;
  enumValues?: string[];
}

export type RawValue = string | number | null;

export interface SourceRecord {
  recordId: string;
  values: Record<string, RawValue>;
}

export interface FeedVersion {
  id: string;
  label: string;
  sourceSystemId: string;
  receivedAt: string; // ISO datetime
  schema: FeedSchemaField[];
  records: SourceRecord[];
  description: string;
}

/** Incoming feed field name -> normalized field key. */
export interface FieldMapping {
  incoming: string;
  normalized: FieldKey;
  transform: string;
}

// ---------------------------------------------------------------------------
// Normalization output
// ---------------------------------------------------------------------------

export interface NormalizedFieldValue {
  field: FieldKey;
  raw: RawValue;
  /** Parsed value after deterministic coercion; null when unusable. */
  value: string | number | null;
  /** True when the raw value needed cleanup (e.g. "5,942,000,000"). */
  coerced: boolean;
  sourceRecordId: string;
  versionId: string;
}

export interface NormalizedRecord {
  ticker: string;
  counterpartyId: string | null;
  sourceRecordId: string;
  versionId: string;
  fields: Partial<Record<FieldKey, NormalizedFieldValue>>;
  /** Incoming fields with no mapping to the normalized schema. */
  unmappedFields: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type RuleId =
  | 'missing_required_field'
  | 'invalid_type'
  | 'invalid_currency'
  | 'unexpected_unit_multiplier'
  | 'accounting_equation'
  | 'duplicate_source_record'
  | 'stale_data'
  | 'filing_before_period_end'
  | 'unexpected_period'
  | 'implausible_change'
  | 'schema_field_removed'
  | 'schema_field_renamed'
  | 'schema_field_type_changed'
  | 'schema_unit_changed'
  | 'unmapped_field'
  | 'broken_dependency';

export interface ValidationRuleDef {
  id: RuleId;
  name: string;
  severity: Severity;
  /** Whether an open exception from this rule blocks dependent publication. */
  blocking: boolean;
  description: string;
}

export interface ValidationException {
  /** Stable, deterministic id so review decisions survive re-runs. */
  id: string;
  ruleId: RuleId;
  severity: Severity;
  blocking: boolean;
  explanation: string;
  expected: string;
  observed: string;
  field: FieldKey | null;
  /** Raw incoming field name for schema-level findings. */
  incomingField: string | null;
  counterpartyId: string | null;
  sourceRecordId: string | null;
  versionId: string;
  recommendedAction: string;
  /** 'record' = one record; 'counterparty' = whole entity; 'feed' = every record. */
  scope: 'record' | 'counterparty' | 'feed';
  /** Numeric delta in USD when computable (drives materiality). */
  materialityUsd: number | null;
  /** Relative delta (0..1) when computable. */
  materialityRatio: number | null;
}

// ---------------------------------------------------------------------------
// Dependencies and impact
// ---------------------------------------------------------------------------

export type EntityKind =
  | 'field'
  | 'counterparty'
  | 'aircraft'
  | 'lease'
  | 'loan'
  | 'portfolio'
  | 'model'
  | 'report'
  | 'source';

export interface EntityRef {
  kind: EntityKind;
  id: string;
  label: string;
}

export interface ImpactResult {
  /** Everything downstream of the exception, deduplicated. */
  entities: EntityRef[];
  models: AnalyticalModel[];
  reports: Report[];
  aircraft: Aircraft[];
  leases: Lease[];
  loans: Loan[];
  portfolios: Portfolio[];
  /** Sum of linked synthetic lease collateral value + loan balances, USD. */
  exposureUsd: number;
  dependencyCount: number;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreFactor {
  key: string;
  label: string;
  /** Human-readable input to the factor, e.g. "$500.0M / 0.81% of assets". */
  input: string;
  maxPoints: number;
  points: number;
  rationale: string;
}

export type SeverityBand = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ScoreBreakdown {
  total: number; // 0..100
  band: SeverityBand;
  factors: ScoreFactor[];
}

// ---------------------------------------------------------------------------
// Review workflow and audit
// ---------------------------------------------------------------------------

export type ReviewAction =
  | 'approve_corrected'
  | 'accept_override'
  | 'reject'
  | 'quarantine'
  | 'reassign'
  | 'false_positive'
  | 'reopen';

export type ExceptionStatus =
  | 'open'
  | 'resolved_corrected'
  | 'resolved_override'
  | 'rejected'
  | 'quarantined'
  | 'reassigned'
  | 'false_positive';

export interface ReviewDecision {
  id: string;
  exceptionId: string;
  action: ReviewAction;
  reason: string;
  reviewer: string;
  assignee?: string;
  correctedValue?: string;
  at: string; // ISO datetime
}

export interface Correction {
  sourceRecordId: string;
  field: FieldKey;
  value: string | number;
  exceptionId: string;
}

export interface AuditEvent {
  id: string;
  seq: number;
  at: string;
  actor: string;
  type:
    | 'INGEST'
    | 'VALIDATE'
    | 'DECISION'
    | 'CORRECTION'
    | 'EXPORT'
    | 'IMPORT'
    | 'DATASET'
    | 'QUARANTINE'
    | 'PUBLISH';
  message: string;
  exceptionId?: string;
}

// ---------------------------------------------------------------------------
// Persistence boundary
// ---------------------------------------------------------------------------

/**
 * Serializable session state. Everything else (exceptions, scores, impact,
 * blocked outputs) is deterministically recomputed from feed data + decisions.
 */
export interface PersistedState {
  schemaVersion: 1;
  datasetId: string;
  reviewer: string;
  decisions: ReviewDecision[];
  corrections: Correction[];
  audit: AuditEvent[];
  quarantinedRecordIds: string[];
  importedFeed: FeedVersion | null;
}

/** Swappable persistence boundary: localStorage today, API later. */
export interface PersistenceAdapter {
  load(): PersistedState | null;
  save(state: PersistedState): void;
  clear(): void;
}
