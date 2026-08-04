import { useEffect, useState } from 'react';
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

const ACTION_CHOICES: Record<ReviewAction, string> = {
  approve_corrected: 'Correct the value',
  accept_override: 'Approve with explanation',
  reject: 'Reject the incoming value',
  quarantine: 'Hold this source record',
  reassign: 'Assign to a specialist',
  false_positive: 'Mark as not an issue',
  reopen: 'Reopen this review',
};

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

  const canCorrect =
    ex.sourceRecordId !== null &&
    ex.field !== null &&
    run.originalVersion.schema.some((field) => field.name === ex.field);
  const canQuarantine = ex.sourceRecordId !== null;
  const openActions = OPEN_ACTIONS.filter(
    (candidate) =>
      (candidate !== 'approve_corrected' || canCorrect) &&
      (candidate !== 'quarantine' || canQuarantine),
  );
  const recommendsQuarantine = /\bquarantine\b/i.test(ex.recommendedAction);
  const defaultOpenAction: ReviewAction = recommendsQuarantine && canQuarantine
    ? 'quarantine'
    : canCorrect
      ? 'approve_corrected'
      : canQuarantine
        ? 'quarantine'
        : 'reject';
  const availableActions = item.cleared
    ? (canQuarantine ? (['reopen'] as ReviewAction[]) : [])
    : open
      ? openActions
      : (['reopen'] as ReviewAction[]);
  const defaultAction = item.cleared || !open ? 'reopen' : defaultOpenAction;

  const [action, setAction] = useState<ReviewAction>(defaultAction);
  const [reason, setReason] = useState('');
  const [correctedValue, setCorrectedValue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    setAction(defaultAction);
    setError(null);
  }, [defaultAction, ex.id]);

  useEffect(() => {
    setConfirmation(null);
  }, [ex.id]);

  const source = SOURCE_SYSTEMS.find((s) => s.id === run.version.sourceSystemId);
  const cp = COUNTERPARTIES.find((c) => c.id === ex.counterpartyId);
  const record = ex.sourceRecordId
    ? (run.version.records.find((r) => r.recordId === ex.sourceRecordId) ??
       run.originalVersion.records.find((r) => r.recordId === ex.sourceRecordId))
    : null;
  const normalized = ex.field
    ? run.norm.records.find((r) => r.sourceRecordId === ex.sourceRecordId)?.fields[ex.field]
    : undefined;
  const relatedAudit = audit.filter((a) => a.exceptionId === ex.id);

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
            {cp?.ticker ?? (ex.scope === 'feed' ? 'All records' : 'Unlinked record')} | {ex.field ?? ex.incomingField ?? 'record'}
          </div>
        </div>
        <div className="inv-head-actions">
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
            <strong>This issue is no longer detected.</strong> The original evidence and decision history remain available below.
          </div>
        </div>
      )}

      <div className="inv-section inv-primary">
        <h3>What happened</h3>
        <p className="statement">{ex.explanation}</p>
        <dl className="kv">
          <dt>Expected</dt>
          <dd>{ex.expected}</dd>
          <dt>Received</dt>
          <dd>{ex.observed}</dd>
          <dt>Review status</dt>
          <dd>
            <StatusPill status={item.status} />
            {item.assignee ? ` assigned to ${item.assignee}` : ''}
          </dd>
        </dl>
      </div>

      <div className="inv-section">
        <h3>Business impact</h3>
        <div className="impact-summary">
          <div>
            <span>Linked exposure</span>
            <strong>{fmtMoney(item.impact.exposureUsd)}</strong>
          </div>
          <div>
            <span>Reports affected</span>
            <strong>{item.impact.reports.length}</strong>
          </div>
          <div>
            <span>Calculations affected</span>
            <strong>{item.impact.models.length}</strong>
          </div>
        </div>
        <dl className="kv impact-list">
          <dt>Reports</dt>
          <dd>
            {item.impact.reports.length === 0 && <span className="text-muted">No report is affected.</span>}
            {item.impact.reports.map((report) => {
              const ready = run.publication.find((p) => p.report.id === report.id)?.eligible;
              return (
                <div key={report.id} className="impact-item">
                  {report.name}
                  <span className={`pill ${ready ? 'ok' : 'blocked'}`}>{ready ? 'ready' : 'on hold'}</span>
                </div>
              );
            })}
          </dd>
          <dt>Calculations</dt>
          <dd>{item.impact.models.map((model) => model.name).join(', ') || 'None'}</dd>
          <dt>Portfolio context</dt>
          <dd>
            {item.impact.leases.length} leases, {item.impact.loans.length} loans, and {item.impact.aircraft.length} aircraft
            in demonstration data
          </dd>
        </dl>
      </div>

      <div className="inv-section decision-section">
        <h3>Recommended next step</h3>
        <p className="statement">{ex.recommendedAction}</p>
        <p className="text-muted rule-note">{ruleDefinitionText(ex.ruleId)}</p>

        <h3 className="decision-heading">Record your decision</h3>
        {confirmation && !error && (
          <div className="form-ok" role="status">
            {confirmation}
          </div>
        )}
        {item.cleared && availableActions.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            Closed by {item.decisions[item.decisions.length - 1]?.reviewer ?? 'a reviewer'}. This feed-level issue no longer fires.
          </p>
        ) : (
          <div className="decision-form">
            {item.cleared && (
              <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                Reopening restores the original record and runs every check again.
              </p>
            )}
            <div>
              <label htmlFor="decision-action">Decision</label>
              <select id="decision-action" value={action} onChange={(e) => setAction(e.target.value as ReviewAction)}>
                {availableActions.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {ACTION_CHOICES[candidate]}
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
              <label htmlFor="decision-reason">Explanation (required)</label>
              <textarea
                id="decision-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the evidence and why this decision is appropriate"
              />
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div>
              <button className="btn primary" onClick={submit}>
                Save decision
              </button>
            </div>
          </div>
        )}
      </div>

      <details className="inv-details">
        <summary>Source evidence</summary>
        <div className="inv-details-body">
          <dl className="kv">
            <dt>Source</dt>
            <dd>{source?.name ?? run.version.sourceSystemId}</dd>
            <dt>Data version</dt>
            <dd className="mono">{ex.versionId}</dd>
            <dt>Source record</dt>
            <dd className="mono">{ex.sourceRecordId ?? 'feed-level issue'}</dd>
            <dt>Airline</dt>
            <dd>{cp ? `${cp.ticker} | ${cp.name}` : 'All records'}</dd>
            <dt>Field</dt>
            <dd>{ex.field ?? ex.incomingField ?? 'None'}</dd>
            {record && ex.field && (
              <>
                <dt>Raw value</dt>
                <dd className="mono">{String(record.values[ex.field] ?? normalized?.raw ?? 'empty')}</dd>
                <dt>Normalized value</dt>
                <dd className="mono">
                  {normalized && typeof normalized.value === 'number'
                    ? `${normalized.value.toLocaleString('en-US')} (${fmtMoney(normalized.value)})`
                    : normalized
                      ? String(normalized.value ?? 'empty')
                      : 'empty'}
                  {normalized?.coerced ? ' (converted from formatted text)' : ''}
                </dd>
              </>
            )}
          </dl>
        </div>
      </details>

      <details className="inv-details">
        <summary>How the risk score was calculated ({item.score.total}/100)</summary>
        <div className="inv-details-body">
          {item.score.factors.map((factor) => (
            <div key={factor.key} className="factor-row">
              <div>
                <strong>{factor.label}</strong>
                <span className="factor-input">{factor.input}: {factor.rationale}</span>
              </div>
              <div className="pts">
                {factor.points}<span className="max">/{factor.maxPoints}</span>
              </div>
            </div>
          ))}
          <p className="text-muted rule-note">Workflow priority only; this is not a credit rating.</p>
        </div>
      </details>

      <details className="inv-details">
        <summary>Technical data path</summary>
        <div className="inv-details-body">
          <p className="text-muted" style={{ marginTop: 0 }}>
            Open an item to trace where the value came from and what else depends on it.
          </p>
          <div className="chips">
            {item.impact.entities.map((entity) => (
              <a key={`${entity.kind}-${entity.id}`} className="chip" href={`#/lineage/${entity.kind}/${entity.id}`}>
                <span className="kind">{entity.kind}</span> {entity.label}
              </a>
            ))}
          </div>
        </div>
      </details>

      <details className="inv-details">
        <summary>Review history ({relatedAudit.length})</summary>
        <div className="inv-details-body">
          {item.decisions.length === 0 && relatedAudit.length === 0 && (
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
              No decisions yet. This issue was raised by the current validation run.
            </p>
          )}
          {relatedAudit.slice().reverse().map((event) => (
            <div key={event.id} className="history-item">
              <span className="history-when">#{event.seq} | {fmtDateTime(event.at)} | {event.actor}</span>
              <div>{event.message}</div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
