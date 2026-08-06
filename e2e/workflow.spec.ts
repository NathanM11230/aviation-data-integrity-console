import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
}

test('opens directly on the decision tool', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Keep|Replace|Lease/);
  await expect(page.getByText('Modeled example: 737-800 to 737-10')).toBeVisible();
  await expect(page.getByText('77 planes', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What could change the answer?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Results for this scenario' })).toBeVisible();
});

test('updates results immediately and keeps settings in the URL', async ({ page }) => {
  await page.goto('');
  const fuel = page.getByLabel('What if fuel becomes more expensive?');
  await fuel.fill('4.5');
  await expect(page.getByText('$4.50 per gallon')).toBeVisible();
  await expect(page).toHaveURL(/fuel=4.5/);

  await page.reload();
  await expect(page.getByText('$4.50 per gallon')).toBeVisible();
});

test('offers understandable presets and a reset', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Delivery stress' }).click();
  await expect(page.getByText('2 years late')).toBeVisible();
  await expect(page.getByText('+10%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText('On the reported schedule')).toBeVisible();
});

test('compares all three choices with plain-language outcomes', async ({ page }) => {
  await page.goto('#/compare');
  await expect(page.getByRole('heading', { name: 'Compare the choices' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keep the older aircraft' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Replace aircraft as deliveries arrive' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Retire on plan and lease the difference' })).toBeVisible();
  await expect(page.getByText('Planes short', { exact: true })).toHaveCount(3);
});

test('shows the complete sourced fleet without issuing unsupported recommendations', async ({ page }) => {
  await page.goto('#/fleet');
  await expect(page.getByRole('heading', { name: "Delta's fleet today" })).toBeVisible();
  await expect(page.getByTestId('fleet-B737-800')).toBeVisible();
  await expect(page.getByTestId('fleet-B767-300ER')).toBeVisible();
  await expect(page.getByText('The model therefore treats the connection as an adjustable case study')).toBeVisible();
});

test('keeps every source check visible and links to the SEC filing', async ({ page }) => {
  await page.goto('#/sources');
  await expect(page.getByText('5 of 5 checks passed')).toBeVisible();
  await expect(page.getByText('The 737-10 delivery schedule reconciles')).toBeVisible();
  const secLinks = page.getByRole('link', { name: 'Delta Air Lines / SEC EDGAR' });
  expect(await secLinks.count()).toBeGreaterThan(0);
  await expect(secLinks.first()).toHaveAttribute('href', /sec\.gov\/Archives\/edgar/);
});

test('explains formulas, assumptions, and limitations', async ({ page }) => {
  await page.goto('#/method');
  await expect(page.getByRole('heading', { name: 'How the case study works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What this cannot know' })).toBeVisible();
  await expect(page.getByText('Delta does not publicly disclose tail-level maintenance condition')).toBeVisible();
  await expect(page.getByText('Assumptions, not Delta facts')).toBeVisible();
});

test('has no console errors or horizontal overflow on desktop', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  for (const route of ['scenario', 'fleet', 'compare', 'sources', 'method']) {
    await page.goto(`#/${route}`);
    await expectNoHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test('works at a phone viewport without overlap or overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('What if fuel becomes more expensive?')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('#/sources');
  await expect(page.getByText('5 of 5 checks passed')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
