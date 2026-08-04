import type { PipelineRun } from '../../engine/pipeline';
import { isActionable } from '../../engine/pipeline';
import type { EntityKind } from '../../domain/types';
import { FIELD_KEYS } from '../../domain/types';
import { AIRCRAFT, COUNTERPARTIES, LEASES, LOANS, MODELS, PORTFOLIOS, REPORTS } from '../../data/portfolio';
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
          <button onClick={() => navigate(`lineage/${n.entity.kind}/${n.entity.id}`)}>
            {n.entity.label}
          </button>
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
    <section aria-label="Lineage and impact">
      <div className="page-head">
        <div>
          <h1>Lineage &amp; Impact</h1>
          <p className="subtitle">
            Start from any entity and trace upstream sources and downstream consumers. Select any node to refocus.
          </p>
        </div>
        <div className="filterbar" style={{ margin: 0 }}>
          <div className="filter">
            <label htmlFor="lineage-kind">Entity type</label>
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
            <label htmlFor="lineage-entity">Entity</label>
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

      {lineage && (
        <div className="panel">
          <div className="panel-head">
            <h2>Dependency tree</h2>
            <span className="hint">Synthetic relationships for demonstration</span>
          </div>
          <div className="panel-body">
            <div className="lineage-cols">
              <div>
                <p className="lineage-col-title">Upstream (where the data comes from)</p>
                <Tree nodes={lineage.upstream} />
              </div>
              <div className="lineage-focus">
                <div className="kind">{lineage.focus.kind}</div>
                <div className="label">{lineage.focus.label}</div>
              </div>
              <div>
                <p className="lineage-col-title">Downstream (what depends on it)</p>
                <Tree nodes={lineage.downstream} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Open exceptions touching this entity</h2>
          <span className="hint">{related.length} open</span>
        </div>
        {related.length === 0 ? (
          <div className="empty">No open exceptions affect this entity in the active dataset.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Priority</th>
                  <th>Band</th>
                  <th>Rule</th>
                  <th>Observed</th>
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
                        Investigate
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
