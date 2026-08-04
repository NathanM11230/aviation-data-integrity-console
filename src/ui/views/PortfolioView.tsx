import type { PipelineRun } from '../../engine/pipeline';
import { isActionable } from '../../engine/pipeline';
import { AIRCRAFT, COUNTERPARTIES, LEASES, LOANS, PORTFOLIOS } from '../../data/portfolio';
import { counterpartyExposureUsd } from '../../engine/dependencies';
import { fmtMoney } from '../format';
import { navigate } from '../App';

export function PortfolioView({ run, embedded = false }: { run: PipelineRun; embedded?: boolean }) {
  const openItems = run.items.filter(isActionable);

  return (
    <section aria-label="Portfolio overview">
      {!embedded && <div className="page-head">
        <div>
          <h1>Data &amp; Reports</h1>
          <p className="subtitle">
            See which reports are ready and which data issues need to be resolved first.
          </p>
        </div>
      </div>}

      <div className="panel">
        <div className="panel-head">
          <h2>Report readiness</h2>
          <span className="hint">Reports stay on hold while important data issues remain open</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Schedule</th>
                <th>Uses</th>
                <th>Status</th>
                <th className="num">Issues holding report</th>
              </tr>
            </thead>
            <tbody>
              {run.publication.map((p) => (
                <tr key={p.report.id}>
                  <td>
                    <strong>{p.report.name}</strong>
                    {p.report.required && <span className="cell-sub">required output</span>}
                  </td>
                  <td>{p.report.cadence}</td>
                  <td>
                    {p.report.modelIds.map((id) => {
                      const m = run.models.find((x) => x.model.id === id);
                      return (
                        <div key={id}>
                          {m?.model.name ?? id}
                        </div>
                      );
                    })}
                  </td>
                  <td>
                    {p.eligible ? (
                      <span className="pill ok">Ready</span>
                    ) : (
                      <span className="pill blocked">On hold</span>
                    )}
                  </td>
                  <td className="num">
                    {p.blockedBy.length ? (
                      <button
                        className="btn"
                        onClick={() => navigate(`queue/${encodeURIComponent(p.blockedBy[0] ?? '')}`)}
                        title="Open the first issue holding this report"
                      >
                        Review {p.blockedBy.length}
                      </button>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Airlines in review</h2>
          <span className="hint">Issues requiring attention and linked demonstration exposure</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Airline</th>
                <th className="num">Issues to review</th>
                <th className="num">Leases</th>
                <th className="num">Loans</th>
                <th className="num">Linked portfolio exposure</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {COUNTERPARTIES.map((c) => {
                const open = openItems.filter(
                  (i) => i.exception.counterpartyId === c.id || i.exception.scope === 'feed',
                );
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.ticker}</strong> · {c.name}
                    </td>
                    <td className="num">
                      {open.length ? <span className="pill blocked">{open.length}</span> : <span className="text-muted">0</span>}
                    </td>
                    <td className="num">{LEASES.filter((l) => l.lesseeId === c.id).length}</td>
                    <td className="num">{LOANS.filter((l) => l.borrowerId === c.id).length}</td>
                    <td className="num">{fmtMoney(counterpartyExposureUsd(c.id))}</td>
                    <td>
                      <button className="btn" onClick={() => navigate(`lineage/counterparty/${c.id}`)}>
                        View data path
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Portfolios (synthetic)</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Portfolio</th>
                <th className="num">Leases</th>
                <th className="num">Loans</th>
                <th className="num">Aircraft value</th>
                <th className="num">Loan balance</th>
              </tr>
            </thead>
            <tbody>
              {PORTFOLIOS.map((p) => {
                const leases = LEASES.filter((l) => l.portfolioId === p.id);
                const loans = LOANS.filter((l) => l.portfolioId === p.id);
                const aircraftValue = leases.reduce(
                  (s, l) => s + (AIRCRAFT.find((a) => a.id === l.aircraftId)?.marketValueUsd ?? 0),
                  0,
                );
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <span className="cell-sub">{p.description}</span>
                    </td>
                    <td className="num">{leases.length}</td>
                    <td className="num">{loans.length}</td>
                    <td className="num">{fmtMoney(aircraftValue)}</td>
                    <td className="num">{fmtMoney(loans.reduce((s, l) => s + l.outstandingUsd, 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="disclosure">
        Synthetic-data disclosure: every aircraft, registration, serial number, lease, loan, portfolio, model, and
        report on this page is invented for demonstration. No exposure, valuation, or relationship shown here is real.
        Counterparty financial statements are public FY2025 SEC filings.
      </p>
    </section>
  );
}
