import type { PipelineRun } from '../../engine/pipeline';
import { useAppStore, actionLabel } from '../../state/store';
import { downloadText, fmtDateTime, toCsv } from '../format';

export function ReviewsView(_: { run: PipelineRun }) {
  const decisions = useAppStore((s) => s.decisions);
  const audit = useAppStore((s) => s.audit);
  const resetSession = useAppStore((s) => s.resetSession);
  const logExport = useAppStore((s) => s.logExport);

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
    <section aria-label="Decision history">
      <div className="page-head">
        <div>
          <h1>Decision History</h1>
          <p className="subtitle">
            See who reviewed each issue, what they decided, and every system event created along the way.
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={exportDecisions} disabled={decisions.length === 0}>
            Download decisions
          </button>
          <button className="btn" onClick={exportAudit}>
            Download activity
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('Reset the session? Decisions, corrections, quarantines, and the audit log will be cleared.')) {
                resetSession();
              }
            }}
          >
            Clear demo history
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Reviewer decisions</h2>
          <span className="hint">{decisions.length} recorded across all scenarios</span>
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
          <h2>System activity</h2>
          <span className="hint">{audit.length} events, newest first</span>
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
