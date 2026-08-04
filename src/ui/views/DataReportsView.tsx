import type { PipelineRun } from '../../engine/pipeline';
import { FeedsView } from './FeedsView';
import { PortfolioView } from './PortfolioView';

type DataSection = 'reports' | 'sources';

export function DataReportsView({ run, section }: { run: PipelineRun; section: string | null }) {
  const activeSection: DataSection = section === 'sources' ? 'sources' : 'reports';

  return (
    <section aria-label="Data and reports">
      <div className="page-head">
        <div>
          <h1>Data &amp; Reports</h1>
          <p className="subtitle">
            Check which reports are ready, what is holding them, and where the underlying data came from.
          </p>
        </div>
      </div>

      <nav className="view-tabs" aria-label="Data and reports sections">
        <a
          href="#/data/reports"
          className={activeSection === 'reports' ? 'active' : ''}
          aria-current={activeSection === 'reports' ? 'page' : undefined}
        >
          Report readiness
        </a>
        <a
          href="#/data/sources"
          className={activeSection === 'sources' ? 'active' : ''}
          aria-current={activeSection === 'sources' ? 'page' : undefined}
        >
          Data sources
        </a>
      </nav>

      {activeSection === 'reports' ? (
        <PortfolioView run={run} embedded />
      ) : (
        <FeedsView run={run} embedded />
      )}
    </section>
  );
}
