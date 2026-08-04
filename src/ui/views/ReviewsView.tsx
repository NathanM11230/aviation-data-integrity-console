import type { PipelineRun } from '../../engine/pipeline';
import { isActionable } from '../../engine/pipeline';
import { useAppStore, actionLabel } from '../../state/store';
import { ruleDef } from '../../engine/rules';
import { BandPill } from '../common';
import { downloadText, fmtDateTime, toCsv } from '../format';
import { navigate } from '../App';

export function ReviewsView({ run }: { run: PipelineRun }) {
  const decisions = useAppStore((s) => s.decisions);
  const audit = useAppStore((s) => s.audit);
  const resetSession = useAppStore((s) => s.resetSession);
  const logExport = useAppStore((s) => s.logExport);

  const pending = run.items.filter(isActionable);

  const exportAudit = () => {
    downloadText(
      'audit-log.csv',
      toCsv(
        ['seq', 'at', 'actor', 'type', 'exception_id', 'message'],
        audit.map((a) => [a.seq, a.at, a.actor, a.type, a.exceptionId ?? '', a.message]),
      ),
    );
    logExport('audit', audit.length);
  };

  const exportDecisions = () => {
    downloadText(
      'decisions.csv',
      toCsv(
        ['at', 'reviewer', 'action', 'exception_id', 'reason', 'corrected_value', 'assignee'],
        decisions.map((d) => [d.at, d.reviewer, d.action, d.exceptionId, d.reason, d.correctedValue ?? '', d.assignee ?? '']),
      ),
    );
    logExport('decision', decisions.length);
  };

  return (
    <section aria-label="Reviews and audit">
      <div className="page-head">
        <div>
          <h1>Reviews &amp; Audit</h1>
          <p className="subtitle">
            Pending reviews, completed decisions, and the append-only audit log. Decisions are never edited or deleted;
            corrections preserve the original values.
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={exportDecisions} disabled={decisions.length === 0}>
            Export decisions
          </button>
          <button className="btn" onClick={exportAudit}>
            Export audit log
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('Reset the session? Decisions, corrections, quarantines, and the audit log will be cleared.')) {
                resetSession();
              }
            }}
          >
            Reset session
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Pending review</h2>
          <span className="hint">{pending.length} open in the active dataset</span>
        </div>
        {pending.length === 0 ? (
          <div className="empty">Nothing pending. All exceptions in the active dataset carry a decision.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Priority</th>
                  <th>Band</th>
                  <th>Rule</th>
                  <th>Assignee</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((i) => (
                  <tr key={i.exception.id}>
                    <td className="num">{i.score.total}</td>
                    <td>
                      <BandPill band={i.score.band} />
                    </td>
                    <td>
                      {ruleDef(i.exception.ruleId).name}
                      <span className="cell-sub mono">{i.exception.id}</span>
                    </td>
                    <td>{i.assignee ?? 'Unassigned'}</td>
                    <td>
                      <button className="btn" onClick={() => navigate(`queue/${encodeURIComponent(i.exception.id)}`)}>
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

      <div className="panel">
        <div className="panel-head">
          <h2>Decision log</h2>
          <span className="hint">{decisions.length} recorded across all datasets</span>
        </div>
        {decisions.length === 0 ? (
          <div className="empty">No decisions recorded yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Reviewer</th>
                  <th>Action</th>
                  <th>Exception</th>
                  <th>Reason</th>
                  <th>Corrected value / assignee</th>
                </tr>
              </thead>
              <tbody>
                {decisions
                  .slice()
                  .reverse()
                  .map((d) => (
                    <tr key={d.id}>
                      <td className="nowrap">{fmtDateTime(d.at)}</td>
                      <td>{d.reviewer}</td>
                      <td>{actionLabel(d.action)}</td>
                      <td className="mono">{d.exceptionId}</td>
                      <td style={{ maxWidth: 320 }}>{d.reason}</td>
                      <td>{d.correctedValue ?? d.assignee ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Audit log</h2>
          <span className="hint">Append-only · {audit.length} events · sequence numbers never reused</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Seq</th>
                <th>When</th>
                <th>Actor</th>
                <th>Type</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {audit
                .slice()
                .reverse()
                .map((a) => (
                  <tr key={a.id}>
                    <td className="num">{a.seq}</td>
                    <td className="nowrap">{fmtDateTime(a.at)}</td>
                    <td>{a.actor}</td>
                    <td>
                      <span className="pill neutral">{a.type}</span>
                    </td>
                    <td>{a.message}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
