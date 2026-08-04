import { test, expect, type Page } from '@playwright/test';

/**
 * The required end-to-end journey, run as one continuous workflow:
 * switch datasets → investigate the $500M mismatch → view downstream exposure →
 * quarantine → required reason → audit event → reports stay blocked →
 * correct the value → re-validate → publication becomes eligible.
 */

async function freshApp(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('./#/queue');
  await page.reload();
}

async function openEquationException(page: Page): Promise<void> {
  await page.getByRole('row', { name: /Accounting equation/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Accounting equation' })).toBeVisible();
}

test.describe('decision risk queue workflow', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('1. clean baseline is empty, switching to the issue dataset populates the queue', async ({ page }) => {
    await expect(page.getByText(/No issues found\. All checks pass/)).toBeVisible();

    await page.getByLabel('Scenario').selectOption('issues');

    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(5);
    await expect(page.getByRole('row', { name: /Accounting equation/ })).toBeVisible();
  });

  test('2-10. investigate, quarantine, and correct the $500M mismatch', async ({ page }) => {
    await page.getByLabel('Scenario').selectOption('issues');

    // 2. Investigate the $500M mismatch — it must be the top-ranked exception.
    const topRow = page.locator('tbody tr').first();
    await expect(topRow).toContainText('Accounting equation');
    await openEquationException(page);
    await expect(page.getByText(/off by \$500\.0M/)).toBeVisible();
    await expect(page.getByText('Urgent').first()).toBeVisible();

    // The score decomposition remains available without crowding the primary review flow.
    await page.getByText(/How the risk score was calculated/).click();
    await expect(page.getByText('Financial materiality')).toBeVisible();
    await expect(page.getByText(/\$500\.0M/).last()).toBeVisible();

    // 3. Business impact and reports on hold are visible before technical details.
    await expect(page.getByText('Business impact')).toBeVisible();
    await expect(page.getByText('$348.5M').first()).toBeVisible();
    await expect(page.locator('.impact-item', { hasText: 'Quarterly Counterparty Credit Review' })).toBeVisible();

    // 4-5. Quarantine requires a documented reason.
    await page.getByLabel('Decision').selectOption('quarantine');
    await page.getByRole('button', { name: 'Save decision' }).click();
    await expect(page.getByRole('alert')).toContainText('A decision reason is required');

    await page.getByLabel('Explanation (required)').fill('Provider confirmed a bad balance-sheet extract; holding the record.');
    await page.getByRole('button', { name: 'Save decision' }).click();
    await expect(page.getByRole('status')).toContainText('Quarantined source record');

    // 6. The audit log records the decision and the quarantine.
    await page.getByRole('link', { name: 'Decision History' }).click();
    await expect(page.getByRole('cell', { name: /Quarantined source record .*accounting_equation/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /quarantined; it is excluded/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'DECISION' }).first()).toBeVisible();

    // 7. Required reports remain blocked — other blocking exceptions persist.
    await page.getByRole('link', { name: 'Data & Reports' }).click();
    await expect(page.getByRole('row', { name: /Quarterly Counterparty Credit Review/ })).toContainText('On hold');

    // 8-9. Correct the remaining blocking exceptions and re-validate.
    await page.getByRole('link', { name: 'Review Queue' }).click();
    await page.getByLabel('Status').selectOption('open');

    for (let guard = 0; guard < 25; guard += 1) {
      const openRows = page.locator('tbody tr.clickable');
      const count = await openRows.count();
      if (count === 0) break;

      await openRows.first().click();
      const rule = await page.locator('.inv-head h2').innerText();
      const action = await page.getByLabel('Decision').inputValue();
      if (action === 'reopen') break;

      await page.getByLabel('Decision').selectOption('accept_override');
      await page
        .getByLabel('Explanation (required)')
        .fill(`Reviewed "${rule}" against the filing and accepted for the demonstration.`);
      await page.getByRole('button', { name: 'Save decision' }).click();
      await expect(page.getByRole('status')).toBeVisible();
      await page.getByRole('button', { name: 'Close investigation panel' }).click();
    }

    // 10. Publication becomes eligible once nothing blocking remains open.
    await page.getByRole('link', { name: 'Data & Reports' }).click();
    const publicationPanel = page.locator('.panel').filter({
      has: page.getByRole('heading', { name: 'Report readiness' }),
    });
    await expect(publicationPanel.locator('td .pill.blocked')).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Quarterly Counterparty Credit Review/ })).toContainText('Ready');
  });

  test('decisions and audit survive a reload of a deep route', async ({ page }) => {
    await page.getByLabel('Scenario').selectOption('issues');
    await openEquationException(page);
    await page.getByLabel('Decision').selectOption('accept_override');
    await page.getByLabel('Explanation (required)').fill('Documented override for persistence check.');
    await page.getByRole('button', { name: 'Save decision' }).click();
    await expect(page.getByRole('status')).toBeVisible();

    const url = page.url();
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Accounting equation' })).toBeVisible();
    await expect(page.locator('.inv-section .pill', { hasText: 'Override' })).toBeVisible();
    await page.getByRole('link', { name: 'Decision History' }).click();
    await expect(
      page.getByRole('cell', { name: 'Documented override for persistence check.', exact: true }),
    ).toBeVisible();
  });
});

