import { useMemo, useState } from 'react';
import type { PipelineRun } from '../../engine/pipeline';
import { useAppStore } from '../../state/store';
import { SAMPLE_FEEDS } from '../../data/feeds';
import { MODELS, REPORTS, SOURCE_SYSTEMS } from '../../data/portfolio';
import { detectDrift, type DriftChange, type DriftDisposition } from '../../engine/drift';
import { REQUIRED_FIELDS } from '../../domain/types';
import { fmtDateTime, ageFrom } from '../format';

const DISPOSITION_LABEL: Record<DriftDisposition, string> = {
  proceed: 'May proceed',
  review: 'Requires review',
  quarantine: 'Quarantine',
};

function dispositionClass(d: DriftDisposition): string {
  return d === 'proceed' ? 'ok' : d === 'review' ? 'high' : 'blocked';
}

export function FeedsView({ run, embedded = false }: { run: PipelineRun; embedded?: boolean }) {
  const importedFeed = useAppStore((s) => s.importedFeed);
  const quarantined = useAppStore((s) => s.quarantinedRecordIds);
  const feeds = useMemo(
    () => (importedFeed ? [...SAMPLE_FEEDS, importedFeed] : [...SAMPLE_FEEDS]),
    [importedFeed],
  );

  const [beforeId, setBeforeId] = useState(feeds[0]?.id ?? '');
  const [afterId, setAfterId] = useState(feeds[1]?.id ?? '');
  const before = feeds.find((f) => f.id === beforeId) ?? feeds[0];
  const after = feeds.find((f) => f.id === afterId) ?? feeds[1];
  const drift: DriftChange[] = useMemo(
    () => (before && after && before.id !== after.id ? detectDrift(before, after) : []),
    [before, after],
  );

  const worst: DriftDisposition = drift.some((d) => d.disposition === 'quarantine')
    ? 'quarantine'
    : drift.some((d) => d.disposition === 'review')
      ? 'review'
      : 'proceed';

  const mappedCount = run.norm.mapping.length;

  return (
    <section aria-label="Data sources">
      {!embedded && <div className="page-head">
        <div>
          <h1>Data Sources</h1>
          <p className="subtitle">
            Review loaded files, source freshness, and changes in incoming data structure.
          </p>
        </div>
      </div>}

      <div className="panel">
        <div className="panel-head">
          <h2>Loaded data sources</h2>
          <span className="hint">Processed locally in this demonstration</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Latest data</th>
                <th>Received</th>
                <th className="num">Records</th>
                <th>Fields recognized</th>
                <th className="num">Records held</th>
              </tr>
            </thead>
            <tbody>
              {SOURCE_SYSTEMS.map((s) => {
                const versions = feeds.filter((f) => f.sourceSystemId === s.id && f.records.length > 0);
                const latest = versions[versions.length - 1];
                const isActive = latest?.id === run.version.id;
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <span className="cell-sub mono">{s.id}</span>
                    </td>
                    <td>
                      {latest ? (
                        <>
                          {latest.label}
                          <span className="cell-sub mono">{latest.id}</span>
                        </>
                      ) : (
                        <span className="text-muted">none loaded</span>
                      )}
                    </td>
                    <td>{latest ? `${fmtDateTime(latest.receivedAt)} (${ageFrom(latest.receivedAt)} old)` : '—'}</td>
                    <td className="num">{latest?.records.length ?? 0}</td>
                    <td>
                      {isActive
                        ? `${mappedCount}/${REQUIRED_FIELDS.length} normalized fields`
                        : latest
                          ? 'evaluated on load'
                          : '—'}
                    </td>
                    <td className="num">
                      {isActive && quarantined.length ? (
                        <span className="pill medium">{quarantined.length}</span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
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
          <h2>Incoming data changes</h2>
          <div className="filterbar" style={{ margin: 0 }}>
            <div className="filter">
              <label htmlFor="drift-before">Compare from</label>
              <select id="drift-before" value={before?.id ?? ''} onChange={(e) => setBeforeId(e.target.value)}>
                {feeds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter">
              <label htmlFor="drift-after">Compare to</label>
              <select id="drift-after" value={after?.id ?? ''} onChange={(e) => setAfterId(e.target.value)}>
                {feeds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {before && after && before.id === after.id ? (
          <div className="empty">Select two different versions to compare.</div>
        ) : drift.length === 0 ? (
          <div className="empty">No schema or distribution changes detected between these versions.</div>
        ) : (
          <>
            <div className="panel-body" style={{ paddingBottom: 0 }}>
              <span className={`pill ${dispositionClass(worst)}`}>Overall: {DISPOSITION_LABEL[worst]}</span>{' '}
              <span className="text-muted" style={{ fontSize: 12 }}>
                {drift.length} change(s) detected between {before?.label} and {after?.label}
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Change</th>
                    <th>Previous definition</th>
                    <th>New definition</th>
                    <th>Explanation</th>
                    <th>Affected fields</th>
                    <th>Affected calculations / reports</th>
                    <th>Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {drift.map((c, i) => (
                    <tr key={i}>
                      <td>
                        <strong className="nowrap">{c.kind.replace(/_/g, ' ')}</strong>
                        <span className="cell-sub mono">{c.fieldBefore ?? c.fieldAfter}</span>
                      </td>
                      <td className="mono">{c.before}</td>
                      <td className="mono">{c.after}</td>
                      <td style={{ maxWidth: 280 }}>{c.explanation}</td>
                      <td>
                        {c.affectedMappings.length ? (
                          c.affectedMappings.map((m) => (
                            <div key={m} className="mono">
                              {m}
                            </div>
                          ))
                        ) : (
                          <span className="text-muted">none</span>
                        )}
                      </td>
                      <td>
                        {c.affectedModelIds.length || c.affectedReportIds.length ? (
                          <>
                            {c.affectedModelIds.map((id) => (
                              <div key={id}>{MODELS.find((m) => m.id === id)?.name ?? id}</div>
                            ))}
                            {c.affectedReportIds.map((id) => (
                              <div key={id} className="text-muted">
                                {REPORTS.find((r) => r.id === id)?.name ?? id}
                              </div>
                            ))}
                          </>
                        ) : (
                          <span className="text-muted">none</span>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${dispositionClass(c.disposition)}`}>{DISPOSITION_LABEL[c.disposition]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <p className="disclosure">
        Sample versions: the February baseline and March resubmission carry FY2025 SEC figures; the Q2 schema proposal
        exists only to demonstrate declared drift detection. Imported CSVs are compared against the February baseline
        schema.
      </p>
    </section>
  );
}
