import { useState } from 'react';
import type { QueueItem, PipelineRun } from '../../engine/pipeline';
import { isOpenStatus } from '../../engine/pipeline';
import type { ReviewAction } from '../../domain/types';
import { useAppStore, actionLabel } from '../../state/store';
import { COUNTERPARTIES, SOURCE_SYSTEMS } from '../../data/portfolio';
import { ruleDef } from '../../engine/rules';
import { BandPill, ScoreChip, StatusPill } from '../common';
import { fmtDateTime, fmtMoney } from '../format';
import { ruleDefinitionText } from './ruleHelp';

const OPEN_ACTIONS: ReviewAction[] = [
  'approve_corrected',
  'accept_override',
  'reject',
  'quarantine',
  'reassign',
  'false_positive',
];

export function InvestigationPanel({
  item,
  run,
  onClose,
}: {
  item: QueueItem;
  run: PipelineRun;
  onClose: () => void;
}) {
  const ex = item.exception;
  const def = ruleDef(ex.ruleId);
  const decide = useAppStore((s) => s.decide);
  const audit = useAppStore((s) => s.audit);
  const open = isOpenStatus(item.status);

  const [action, setAction] = useState<ReviewAction>(open ? 'approve_corrected' : 'reopen');
  const [reason, setReason] = useState('');
  const [correctedValue, setCorrectedValue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const source = SOURCE_SYSTEMS.find((s) => s.id === run.version.sourceSystemId);
  const cp = COUNTERPARTIES.find((c) => c.id === ex.counterpartyId);
  // Fall back to the feed as received so a quarantined or corrected record
  // still shows the evidence the finding was raised against.
  const record = ex.sourceRecordId
    ? (run.version.records.find((r) => r.recordId === ex.sourceRecordId) ??
       run.originalVersion.records.find((r) => r.recordId === ex.sourceRecordId))
    : null;
  const normalized = ex.field
    ? run.norm.records.find((r) => r.sourceRecordId === ex.sourceRecordId)?.fields[ex.field]
    : undefined;
  const relatedAudit = audit.filter((a) => a.exceptionId === ex.id);
  const availableActions = open ? OPEN_ACTIONS : (['reopen'] as ReviewAction[]);

  const submit = () => {
    const result = decide({
      exception: ex,
      action,
      reason,
      ...(action === 'approve_corrected' ? { correctedValue } : {}),
      ...(action === 'reassign' ? { assignee } : {}),
    });
    if (!result.ok) {
      setError(result.error);
      setConfirmation(null);
      return;
    }
    setError(null);
    setConfirmation(`${actionLabel(action)} recorded.`);
    setReason('');
    setCorrectedValue('');
    setAssignee('');
  };

  return (
    <div className="panel inv-panel" aria-label="Exception investigation">
      <div className="inv-head">
        <div>
          <h2>{def.name}</h2>
          <div className="inv-meta">
            <span className="mono">{ex.id}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ScoreChip total={item.score.total} band={item.score.band} />
          <BandPill band={item.score.band} />
          <button className="btn" onClick={onClose} aria-label="Close investigation panel">
            Close
          </button>
        </div>
      </div>

      {item.cleared && (
        <div className="inv-section">
          <div className="banner info" style={{ marginBottom: 0 }}>
            <strong>No longer detected.</strong> A review action changed the data this control runs against, so the
            finding no longer fires and it no longer blocks publication. The original evidence and decision history
            below are retained unchanged.
          </div>
        </div>
      )}

      <div className="inv-section">
        <h3>Problem</h3>
        <p className="statement">{ex.explanation}</p>
        <dl className="kv">
          <dt>Expected</dt>
          <dd>{ex.expected}</dd>
          <dt>Observed</dt>
          <dd>{ex.observed}</dd>
          <dt>Status</dt>
          <dd>
            <StatusPill status={item.status} />
            {item.assignee ? ` → ${item.assignee}` : ''}
          </dd>
        </dl>
      </div>

      <div className="inv-section">
        <h3>Source lineage</h3>
        <dl className="kv">
          <dt>Source system</dt>
          <dd>
            {source?.name ?? run.version.sourceSystemId}
            {source ? ` (${Math.round(source.confidence * 100)}% confidence)` : ''}
          </dd>
          <dt>Data version</dt>
          <dd className="mono">{ex.versionId}</dd>
          <dt>Source record</dt>
          <dd className="mono">{ex.sourceRecordId ?? 'feed-level finding'}</dd>
          <dt>Counterparty</dt>
          <dd>{cp ? `${cp.ticker} · ${cp.name}` : 'All (feed-wide)'}</dd>
          <dt>Field</dt>
          <dd>{ex.field ?? ex.incomingField ?? '—'}</dd>
          {record && ex.field && (
            <>
              <dt>Raw value</dt>
              <dd className="mono">{String(record.values[ex.field] ?? normalized?.raw ?? '∅')}</dd>
              <dt>Normalized value</dt>
              <dd className="mono">
                {normalized && typeof normalized.value === 'number'
                  ? `${normalized.value.toLocaleString('en-US')} (${fmtMoney(normalized.value)})`
                  : normalized
                    ? String(normalized.value ?? '∅')
                    : '∅'}
                {normalized?.coerced ? ' — coerced from formatted text' : ''}
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="inv-section">
        <h3>Why this priority — {item.score.total}/100</h3>
        {item.score.factors.map((f) => (
          <div key={f.key} className="factor-row">
            <div>
              <strong>{f.label}</strong>
              <span className="factor-input">
                {f.input} — {f.rationale}
              </span>
            </div>
            <div className="pts">
              {f.points}
              <span className="max">/{f.maxPoints}</span>
            </div>
          </div>
        ))}
        <p className="text-muted" style={{ fontSize: 11, marginBottom: 0 }}>
          Deterministic workflow priority (documented in the README) — not a credit rating.
        </p>
      </div>

      <div className="inv-section">
        <h3>Downstream impact — {fmtMoney(item.impact.exposureUsd)} modeled exposure</h3>
        <dl className="kv">
          <dt>Models</dt>
          <dd>
            {item.impact.models.map((m) => (
              <span key={m.id} style={{ marginRight: 6 }}>
                {m.name}
                {run.blocked.blockedModelIds.has(m.id) && ex.blocking && open ? (
                  <span className="pill blocked" style={{ marginLeft: 4 }}>
                    blocked
                  </span>
                ) : null}
              </span>
            ))}
          </dd>
          <dt>Reports</dt>
          <dd>
            {item.impact.reports.map((r) => (
              <span key={r.id} style={{ marginRight: 6 }}>
                {r.name}
                {!run.publication.find((p) => p.report.id === r.id)?.eligible ? (
                  <span className="pill blocked" style={{ marginLeft: 4 }}>
                    blocked
                  </span>
                ) : (
                  <span className="pill ok" style={{ marginLeft: 4 }}>
                    eligible
                  </span>
                )}
              </span>
            ))}
          </dd>
          <dt>Exposure basis</dt>
          <dd>
            {item.impact.leases.length} leases, {item.impact.loans.length} loans, {item.impact.aircraft.length} aircraft
            across {item.impact.portfolios.length} portfolio(s) — synthetic demonstration data
          </dd>
        </dl>
        <h3 style={{ marginTop: 8 }}>Dependency graph</h3>
        <div className="chips">
          {item.impact.entities.map((e) => (
            <a key={`${e.kind}-${e.id}`} className="chip" href={`#/lineage/${e.kind}/${e.id}`}>
              <span className="kind">{e.kind}</span> {e.label}
            </a>
          ))}
        </div>
      </div>

      <div className="inv-section">
        <h3>Recommended action</h3>
        <p className="statement">{ex.recommendedAction}</p>
        <p className="text-muted" style={{ fontSize: 11 }}>{ruleDefinitionText(ex.ruleId)}</p>
      </div>

      <div className="inv-section">
        <h3>Decision</h3>
        {confirmation && !error && (
          <div className="form-ok" role="status" style={{ marginBottom: 8 }}>
            {confirmation}
          </div>
        )}
        {item.cleared ? (
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            Closed by {item.decisions[item.decisions.length - 1]?.reviewer ?? 'a reviewer'}. No further action is
            available while the current data passes this control.
          </p>
        ) : (
        <div className="decision-form">
          <div>
            <label htmlFor="decision-action">Action</label>
            <select id="decision-action" value={action} onChange={(e) => setAction(e.target.value as ReviewAction)}>
              {availableActions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </select>
          </div>
          {action === 'approve_corrected' && (
            <div>
              <label htmlFor="decision-value">Corrected value</label>
              <input
                id="decision-value"
                value={correctedValue}
                onChange={(e) => setCorrectedValue(e.target.value)}
                placeholder={ex.field ? `Corrected ${ex.field}` : 'Corrected value'}
              />
            </div>
          )}
          {action === 'reassign' && (
            <div>
              <label htmlFor="decision-assignee">Assign to</label>
              <input
                id="decision-assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Specialist name"
              />
            </div>
          )}
          <div>
            <label htmlFor="decision-reason">Reason (required)</label>
            <textarea
              id="decision-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Documented rationale preserved in the append-only audit log"
            />
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div>
            <button className="btn primary" onClick={submit}>
              Record decision
            </button>
          </div>
        </div>
        )}
      </div>

      <div className="inv-section">
        <h3>Event history</h3>
        {item.decisions.length === 0 && relatedAudit.length === 0 && (
          <p className="text-muted" style={{ fontSize: 12 }}>
            No decisions yet. The exception was raised by the current validation run.
          </p>
        )}
        {relatedAudit
          .slice()
          .reverse()
          .map((a) => (
            <div key={a.id} className="history-item">
              <span className="history-when">
                #{a.seq} · {fmtDateTime(a.at)} · {a.actor}
              </span>
              <div>{a.message}</div>
            </div>
          ))}
      </div>
    </div>
  );
}
