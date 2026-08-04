import { useMemo, useRef, useState } from 'react';
import type { PipelineRun, QueueItem } from '../../engine/pipeline';
import { isActionable } from '../../engine/pipeline';
import { useAppStore } from '../../state/store';
import { COUNTERPARTIES, MODELS } from '../../data/portfolio';
import { BandPill, ScoreChip, StatusPill, STATUS_LABELS } from '../common';
import { ageFrom, downloadText, fmtMoney, toCsv } from '../format';
import { navigate } from '../App';
import { InvestigationPanel } from './InvestigationPanel';
import { ruleDef } from '../../engine/rules';

type SortKey = 'score' | 'exposure' | 'age';

export function QueueView({ run, selectedId }: { run: PipelineRun; selectedId: string | null }) {
  const importCsv = useAppStore((s) => s.importCsv);
  const importError = useAppStore((s) => s.importError);
  const clearImportError = useAppStore((s) => s.clearImportError);
  const logExport = useAppStore((s) => s.logExport);
  const fileRef = useRef<HTMLInputElement>(null);

  const [band, setBand] = useState('all');
  const [status, setStatus] = useState('all');
  const [cp, setCp] = useState('all');
  const [model, setModel] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDesc, setSortDesc] = useState(true);

  const decodedSelected = selectedId ? safeDecodeURIComponent(selectedId) : null;
  const selected = run.items.find((i) => i.exception.id === decodedSelected) ?? null;
  // With the investigation panel open the queue becomes a scannable index:
  // the dropped columns are all restated in the panel itself.
  const compact = selected !== null;

  const filtered = useMemo(() => {
    let items = run.items;
    if (band !== 'all') items = items.filter((i) => i.score.band === band);
    if (status !== 'all') items = items.filter((i) => i.status === status);
    if (cp !== 'all') {
      items = items.filter((i) => {
        if (cp === 'feed') return i.exception.scope === 'feed';
        if (cp === 'unlinked') return i.exception.counterpartyId === null && i.exception.scope !== 'feed';
        return i.exception.counterpartyId === cp;
      });
    }
    if (model !== 'all') items = items.filter((i) => i.impact.models.some((m) => m.id === model));
    const dir = sortDesc ? -1 : 1;
    return [...items].sort((a, b) => {
      if (sortKey === 'exposure') return dir * (a.impact.exposureUsd - b.impact.exposureUsd);
      if (sortKey === 'age') return 0; // exceptions share the feed's received time
      return dir * (a.score.total - b.score.total);
    });
  }, [run.items, band, status, cp, model, sortKey, sortDesc]);

  const openItems = run.items.filter(isActionable);
  const bandCount = (b: string) => openItems.filter((i) => i.score.band === b).length;
  const blockedReports = run.publication.filter((p) => !p.eligible);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const exportExceptions = () => {
    const csv = toCsv(
      ['exception_id', 'rule', 'severity', 'band', 'score', 'counterparty', 'field', 'observed', 'exposure_usd', 'dependencies', 'status', 'version'],
      run.items.map((i) => [
        i.exception.id,
        i.exception.ruleId,
        i.exception.severity,
        i.score.band,
        i.score.total,
        cpLabel(i),
        i.exception.field ?? i.exception.incomingField ?? '',
        i.exception.observed,
        i.impact.exposureUsd,
        i.impact.dependencyCount,
        STATUS_LABELS[i.status],
        i.exception.versionId,
      ]),
    );
    downloadText('exceptions.csv', csv);
    logExport('exception', run.items.length);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    importCsv(await file.text(), file.name);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section aria-label="Decision Risk Queue">
      <div className="page-head">
        <div>
          <h1>Decision Risk Queue</h1>
          <p className="subtitle">
            Exceptions from {run.version.label}, ranked by potential decision impact — not just technical severity.
          </p>
        </div>
        <div className="actions">
          <label className="btn file-btn">
            Import CSV
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              aria-label="Import CSV file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          <button className="btn" onClick={exportExceptions} disabled={run.items.length === 0}>
            Export exceptions
          </button>
        </div>
      </div>

      {importError && (
        <div className="banner error" role="alert">
          <strong>CSV rejected:</strong>
          <ul>
            {importError.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <button className="btn" style={{ marginTop: 6 }} onClick={clearImportError}>
            Dismiss
          </button>
        </div>
      )}

      <div className="summary-strip" role="group" aria-label="Queue summary">
        <div className="summary-cell">
          <div className="k">Open</div>
          <div className={`v ${openItems.length ? 'warn' : 'good'}`}>{openItems.length}</div>
        </div>
        <div className="summary-cell">
          <div className="k">Critical</div>
          <div className={`v ${bandCount('Critical') ? 'critical' : ''}`}>{bandCount('Critical')}</div>
        </div>
        <div className="summary-cell">
          <div className="k">High</div>
          <div className={`v ${bandCount('High') ? 'warn' : ''}`}>{bandCount('High')}</div>
        </div>
        <div className="summary-cell">
          <div className="k">Medium / Low</div>
          <div className="v">{bandCount('Medium') + bandCount('Low')}</div>
        </div>
        <div className="summary-cell">
          <div className="k">Blocked reports</div>
          <div className={`v ${blockedReports.length ? 'critical' : 'good'}`}>
            {blockedReports.length}/{run.publication.length}
          </div>
        </div>
        <div className="summary-cell">
          <div className="k">Records</div>
          <div className="v">{run.norm.records.length}</div>
        </div>
      </div>

      <div className="filterbar">
        <div className="filter">
          <label htmlFor="f-band">Severity band</label>
          <select id="f-band" value={band} onChange={(e) => setBand(e.target.value)}>
            <option value="all">All bands</option>
            {['Critical', 'High', 'Medium', 'Low'].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="filter">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="filter">
          <label htmlFor="f-cp">Counterparty</label>
          <select id="f-cp" value={cp} onChange={(e) => setCp(e.target.value)}>
            <option value="all">All</option>
            {COUNTERPARTIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ticker}
              </option>
            ))}
            <option value="feed">Feed-wide</option>
            <option value="unlinked">Unlinked records</option>
          </select>
        </div>
        <div className="filter">
          <label htmlFor="f-model">Affected model</label>
          <select id="f-model" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="all">All models</option>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`queue-layout ${selected ? 'with-panel' : ''}`}>
        <div className="panel">
          <div className="panel-head">
            <h2>Exceptions</h2>
            <span className="hint">
              {filtered.length} of {run.items.length} shown · select a row to investigate
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sortable num" aria-sort={sortKey === 'score' ? (sortDesc ? 'descending' : 'ascending') : undefined}>
                    <button type="button" className="sort-button" onClick={() => onSort('score')}>
                    Priority {sortKey === 'score' ? (sortDesc ? '▾' : '▴') : ''}
                    </button>
                  </th>
                  <th>Band</th>
                  <th>Counterparty</th>
                  <th>Problem</th>
                  {!compact && (
                    <>
                      <th className="sortable num" aria-sort={sortKey === 'exposure' ? (sortDesc ? 'descending' : 'ascending') : undefined}>
                        <button type="button" className="sort-button" onClick={() => onSort('exposure')}>
                        Exposure {sortKey === 'exposure' ? (sortDesc ? '▾' : '▴') : ''}
                        </button>
                      </th>
                      <th className="num">Deps</th>
                      <th className="num">Blocks</th>
                      <th>Age</th>
                    </>
                  )}
                  <th>Status</th>
                  {!compact && <th>Reviewer</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={compact ? 5 : 10} className="empty">
                      {run.items.length === 0
                        ? 'No exceptions. Every blocking control passes and all reports are eligible for publication.'
                        : 'No exceptions match the current filters.'}
                    </td>
                  </tr>
                )}
                {filtered.map((item) => (
                  <QueueRow
                    key={item.exception.id}
                    item={item}
                    selected={item.exception.id === decodedSelected}
                    receivedAt={run.version.receivedAt}
                    compact={compact}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {selected && <InvestigationPanel item={selected} run={run} onClose={() => navigate('queue')} />}
      </div>
    </section>
  );
}

function cpLabel(item: QueueItem): string {
  if (!item.exception.counterpartyId) {
    return item.exception.scope === 'feed' ? 'Feed-wide' : 'Unlinked record';
  }
  return COUNTERPARTIES.find((c) => c.id === item.exception.counterpartyId)?.ticker ?? item.exception.counterpartyId;
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function QueueRow({
  item,
  selected,
  receivedAt,
  compact,
}: {
  item: QueueItem;
  selected: boolean;
  receivedAt: string;
  compact: boolean;
}) {
  const ex = item.exception;
  const blocks = ex.blocking && isActionable(item) ? item.impact.reports.length : 0;
  const lastDecision = item.decisions[item.decisions.length - 1];
  return (
    <tr
      className={`clickable ${selected ? 'selected' : ''}`}
      tabIndex={0}
      onClick={() => navigate(`queue/${encodeURIComponent(ex.id)}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`queue/${encodeURIComponent(ex.id)}`);
        }
      }}
      aria-label={`Investigate ${ruleDef(ex.ruleId).name} for ${cpLabel(item)}`}
    >
      <td className="num">
        <ScoreChip total={item.score.total} band={item.score.band} />
      </td>
      <td>
        <BandPill band={item.score.band} />
      </td>
      <td>
        <strong>{cpLabel(item)}</strong>
      </td>
      <td>
        <strong>{ruleDef(ex.ruleId).name}</strong>
        <span className="cell-sub">
          {ex.field ?? ex.incomingField ?? 'record'} · {ex.observed.length > 60 ? `${ex.observed.slice(0, 57)}…` : ex.observed}
        </span>
      </td>
      {!compact && (
        <>
          <td className="num">{fmtMoney(item.impact.exposureUsd)}</td>
          <td className="num">{item.impact.dependencyCount}</td>
          <td className="num">
            {blocks ? <span className="pill blocked">{blocks}</span> : <span className="text-muted">0</span>}
          </td>
          <td className="nowrap">{ageFrom(receivedAt)}</td>
        </>
      )}
      <td>
        <StatusPill status={item.status} />
        {item.cleared && <span className="cell-sub">no longer detected</span>}
      </td>
      {!compact && <td>{item.assignee ?? lastDecision?.reviewer ?? '—'}</td>}
    </tr>
  );
}
