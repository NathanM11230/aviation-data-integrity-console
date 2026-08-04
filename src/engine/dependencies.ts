import type {
  AnalyticalModel,
  EntityRef,
  FieldKey,
  ImpactResult,
  Report,
  ValidationException,
} from '../domain/types';
import {
  AIRCRAFT,
  COUNTERPARTIES,
  LEASES,
  LOANS,
  MODELS,
  PORTFOLIOS,
  REPORTS,
} from '../data/portfolio';

export const TOTAL_EXPOSURE_USD =
  LEASES.reduce((s, l) => s + (AIRCRAFT.find((a) => a.id === l.aircraftId)?.marketValueUsd ?? 0), 0) +
  LOANS.reduce((s, l) => s + l.outstandingUsd, 0);

function ref(kind: EntityRef['kind'], id: string, label: string): EntityRef {
  return { kind, id, label };
}

export function counterpartyExposureUsd(counterpartyId: string): number {
  const leaseCollateral = LEASES.filter((l) => l.lesseeId === counterpartyId).reduce(
    (s, l) => s + (AIRCRAFT.find((a) => a.id === l.aircraftId)?.marketValueUsd ?? 0),
    0,
  );
  const loanBalance = LOANS.filter((l) => l.borrowerId === counterpartyId).reduce(
    (s, l) => s + l.outstandingUsd,
    0,
  );
  return leaseCollateral + loanBalance;
}

function modelsUsingField(field: FieldKey): AnalyticalModel[] {
  return MODELS.filter((m) => m.inputFields.includes(field));
}

function reportsUsingModels(models: readonly AnalyticalModel[]): Report[] {
  const ids = new Set(models.map((m) => m.id));
  return REPORTS.filter((r) => r.modelIds.some((id) => ids.has(id)));
}

/**
 * Field-specific failures only compromise models that consume that field,
 * even when the failure spans the whole feed. Cross-cutting failures such as
 * currency, period, or an unidentified feed-level problem still taint every
 * model because no model can safely isolate itself from them.
 */
function modelsAffectedByException(ex: ValidationException): AnalyticalModel[] {
  if (ex.field !== null) {
    const consumers = modelsUsingField(ex.field);
    if (consumers.length > 0) return consumers;
  }
  return [...MODELS];
}

/**
 * Downstream impact of a validation exception: which synthetic exposure,
 * models, and reports depend on the affected value(s).
 */
export function impactOfException(ex: ValidationException): ImpactResult {
  const affectedModels = modelsAffectedByException(ex);

  const affectedReports = reportsUsingModels(affectedModels);

  const linkedCounterparty = ex.counterpartyId
    ? COUNTERPARTIES.find((c) => c.id === ex.counterpartyId)
    : null;
  const counterpartyIds = linkedCounterparty
    ? [linkedCounterparty.id]
    : ex.scope === 'feed'
      ? COUNTERPARTIES.map((c) => c.id)
      : [];

  const leases = LEASES.filter((l) => counterpartyIds.includes(l.lesseeId));
  const loans = LOANS.filter((l) => counterpartyIds.includes(l.borrowerId));
  const aircraft = AIRCRAFT.filter((a) => leases.some((l) => l.aircraftId === a.id));
  const portfolioIds = new Set([...leases.map((l) => l.portfolioId), ...loans.map((l) => l.portfolioId)]);
  const portfolios = PORTFOLIOS.filter((p) => portfolioIds.has(p.id));

  const exposureUsd = linkedCounterparty
    ? counterpartyExposureUsd(linkedCounterparty.id)
    : ex.scope === 'feed'
      ? TOTAL_EXPOSURE_USD
      : 0;

  const entities: EntityRef[] = [
    ...counterpartyIds.map((id) => {
      const c = COUNTERPARTIES.find((x) => x.id === id);
      return ref('counterparty', id, c ? c.name : id);
    }),
    ...aircraft.map((a) => ref('aircraft', a.id, `${a.registration} ${a.model}`)),
    ...leases.map((l) => ref('lease', l.id, l.id)),
    ...loans.map((l) => ref('loan', l.id, l.id)),
    ...portfolios.map((p) => ref('portfolio', p.id, p.name)),
    ...affectedModels.map((m) => ref('model', m.id, m.name)),
    ...affectedReports.map((r) => ref('report', r.id, r.name)),
  ];

  return {
    entities,
    models: affectedModels,
    reports: affectedReports,
    aircraft,
    leases,
    loans,
    portfolios,
    exposureUsd,
    dependencyCount: entities.length - counterpartyIds.length, // strictly downstream
  };
}

