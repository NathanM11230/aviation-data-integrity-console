import type { PipelineRun } from '../../engine/pipeline';
import { isActionable } from '../../engine/pipeline';
import type { EntityKind } from '../../domain/types';
import { FIELD_KEYS } from '../../domain/types';
import { AIRCRAFT, COUNTERPARTIES, LEASES, LOANS, MODELS, PORTFOLIOS, REPORTS, SOURCE_SYSTEMS } from '../../data/portfolio';
import { SEC_FILING_REFERENCES } from '../../data/secData';
import { lineageOf, type LineageNode } from '../../engine/dependencies';
import { ruleDef } from '../../engine/rules';
import { navigate } from '../App';
import { BandPill } from '../common';

const KINDS: { kind: EntityKind; label: string }[] = [
  { kind: 'counterparty', label: 'Counterparty' },
  { kind: 'aircraft', label: 'Aircraft' },
  { kind: 'lease', label: 'Lease' },
  { kind: 'loan', label: 'Loan' },
  { kind: 'portfolio', label: 'Portfolio' },
  { kind: 'field', label: 'Field' },
  { kind: 'model', label: 'Model' },
  { kind: 'report', label: 'Report' },
  { kind: 'source', label: 'Source' },
];

function optionsFor(kind: EntityKind): { id: string; label: string }[] {
  switch (kind) {
    case 'counterparty':
      return COUNTERPARTIES.map((c) => ({ id: c.id, label: `${c.ticker} · ${c.name}` }));
    case 'aircraft':
      return AIRCRAFT.map((a) => ({ id: a.id, label: `${a.registration} ${a.model}` }));
    case 'lease':
      return LEASES.map((l) => ({ id: l.id, label: l.id }));
    case 'loan':
      return LOANS.map((l) => ({ id: l.id, label: l.id }));
    case 'portfolio':
      return PORTFOLIOS.map((p) => ({ id: p.id, label: p.name }));
    case 'field':
      return FIELD_KEYS.map((f) => ({ id: f, label: f }));
    case 'model':
      return MODELS.map((m) => ({ id: m.id, label: m.name }));
    case 'report':
      return REPORTS.map((r) => ({ id: r.id, label: r.name }));
    case 'source':
      return SOURCE_SYSTEMS.map((source) => ({ id: source.id, label: source.name }));
    default:
      return [];
  }
}

function Tree({ nodes }: { nodes: LineageNode[] }) {
  if (!nodes.length) return <p className="text-muted" style={{ fontSize: 12 }}>None.</p>;
  return (
    <ul className="tree">
      {nodes.map((n, i) => (
        <li key={`${n.entity.kind}-${n.entity.id}-${i}`}>
          <span className="rel">{n.relation}</span>
          {n.externalUrl ? (
            <a href={n.externalUrl} target="_blank" rel="noreferrer">
              {n.entity.label}
            </a>
          ) : (
            <button onClick={() => navigate(`lineage/${n.entity.kind}/${n.entity.id}`)}>
              {n.entity.label}
            </button>
          )}
          {n.children.length > 0 && <Tree nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}

export function LineageView({ run, kind, id }: { run: PipelineRun; kind: string | null; id: string | null }) {
  const activeKind = (KINDS.some((k) => k.kind === kind) ? kind : 'counterparty') as EntityKind;
  const options = optionsFor(activeKind);
  const activeId = id && options.some((o) => o.id === id) ? id : (options[0]?.id ?? '');
  const lineage = lineageOf(activeKind, activeId);

  // Open exceptions that touch the focused entity, to support investigation.
  const related = run.items.filter((item) => {
    if (!isActionable(item)) return false;
    if (activeKind === 'counterparty') {
      return item.exception.counterpartyId === activeId || item.exception.scope === 'feed';
    }
    if (activeKind === 'field') return item.exception.field === activeId;
    return item.impact.entities.some((e) => e.kind === activeKind && e.id === activeId);
  });

  return (
    <section aria-label="Data paths">
      <div className="page-head">
        <div>
          <h1>Data Paths</h1>
          <p className="subtitle">
            Trace where a value came from and which calculations or reports use it.
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => navigate('data/reports')}>Back to Data &amp; Reports</button>
        </div>
        <div className="filterbar" style={{ margin: 0 }}>
          <div className="filter">
            <label htmlFor="lineage-kind">Start with</label>
            <select
              id="lineage-kind"
              value={activeKind}
              onChange={(e) => {
                const k = e.target.value as EntityKind;
                navigate(`lineage/${k}/${optionsFor(k)[0]?.id ?? ''}`);
              }}
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter">
            <label htmlFor="lineage-entity">Item</label>
            <select
              id="lineage-entity"
              value={activeId}
              onChange={(e) => navigate(`lineage/${activeKind}/${e.target.value}`)}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {activeKind === 'source' && activeId === 'SRC-SEC' && (
        <div className="panel">
          <div className="panel-head">
            <h2>Primary filing evidence</h2>
            <span className="hint">Official SEC EDGAR pages</span>
          </div>
          <div className="panel-body">
            <p className="text-muted" style={{ marginTop: 0 }}>
              FY2025 sample financials are traceable to these public Form 10-K filings.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Counterparty</th>
                    <th>Accession</th>
                    <th>Filed</th>
                    <th>SEC filing</th>
                  </tr>
                </thead>
                <tbody>
                  {SEC_FILING_REFERENCES.map((filing) => (
                    <tr key={filing.accession}>
                      <td>{filing.ticker} / {filing.airline}</td>
                      <td className="mono">{filing.accession}</td>
                      <td>{filing.filed}</td>
                      <td>
                        <a href={filing.filingUrl} target="_blank" rel="noreferrer">
                          Open FY2025 10-K on SEC.gov
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {lineage && (
        <div className="panel">
          <div className="panel-head">
            <h2>Data path</h2>
            <span className="hint">Portfolio relationships are demonstration data</span>
          </div>
          <div className="panel-body">
            <div className="lineage-cols">
              <div>
                <p className="lineage-col-title">Where this data comes from</p>
                <Tree nodes={lineage.upstream} />
              </div>
              <div className="lineage-focus">
                <div className="kind">{lineage.focus.kind}</div>
                <div className="label">{lineage.focus.label}</div>
              </div>
              <div>
                <p className="lineage-col-title">What uses this data</p>
                <Tree nodes={lineage.downstream} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Issues connected to this item</h2>
          <span className="hint">{related.length} need review</span>
        </div>
        {related.length === 0 ? (
          <div className="empty">No open issues affect this item in the active scenario.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Priority</th>
                  <th>Band</th>
                  <th>Issue</th>
                  <th>Received</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {related.map((item) => (
                  <tr key={item.exception.id}>
                    <td className="num">{item.score.total}</td>
                    <td>
                      <BandPill band={item.score.band} />
                    </td>
                    <td>{ruleDef(item.exception.ruleId).name}</td>
                    <td>{item.exception.observed}</td>
                    <td>
                      <button
                        className="btn"
                        onClick={() => navigate(`queue/${encodeURIComponent(item.exception.id)}`)}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