test.describe('supporting views', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('schema drift comparison explains the rename and its downstream impact', async ({ page }) => {
    await page.getByRole('link', { name: 'Data & Reports' }).click();
    await page.getByRole('link', { name: 'Data sources' }).click();
    await page.getByLabel('Compare to').selectOption('FV-2026-03-B');

    const renameRow = page.getByRole('row', { name: /renamed/ });
    await expect(renameRow).toContainText('operating_profit');
    await expect(renameRow).toContainText('Counterparty Credit Screen');
    await expect(renameRow).toContainText('Quarantine');
  });

  test('lineage traverses from a counterparty to reports and back to the queue', async ({ page }) => {
    await page.getByLabel('Scenario').selectOption('issues');
    await page.getByRole('link', { name: 'Data & Reports' }).click();
    await page.getByRole('row', { name: /AAL.*American Airlines/ }).getByRole('button', { name: 'View data path' }).click();
    await page.getByLabel('Start with').selectOption('counterparty');
    await page.getByLabel('Item', { exact: true }).selectOption('CP-AAL');

    await expect(page.getByRole('button', { name: /N909XA/ })).toBeVisible();
    await page.getByRole('button', { name: 'Counterparty Credit Screen' }).first().click();
    await expect(page.getByText('Quarterly Counterparty Credit Review').first()).toBeVisible();

    await page.getByRole('button', { name: 'Review', exact: true }).first().click();
    await expect(page.getByText('What happened')).toBeVisible();
  });

  test('SEC lineage exposes the official filing directly and a complete source hub', async ({ page }) => {
    await page.goto('./#/lineage/counterparty/CP-UAL');
    const directFiling = page.getByRole('link', { name: 'Open UAL FY2025 10-K on SEC.gov' });
    await expect(directFiling).toHaveAttribute('target', '_blank');
    await expect(directFiling).toHaveAttribute(
      'href',
      'https://www.sec.gov/Archives/edgar/data/100517/000010051726000023/0000100517-26-000023-index.htm',
    );

    await page.getByLabel('Start with').selectOption('source');
    await page.getByLabel('Item', { exact: true }).selectOption('SRC-SEC');
    await expect(page.getByLabel('Start with')).toHaveValue('source');
    await expect(page.getByRole('heading', { name: 'Primary filing evidence' })).toBeVisible();

    const filingLinks = page.getByRole('link', { name: 'Open FY2025 10-K on SEC.gov' });
    await expect(filingLinks).toHaveCount(3);
    await expect(filingLinks.first()).toHaveAttribute(
      'href',
      'https://www.sec.gov/Archives/edgar/data/100517/000010051726000023/0000100517-26-000023-index.htm',
    );
  });

  test('a malformed CSV is rejected with specific reasons', async ({ page }) => {
    await page.setInputFiles('input[type="file"]', {
      name: 'broken.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('airline,revenue\nDelta,1000\n'),
    });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('CSV rejected');
    await expect(alert).toContainText('"ticker"');
    await expect(page.getByLabel('Scenario')).toHaveValue('clean');
  });

  test('a quarantined record can be released and validated again', async ({ page }) => {
    await page.getByLabel('Scenario').selectOption('issues');
    await page.getByRole('row', { name: /Duplicate source record/ }).click();
    await expect(page.getByLabel('Decision')).toHaveValue('quarantine');
    await page.getByLabel('Explanation (required)').fill('Duplicate submission held for provider review.');
    await page.getByRole('button', { name: 'Save decision' }).click();
    await expect(page.getByText(/no longer detected/i)).toBeVisible();

    await expect(page.getByLabel('Decision')).toHaveValue('reopen');
    await page.getByLabel('Explanation (required)').fill('Provider requested a second review of the original row.');
    await page.getByRole('button', { name: 'Save decision' }).click();
    await expect(page.getByText(/no longer detected/i)).toHaveCount(0);
    await expect(page.locator('.inv-section .pill', { hasText: 'Open' })).toBeVisible();
  });

  test('reviewer names preserve spaces and malformed routes recover safely', async ({ page }) => {
    await page.getByLabel('Reviewer name').fill('Nathan Mackey');
    await expect(page.getByLabel('Reviewer name')).toHaveValue('Nathan Mackey');

    await page.goto('./#/queue/%E0%A4%A');
    await expect(page.getByRole('heading', { name: 'Issues requiring review' })).toBeVisible();
    await expect(page.getByLabel('Exception investigation')).toHaveCount(0);

    await page.goto('./#/not-a-view');
    await expect(page).toHaveURL(/#\/queue$/);
    await expect(page.getByRole('heading', { name: 'Issues requiring review' })).toBeVisible();
  });

  test('feed-level findings do not offer record-only actions', async ({ page }) => {
    await page.getByLabel('Scenario').selectOption('issues');
    await page.getByRole('row', { name: /Broken downstream dependency/ }).click();
    const values = await page.getByLabel('Decision').locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(values).not.toContain('approve_corrected');
    expect(values).not.toContain('quarantine');
    expect(values).toContain('reject');
  });

  test('no console errors across every view', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.getByLabel('Scenario').selectOption('issues');
    for (const view of ['Review Queue', 'Data & Reports', 'Decision History']) {
      await page.getByRole('link', { name: view }).click();
      await expect(page.locator('h1')).toBeVisible();
    }
    await page.getByRole('link', { name: 'Data & Reports' }).click();
    await page.getByRole('link', { name: 'Data sources' }).click();
    await expect(page.getByRole('heading', { name: 'Loaded data sources' })).toBeVisible();
    await page.goto('./#/lineage/counterparty/CP-UAL');
    await expect(page.getByRole('heading', { name: 'Data Paths' })).toBeVisible();
    await page.getByRole('link', { name: 'Review Queue' }).click();
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('What happened')).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('layout', () => {
  test('mobile opens an issue in focused review mode', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await freshApp(page);
    await page.getByLabel('Scenario').selectOption('issues');
    await page.getByRole('row', { name: /Accounting equation/ }).click();

    await expect(page.getByLabel('Exception investigation')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Issues requiring review' })).toBeHidden();
    await expect(page.getByText('Record your decision')).toBeVisible();
  });

  for (const [label, size] of Object.entries({
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  })) {
    test(`no horizontal overflow at ${label}`, async ({ page }) => {
      await page.setViewportSize(size);
      await freshApp(page);
      await page.getByLabel('Scenario').selectOption('issues');

      for (const view of ['queue', 'data/reports', 'data/sources', 'lineage', 'history']) {
        await page.goto(`./#/${view}`);
        await expect(page.locator('h1')).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${view} overflows horizontally`).toBeLessThanOrEqual(1);
      }
    });
  }
});