// ---------------------------------------------------------------------------
// Blocked-output recalculation
// ---------------------------------------------------------------------------

export interface BlockedState {
  blockedModelIds: Set<string>;
  blockedReportIds: Set<string>;
  /** exceptionId lists per blocked output, for explainability. */
  blockingByModel: Map<string, string[]>;
  blockingByReport: Map<string, string[]>;
}

/**
 * A model is blocked while any OPEN blocking exception touches its inputs.
 * Corrected, overridden, quarantined, and false-positive findings release the
 * block. Rejection and reassignment keep it open until the bad value is no
 * longer part of the active data or an explicit override is recorded.
 */
export function recalculateBlocked(openBlocking: readonly ValidationException[]): BlockedState {
  const blockingByModel = new Map<string, string[]>();
  for (const ex of openBlocking) {
    const models = modelsAffectedByException(ex);
    for (const m of models) {
      const list = blockingByModel.get(m.id) ?? [];
      list.push(ex.id);
      blockingByModel.set(m.id, list);
    }
  }
  const blockedModelIds = new Set(blockingByModel.keys());
  const blockingByReport = new Map<string, string[]>();
  for (const r of REPORTS) {
    const ids = r.modelIds.filter((id) => blockedModelIds.has(id));
    if (ids.length) {
      blockingByReport.set(
        r.id,
        [...new Set(ids.flatMap((id) => blockingByModel.get(id) ?? []))],
      );
    }
  }
  return {
    blockedModelIds,
    blockedReportIds: new Set(blockingByReport.keys()),
    blockingByModel,
    blockingByReport,
  };
}

// ---------------------------------------------------------------------------
// Lineage traversal (upstream/downstream from any entity)
// ---------------------------------------------------------------------------

export interface LineageNode {
  entity: EntityRef;
  relation: string;
  children: LineageNode[];
}

export interface LineageResult {
  focus: EntityRef;
  upstream: LineageNode[];
  downstream: LineageNode[];
}

function node(entity: EntityRef, relation: string, children: LineageNode[] = []): LineageNode {
  return { entity, relation, children };
}

function counterpartyRef(id: string): EntityRef {
  const c = COUNTERPARTIES.find((x) => x.id === id);
  return ref('counterparty', id, c ? c.name : id);
}

function modelDownstream(m: AnalyticalModel): LineageNode[] {
  return reportsUsingModels([m]).map((r) => node(ref('report', r.id, r.name), 'feeds report'));
}

