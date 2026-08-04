import type { ExceptionStatus, SeverityBand } from '../domain/types';

export function BandPill({ band }: { band: SeverityBand }) {
  return <span className={`pill ${band.toLowerCase()}`}>{band}</span>;
}

export function ScoreChip({ total, band }: { total: number; band: SeverityBand }) {
  return (
    <span className={`score-chip ${band.toLowerCase()}`} title={`Review priority ${total}/100`}>
      {total}
    </span>
  );
}

export const STATUS_LABELS: Record<ExceptionStatus, string> = {
  open: 'Open',
  resolved_corrected: 'Corrected',
  resolved_override: 'Override',
  rejected: 'Rejected',
  quarantined: 'Quarantined',
  reassigned: 'Reassigned',
  false_positive: 'False positive',
};

export function StatusPill({ status }: { status: ExceptionStatus }) {
  const cls =
    status === 'open' ? 'blocked' : status === 'reassigned' ? 'high' : status === 'quarantined' ? 'medium' : 'ok';
  return <span className={`pill ${cls}`}>{STATUS_LABELS[status]}</span>;
}
