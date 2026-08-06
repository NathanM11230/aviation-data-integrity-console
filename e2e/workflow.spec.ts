import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
}

test('opens on the focused 737 replacement decision', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { name: 'When should Delta replace its 737-800s?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The replacement question' })).toBeVisible();
  await expect(page.getByText('Boeing 737-800', { exact: true })).toBeVisible();
  await expect(page.getByText('Boeing 737-10', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What changes the answer?' })).toBeVisible();
});

test('updates the recommendation immediately and keeps settings in the URL', async ({ page }) => {
  await page.goto('');
  const fuel = page.getByLabel('Fuel price');
  await fuel.fill('4.5');
  await expect(page.getByText('$4.50 / gallon')).toBeVisible();
  await expect(page.getByText('$831.6M', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Fuel' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/fuel=4.5/);

  await page.reload();
  await expect(page.getByText('$4.50 / gallon')).toBeVisible();
});

test('switches the nearby equation to the slider being used', async ({ page }) => {
  await page.goto('');
  await page.getByLabel('737-10 delivery delay').fill('2');
  await expect(page.getByRole('tab', { name: 'Delivery' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('First modeled 737-10 arrival')).toBeVisible();
  await expect(page.locator('.math-receipt strong')).toHaveText('2029');

  await page.getByLabel('737-800 maintenance change').fill('10');
  await expect(page.getByRole('tab', { name: 'Maintenance' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.math-receipt strong')).toHaveText('$406.6M');
});

test('offers three useful presets and reset', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: /Delivery stress/ }).click();
  await expect(page.getByText('2 years late')).toBeVisible();
  await expect(page.getByText('+10%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText('On schedule')).toBeVisible();
});

test('compares the three actions on the decision screen', async ({ page }) => {
  await page.goto('#/decision');
  await expect(page.getByRole('heading', { name: 'How the choices compare' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keep and improve the 737-800s' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Replace aircraft as deliveries arrive' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Retire on plan and lease the difference' })).toBeVisible();
  await expect(page.getByText('Aircraft short', { exact: true })).toHaveCount(3);
  await expect(page.getByText('How the suggestion is chosen')).toBeVisible();
  await expect(page.locator('.decision-equation > div')).toHaveCount(3);
});

test('limits evidence to facts that support this case study', async ({ page }) => {
  await page.goto('#/evidence');
  await expect(page.getByRole('heading', { name: 'What Delta reported' })).toBeVisible();
  await expect(page.getByText('2 of 2 case-study checks passed')).toBeVisible();
  await expect(page.getByText('Average age of the 737-800 fleet')).toBeVisible();
  await expect(page.getByText('Delta advances fleet efficiency with VCT Finlets across 737NG fleet')).toBeVisible();
  await expect(page.getByText('Complete mainline fleet')).toHaveCount(0);
});

test('keeps private estimates visible and editable', async ({ page }) => {
  await page.goto('#/assumptions');
  await expect(page.getByRole('heading', { name: 'How the comparison works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Detailed inputs' })).toBeVisible();
  await expect(page.getByLabel('Replacement price')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What this cannot know' })).toBeVisible();
  await expect(page.getByText('Delta has not disclosed that allocation.')).toBeVisible();
});

test('has no console errors or horizontal overflow on desktop', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  for (const route of ['decision', 'evidence', 'assumptions']) {
    await page.goto(`#/${route}`);
    await expectNoHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test('works at a phone viewport without overlap or overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('');
  await expect(page.getByRole('heading', { name: 'When should Delta replace its 737-800s?' })).toBeVisible();
  await expect(page.getByLabel('Fuel price')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('#/evidence');
  await expect(page.getByText('2 of 2 case-study checks passed')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