export function lineageOf(kind: EntityRef['kind'], id: string): LineageResult | null {
  switch (kind) {
    case 'counterparty': {
      const c = COUNTERPARTIES.find((x) => x.id === id);
      if (!c) return null;
      const leases = LEASES.filter((l) => l.lesseeId === id);
      const loans = LOANS.filter((l) => l.borrowerId === id);
      return {
        focus: counterpartyRef(id),
        upstream: [
          node(ref('source', 'SRC-SEC', 'SEC EDGAR company facts'), 'financials sourced from'),
        ],
        downstream: [
          ...leases.map((l) => {
            const a = AIRCRAFT.find((x) => x.id === l.aircraftId);
            return node(ref('lease', l.id, l.id), 'lessee on', [
              ...(a ? [node(ref('aircraft', a.id, `${a.registration} ${a.model}`), 'covers aircraft')] : []),
              node(ref('portfolio', l.portfolioId, PORTFOLIOS.find((p) => p.id === l.portfolioId)?.name ?? l.portfolioId), 'held in'),
            ]);
          }),
          ...loans.map((l) =>
            node(ref('loan', l.id, l.id), 'borrower on', [
              node(ref('portfolio', l.portfolioId, PORTFOLIOS.find((p) => p.id === l.portfolioId)?.name ?? l.portfolioId), 'held in'),
            ]),
          ),
          ...MODELS.map((m) => node(ref('model', m.id, m.name), 'scored by', modelDownstream(m))),
        ],
      };
    }
    case 'field': {
      // id format: "<FieldKey>" — field of the normalized schema.
      const models = modelsUsingField(id as FieldKey);
      return {
        focus: ref('field', id, id),
        upstream: [
          node(ref('source', 'SRC-SEC', 'SEC EDGAR company facts'), 'mapped from source concept'),
        ],
        downstream: models.map((m) => node(ref('model', m.id, m.name), 'input to', modelDownstream(m))),
      };
    }
    case 'aircraft': {
      const a = AIRCRAFT.find((x) => x.id === id);
      if (!a) return null;
      const lease = LEASES.find((l) => l.aircraftId === id);
      const loan = LOANS.find((l) => l.collateralAircraftIds.includes(id));
      return {
        focus: ref('aircraft', id, `${a.registration} ${a.model}`),
        upstream: lease ? [node(counterpartyRef(lease.lesseeId), 'operated by lessee')] : [],
        downstream: [
          ...(lease
            ? [
                node(ref('lease', lease.id, lease.id), 'on lease', [
                  node(ref('portfolio', lease.portfolioId, PORTFOLIOS.find((p) => p.id === lease.portfolioId)?.name ?? ''), 'held in'),
                ]),
              ]
            : []),
          ...(loan ? [node(ref('loan', loan.id, loan.id), 'collateral for')] : []),
        ],
      };
    }
    case 'lease': {
      const l = LEASES.find((x) => x.id === id);
      if (!l) return null;
      const a = AIRCRAFT.find((x) => x.id === l.aircraftId);
      return {
        focus: ref('lease', id, id),
        upstream: [
          node(counterpartyRef(l.lesseeId), 'lessee'),
          ...(a ? [node(ref('aircraft', a.id, `${a.registration} ${a.model}`), 'aircraft')] : []),
        ],
        downstream: [
          node(ref('portfolio', l.portfolioId, PORTFOLIOS.find((p) => p.id === l.portfolioId)?.name ?? ''), 'held in'),
          node(ref('model', 'MD-CASHFLOW', 'Lease Cash Flow Model'), 'projected by', modelDownstream(MODELS.find((m) => m.id === 'MD-CASHFLOW')!)),
        ],
      };
    }
    case 'loan': {
      const l = LOANS.find((x) => x.id === id);
      if (!l) return null;
      return {
        focus: ref('loan', id, id),
        upstream: [
          node(counterpartyRef(l.borrowerId), 'borrower'),
          ...l.collateralAircraftIds.map((aid) => {
            const a = AIRCRAFT.find((x) => x.id === aid);
            return node(ref('aircraft', aid, a ? `${a.registration} ${a.model}` : aid), 'collateral');
          }),
        ],
        downstream: [
          node(ref('portfolio', l.portfolioId, PORTFOLIOS.find((p) => p.id === l.portfolioId)?.name ?? ''), 'held in'),
          node(ref('model', 'MD-COLLATERAL', 'Collateral Coverage Model'), 'assessed by', modelDownstream(MODELS.find((m) => m.id === 'MD-COLLATERAL')!)),
        ],
      };
    }
    case 'portfolio': {
      const p = PORTFOLIOS.find((x) => x.id === id);
      if (!p) return null;
      const leases = LEASES.filter((l) => l.portfolioId === id);
      const loans = LOANS.filter((l) => l.portfolioId === id);
      return {
        focus: ref('portfolio', id, p.name),
        upstream: [
          ...leases.map((l) => node(ref('lease', l.id, l.id), 'holds')),
          ...loans.map((l) => node(ref('loan', l.id, l.id), 'holds')),
        ],
        downstream: REPORTS.map((r) => node(ref('report', r.id, r.name), 'reported in')),
      };
    }
    case 'model': {
      const m = MODELS.find((x) => x.id === id);
      if (!m) return null;
      return {
        focus: ref('model', id, m.name),
        upstream: m.inputFields.map((f) => node(ref('field', f, f), 'consumes field')),
        downstream: modelDownstream(m),
      };
    }
    case 'report': {
      const r = REPORTS.find((x) => x.id === id);
      if (!r) return null;
      return {
        focus: ref('report', id, r.name),
        upstream: r.modelIds.map((mid) => {
          const m = MODELS.find((x) => x.id === mid);
          return node(ref('model', mid, m ? m.name : mid), 'built from', m ? m.inputFields.map((f) => node(ref('field', f, f), 'consumes field')) : []);
        }),
        downstream: [],
      };
    }
    case 'source': {
      return {
        focus: ref('source', id, 'SEC EDGAR company facts'),
        upstream: [],
        downstream: COUNTERPARTIES.map((c) => node(counterpartyRef(c.id), 'supplies financials for')),
      };
    }
  }
}
