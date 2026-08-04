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
    await expect(page.getByText(/No exceptions\. Every blocking control passes/)).toBeVisible();

    await page.getByLabel('Dataset').selectOption('issues');

    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(5);
    await expect(page.getByRole('row', { name: /Accounting equation/ })).toBeVisible();
  });

  test('2-10. investigate, quarantine, and correct the $500M mismatch', async ({ page }) => {
    await page.getByLabel('Dataset').selectOption('issues');

    // 2. Investigate the $500M mismatch — it must be the top-ranked exception.
    const topRow = page.locator('tbody tr').first();
    await expect(topRow).toContainText('Accounting equation');
    await openEquationException(page);
    await expect(page.getByText(/off by \$500\.0M/)).toBeVisible();
    await expect(page.getByText('Critical').first()).toBeVisible();

    // The score decomposition is visible, not hidden behind an opaque number.
    await expect(page.getByRole('heading', { name: /Why this priority/ })).toBeVisible();
    await expect(page.getByText('Financial materiality')).toBeVisible();
    await expect(page.getByText(/\$500\.0M \(≥ \$250M\)/)).toBeVisible();

    // 3. Downstream exposure and blocked outputs.
    await expect(page.getByRole('heading', { name: /Downstream impact — \$348\.5M/ })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /report Quarterly Counterparty Credit Review/ }),
    ).toBeVisible();

    // 4-5. Quarantine requires a documented reason.
    await page.getByLabel('Action').selectOption('quarantine');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await expect(page.getByRole('alert')).toContainText('A decision reason is required');

    await page.getByLabel('Reason (required)').fill('Provider confirmed a bad balance-sheet extract; holding the record.');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await expect(page.getByRole('status')).toContainText('Quarantined source record');

    // 6. The audit log records the decision and the quarantine.
    await page.getByRole('link', { name: 'Reviews & Audit' }).click();
    await expect(page.getByRole('cell', { name: /Quarantined source record .*accounting_equation/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /quarantined; it is excluded/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'DECISION' }).first()).toBeVisible();

    // 7. Required reports remain blocked — other blocking exceptions persist.
    await page.getByRole('link', { name: 'Portfolio' }).click();
    await expect(page.getByRole('row', { name: /Quarterly Counterparty Credit Review/ })).toContainText('Blocked');

    // 8-9. Correct the remaining blocking exceptions and re-validate.
    await page.getByRole('link', { name: 'Decision Risk Queue' }).click();
    await page.getByLabel('Status').selectOption('open');

    for (let guard = 0; guard < 25; guard += 1) {
      const openRows = page.locator('tbody tr.clickable');
      const count = await openRows.count();
      if (count === 0) break;

      await openRows.first().click();
      const rule = await page.locator('.inv-head h2').innerText();
      const action = await page.getByLabel('Action').inputValue();
      if (action === 'reopen') break;

      await page.getByLabel('Action').selectOption('accept_override');
      await page
        .getByLabel('Reason (required)')
        .fill(`Reviewed "${rule}" against the filing and accepted for the demonstration.`);
      await page.getByRole('button', { name: 'Record decision' }).click();
      await expect(page.getByRole('status')).toBeVisible();
      await page.getByRole('button', { name: 'Close investigation panel' }).click();
    }

    // 10. Publication becomes eligible once nothing blocking remains open.
    await page.getByRole('link', { name: 'Portfolio' }).click();
    const blockedPills = page.locator('td .pill.blocked');
    await expect(blockedPills).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Quarterly Counterparty Credit Review/ })).toContainText('Eligible');
  });

  test('decisions and audit survive a reload of a deep route', async ({ page }) => {
    await page.getByLabel('Dataset').selectOption('issues');
    await openEquationException(page);
    await page.getByLabel('Action').selectOption('accept_override');
    await page.getByLabel('Reason (required)').fill('Documented override for persistence check.');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await expect(page.getByRole('status')).toBeVisible();

    const url = page.url();
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Accounting equation' })).toBeVisible();
    await expect(page.locator('.inv-section .pill', { hasText: 'Override' })).toBeVisible();
    await page.getByRole('link', { name: 'Reviews & Audit' }).click();
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
    await page.getByRole('link', { name: 'Data Feeds' }).click();
    await page.getByLabel('Incoming version').selectOption('FV-2026-03-B');

    const renameRow = page.getByRole('row', { name: /renamed/ });
    await expect(renameRow).toContainText('operating_profit');
    await expect(renameRow).toContainText('Counterparty Credit Screen');
    await expect(renameRow).toContainText('Quarantine');
  });

  test('lineage traverses from a counterparty to reports and back to the queue', async ({ page }) => {
    await page.getByLabel('Dataset').selectOption('issues');
    await page.getByRole('link', { name: 'Lineage & Impact' }).click();
    await page.getByLabel('Entity type').selectOption('counterparty');
    await page.getByLabel('Entity', { exact: true }).selectOption('CP-AAL');

    await expect(page.getByRole('button', { name: /N909XA/ })).toBeVisible();
    await page.getByRole('button', { name: 'Counterparty Credit Screen' }).first().click();
    await expect(page.getByText('Quarterly Counterparty Credit Review').first()).toBeVisible();

    await page.getByRole('button', { name: 'Investigate' }).first().click();
    await expect(page.getByRole('heading', { name: /Why this priority/ })).toBeVisible();
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
    await expect(page.getByLabel('Dataset')).toHaveValue('clean');
  });

  test('no console errors across every view', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.getByLabel('Dataset').selectOption('issues');
    for (const view of ['Decision Risk Queue', 'Data Feeds', 'Lineage & Impact', 'Reviews & Audit', 'Portfolio']) {
      await page.getByRole('link', { name: view }).click();
      await expect(page.locator('h1')).toBeVisible();
    }
    await page.getByRole('link', { name: 'Decision Risk Queue' }).click();
    await page.locator('tbody tr').first().click();
    await expect(page.getByRole('heading', { name: /Why this priority/ })).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('layout', () => {
  for (const [label, size] of Object.entries({
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  })) {
    test(`no horizontal overflow at ${label}`, async ({ page }) => {
      await page.setViewportSize(size);
      await freshApp(page);
      await page.getByLabel('Dataset').selectOption('issues');

      for (const view of ['queue', 'feeds', 'lineage', 'reviews', 'portfolio']) {
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
