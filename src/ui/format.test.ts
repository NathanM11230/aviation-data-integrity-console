import { describe, expect, it } from 'vitest';
import { csvEscape, toCsv } from './format';

describe('CSV export safety', () => {
  it('neutralizes spreadsheet formulas in analyst-controlled text', () => {
    expect(csvEscape('=HYPERLINK("https://example.com")')).toBe(
      '"\'=HYPERLINK(""https://example.com"")"',
    );
    expect(csvEscape(' +SUM(1,2)')).toBe('"\' +SUM(1,2)"');
    expect(csvEscape('@command')).toBe("'@command");
  });

  it('keeps numeric negative values numeric and still escapes CSV delimiters', () => {
    expect(csvEscape(-500)).toBe('-500');
    expect(toCsv(['value'], [['plain, text']])).toBe('value\n"plain, text"');
  });
});
