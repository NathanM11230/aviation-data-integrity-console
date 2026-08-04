import { useEffect, useState } from 'react';
import { useAppStore, selectRun, type DatasetId } from '../state/store';
import { isActionable } from '../engine/pipeline';
import { QueueView } from './views/QueueView';
import { LineageView } from './views/LineageView';
import { ReviewsView } from './views/ReviewsView';
import { DataReportsView } from './views/DataReportsView';

export function useHashRoute(): string[] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}

const NAV_ITEMS: { path: string; label: string }[] = [
  { path: 'queue', label: 'Review Queue' },
  { path: 'data', label: 'Data & Reports' },
  { path: 'history', label: 'Decision History' },
];

const LEGACY_ROUTES: Record<string, string> = {
  feeds: 'data/sources',
  portfolio: 'data/reports',
  reviews: 'history',
};

export default function App() {
  const segments = useHashRoute();
  const requestedView = segments[0] ?? 'queue';
  const view = requestedView === 'lineage' || NAV_ITEMS.some((item) => item.path === requestedView)
    ? requestedView
    : 'queue';
  const state = useAppStore();
  const run = selectRun(state);
  const openCount = run.items.filter(isActionable).length;

  useEffect(() => {
    document.title = 'Aviation Data Review | Nathan Mackey';
  }, []);

  useEffect(() => {
    const legacyTarget = LEGACY_ROUTES[requestedView];
    if (legacyTarget) navigate(legacyTarget);
    else if (requestedView !== view) navigate('queue');
  }, [requestedView, view]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">N</span>
          <div>
            <div className="brand-name">Aviation Data Review</div>
            <div className="brand-sub">Validate airline financial data before it reaches reports</div>
          </div>
        </div>
        <div className="topbar-right">
          <label htmlFor="dataset-select">Scenario</label>
          <select
            id="dataset-select"
            value={state.datasetId}
            onChange={(e) => state.selectDataset(e.target.value as DatasetId)}
          >
            <option value="clean">Clean sample</option>
            <option value="issues">Sample with issues</option>
            {state.importedFeed && <option value="imported">{state.importedFeed.label}</option>}
          </select>
          <label htmlFor="reviewer-input" className="reviewer-label">Reviewer</label>
          <input
            id="reviewer-input"
            aria-label="Reviewer name"
            value={state.reviewer}
            onChange={(e) => state.setReviewer(e.target.value)}
            size={10}
          />
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <nav className="nav" aria-label="Views">
            {NAV_ITEMS.map((item) => {
              const active = view === item.path || (item.path === 'data' && view === 'lineage');
              return (
                <a
                  key={item.path}
                  href={`#/${item.path}`}
                  className={active ? 'active' : ''}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                  {item.path === 'queue' && (
                    <span className={`count ${openCount === 0 ? 'none' : ''}`} title={`${openCount} issues to review`}>
                      {openCount}
                    </span>
                  )}
                </a>
              );
            })}
          </nav>
          <div className="sidebar-note">
            <strong>Demonstration scope</strong>
            Public airline filings with synthetic aircraft, leases, loans, and portfolios.
          </div>
        </aside>
        <main className="main">
          {view === 'queue' && <QueueView run={run} selectedId={segments[1] ?? null} />}
          {view === 'data' && <DataReportsView run={run} section={segments[1] ?? null} />}
          {view === 'lineage' && <LineageView run={run} kind={segments[1] ?? null} id={segments[2] ?? null} />}
          {view === 'history' && <ReviewsView run={run} />}
        </main>
      </div>
    </div>
  );
}
