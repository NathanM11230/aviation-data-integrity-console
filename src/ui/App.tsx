import { useEffect, useState } from 'react';
import { useAppStore, selectRun, DATASET_LABELS, type DatasetId } from '../state/store';
import { isActionable } from '../engine/pipeline';
import { QueueView } from './views/QueueView';
import { FeedsView } from './views/FeedsView';
import { LineageView } from './views/LineageView';
import { ReviewsView } from './views/ReviewsView';
import { PortfolioView } from './views/PortfolioView';

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
  { path: 'queue', label: 'Decision Risk Queue' },
  { path: 'feeds', label: 'Data Feeds' },
  { path: 'lineage', label: 'Lineage & Impact' },
  { path: 'reviews', label: 'Reviews & Audit' },
  { path: 'portfolio', label: 'Portfolio' },
];

export default function App() {
  const segments = useHashRoute();
  const view = segments[0] ?? 'queue';
  const state = useAppStore();
  const run = selectRun(state);
  const openCount = run.items.filter(isActionable).length;

  useEffect(() => {
    document.title = 'Aviation Data Reliability Control Plane | Nathan Mackey';
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">N</span>
          <div>
            <div className="brand-name">Aviation Data Reliability Control Plane</div>
            <div className="brand-sub">Recruiting prototype — synthetic portfolio, public SEC data</div>
          </div>
        </div>
        <div className="topbar-right">
          <label htmlFor="dataset-select">Dataset</label>
          <select
            id="dataset-select"
            value={state.datasetId}
            onChange={(e) => state.selectDataset(e.target.value as DatasetId)}
          >
            <option value="clean">{DATASET_LABELS.clean}</option>
            <option value="issues">{DATASET_LABELS.issues}</option>
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
            {NAV_ITEMS.map((item) => (
              <a
                key={item.path}
                href={`#/${item.path}`}
                className={view === item.path ? 'active' : ''}
                aria-current={view === item.path ? 'page' : undefined}
              >
                {item.label}
                {item.path === 'queue' && (
                  <span className={`count ${openCount === 0 ? 'none' : ''}`} title={`${openCount} open exceptions`}>
                    {openCount}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <div className="sidebar-note">
            <strong>Nathan Mackey</strong>
            Finance + Computer Science
            <br />
            Case Western Reserve University
            <br />
            <br />
            Independent recruiting prototype. Aircraft, leases, loans, and portfolios are synthetic.
          </div>
        </aside>
        <main className="main">
          {view === 'queue' && <QueueView run={run} selectedId={segments[1] ?? null} />}
          {view === 'feeds' && <FeedsView run={run} />}
          {view === 'lineage' && <LineageView run={run} kind={segments[1] ?? null} id={segments[2] ?? null} />}
          {view === 'reviews' && <ReviewsView run={run} />}
          {view === 'portfolio' && <PortfolioView run={run} />}
        </main>
      </div>
    </div>
  );
}
