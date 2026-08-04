import type { FeedSchemaField, FeedVersion, RawValue, SourceRecord } from '../domain/types';

export interface CsvError {
  ok: false;
  errors: string[];
}

export interface CsvOk {
  ok: true;
  version: FeedVersion;
  warnings: string[];
}

export type CsvResult = CsvOk | CsvError;

/** RFC-4180-style parser: quoted fields, escaped quotes, CRLF tolerant. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const NUMERIC_RE = /^-?\$?[\d,]+(\.\d+)?$/;

/**
 * Parse an analyst-uploaded CSV into a feed version. Rigorously rejects
 * malformed input; the validation engine then takes over on content quality.
 */
export function csvToFeedVersion(text: string, fileName: string, receivedAt: string): CsvResult {
  if (text.trim() === '') return { ok: false, errors: ['The file is empty.'] };
  if (text.length > 2_000_000) return { ok: false, errors: ['The file exceeds the 2MB import limit.'] };

  const rows = parseCsvText(text);
  if (rows.length < 2) {
    return { ok: false, errors: ['The file needs a header row and at least one data row.'] };
  }

  const header = (rows[0] ?? []).map((h) => h.trim());
  const errors: string[] = [];
  if (header.some((h) => h === '')) errors.push('The header row contains an empty column name.');
  const dupes = header.filter((h, idx) => header.indexOf(h) !== idx);
  if (dupes.length) errors.push(`Duplicate column name(s): ${[...new Set(dupes)].join(', ')}.`);
  for (const required of ['ticker', 'period']) {
    if (!header.includes(required)) errors.push(`Missing required column "${required}".`);
  }

  const dataRows = rows.slice(1);
  dataRows.forEach((r, idx) => {
    if (r.length !== header.length) {
      errors.push(`Row ${idx + 2} has ${r.length} values but the header defines ${header.length} columns.`);
    }
  });
  if (dataRows.length > 500) errors.push('The file exceeds the 500-row import limit.');
  if (errors.length) return { ok: false, errors };

  const records: SourceRecord[] = dataRows.map((r, idx) => {
    const values: Record<string, RawValue> = {};
    header.forEach((h, col) => {
      const cell = (r[col] ?? '').trim();
      values[h] = cell === '' ? null : NUMERIC_RE.test(cell) && !['ticker', 'period', 'filed', 'currency', 'airline'].includes(h)
        ? Number(cell.replace(/[$,]/g, ''))
        : cell;
    });
    return { recordId: `R-CSV-${idx + 1}`, values };
  });

  const schema: FeedSchemaField[] = header.map((h) => {
    const cells = records.map((r) => r.values[h]);
    const nonEmpty = cells.filter((c) => c !== null);
    const allNumeric = nonEmpty.length > 0 && nonEmpty.every((c) => typeof c === 'number');
    const isDate = ['period', 'filed'].includes(h);
    return {
      name: h,
      type: isDate ? 'date' : allNumeric ? 'number' : 'string',
      nullable: nonEmpty.length !== cells.length,
      ...(allNumeric && !isDate ? { unit: 'USD' as const } : {}),
    };
  });

  const warnings: string[] = [];
  if (records.length === 0) warnings.push('No data rows were found.');

  return {
    ok: true,
    warnings,
    version: {
      id: `FV-CSV-${receivedAt.slice(0, 10)}`,
      label: `Imported: ${fileName}`,
      sourceSystemId: 'SRC-UPLOAD',
      receivedAt,
      schema,
      records,
      description: `Analyst CSV import of ${fileName} (${records.length} rows). Processed locally; never uploaded.`,
    },
  };
}
