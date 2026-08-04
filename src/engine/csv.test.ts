import { describe, expect, it } from 'vitest';
import { csvToFeedVersion, parseCsvText } from './csv';

const NOW = '2026-03-15T12:00:00Z';

describe('parseCsvText', () => {
  it('handles quoted fields, embedded commas, and escaped quotes', () => {
    const rows = parseCsvText('a,b\n"1,000","say ""hi"""\r\nplain,2');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1,000', 'say "hi"'],
      ['plain', '2'],
    ]);
  });

  it('ignores trailing blank lines', () => {
    expect(parseCsvText('a,b\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('csvToFeedVersion', () => {
  it('rejects an empty file', () => {
    const r = csvToFeedVersion('', 'x.csv', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('empty');
  });

  it('rejects a header-only file', () => {
    const r = csvToFeedVersion('ticker,period', 'x.csv', NOW);
    expect(r.ok).toBe(false);
  });

  it('rejects missing required columns', () => {
    const r = csvToFeedVersion('airline,revenue\nDelta,1', 'x.csv', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('"ticker"'))).toBe(true);
      expect(r.errors.some((e) => e.includes('"period"'))).toBe(true);
    }
  });

  it('rejects ragged rows with the offending row number', () => {
    const r = csvToFeedVersion('ticker,period,revenue\nUAL,2025-12-31\n', 'x.csv', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('Row 2');
  });

  it('rejects duplicate and empty column names', () => {
    const dup = csvToFeedVersion('ticker,period,revenue,revenue\nUAL,2025-12-31,1,2', 'x.csv', NOW);
    expect(dup.ok).toBe(false);
    const empty = csvToFeedVersion('ticker,period,\nUAL,2025-12-31,1', 'x.csv', NOW);
    expect(empty.ok).toBe(false);
  });

  it('rejects malformed quoted fields instead of silently reshaping the data', () => {
    const unclosed = csvToFeedVersion('ticker,period\n"UAL,2025-12-31', 'x.csv', NOW);
    expect(unclosed.ok).toBe(false);
    if (!unclosed.ok) expect(unclosed.errors[0]).toContain('unclosed');

    const trailing = csvToFeedVersion('ticker,period\n"UAL"oops,2025-12-31', 'x.csv', NOW);
    expect(trailing.ok).toBe(false);
    if (!trailing.ok) expect(trailing.errors[0]).toContain('closing quote');
  });

  it('accepts a UTF-8 BOM before the first header', () => {
    const result = csvToFeedVersion('\uFEFFticker,period\nUAL,2025-12-31', 'bom.csv', NOW);
    expect(result.ok).toBe(true);
  });

  it('gives different imports globally distinct version and record ids', () => {
    const first = csvToFeedVersion('ticker,period\nUAL,2025-12-31', 'a.csv', NOW);
    const second = csvToFeedVersion('ticker,period\nDAL,2025-12-31', 'b.csv', NOW);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.version.id).not.toBe(second.version.id);
      expect(first.version.records[0]?.recordId).not.toBe(second.version.records[0]?.recordId);
    }
  });

  it('parses a valid file into a feed version with inferred schema and numeric coercion', () => {
    const r = csvToFeedVersion(
      'ticker,period,revenue,cash\nUAL,2025-12-31,"59,070,000,000",5942000000\nDAL,2025-12-31,63364000000,',
      'upload.csv',
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version.sourceSystemId).toBe('SRC-UPLOAD');
      expect(r.version.records).toHaveLength(2);
      expect(r.version.records[0]?.values['revenue']).toBe(59_070_000_000);
      expect(r.version.records[1]?.values['cash']).toBeNull();
      const cash = r.version.schema.find((f) => f.name === 'cash');
      expect(cash?.type).toBe('number');
      expect(cash?.nullable).toBe(true);
      const ticker = r.version.schema.find((f) => f.name === 'ticker');
      expect(ticker?.type).toBe('string');
    }
  });
});
