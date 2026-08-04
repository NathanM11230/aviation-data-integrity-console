import type { PipelineRun } from '../../engine/pipeline';
import { isActionable } from '../../engine/pipeline';
import { AIRCRAFT, COUNTERPARTIES, LEASES, LOANS, PORTFOLIOS } from '../../data/portfolio';
import { counterpartyExposureUsd } from '../../engine/dependencies';
import { fmtMoney } from '../format';
import { navigate } from '../App';

export function PortfolioView({ run }: { run: PipelineRun }) {
  const openItems = run.items.filter(isActionable);

  return (
    <section aria-label="Portfolio overview">
      <div className="page-head">
        <div>
          <h1>Portfolio</h1>
          <p className="subtitle">
            Publication eligibility and exposure affected by unresolved issues. Aircraft, leases, loans, and portfolios
            are synthetic demonstration data; counterparty financials are public SEC figures.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Publication eligibility</h2>
          <span className="hint">Reports are held while blocking exceptions stay open</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Cadence</th>
                <th>Models</th>
                <th>Status</th>
                <th className="num">Blocking exceptions</th>
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
                          {m?.blocked && (
                            <span className="pill blocked" style={{ marginLeft: 6 }}>
                              blocked
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </td>
                  <td>
                    {p.eligible ? (
                      <span className="pill ok">Eligible</span>
                    ) : (
                      <span className="pill blocked">Blocked</span>
                    )}
                  </td>
                  <td className="num">
                    {p.blockedBy.length ? (
                      <button
                        className="btn"
                        onClick={() => navigate(`queue/${encodeURIComponent(p.blockedBy[0] ?? '')}`)}
                        title="Open the first blocking exception"
                      >
                        {p.blockedBy.length} — investigate
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
          <h2>Counterparties</h2>
          <span className="hint">Open issues and linked synthetic exposure</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Counterparty</th>
                <th className="num">Open exceptions</th>
                <th className="num">Leases</th>
                <th className="num">Loans</th>
                <th className="num">Linked exposure</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {COUNTERPARTIES.map((c) => {
                const open = openItems.filter(
                  (i) => i.exception.counterpartyId === c.id || i.exception.counterpartyId === null,
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
                        Lineage
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
