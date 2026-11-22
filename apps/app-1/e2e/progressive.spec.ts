import { expect, test } from '@playwright/test';

test('results render progressively, not all at once at the end', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('run-button').click();

  // The first 4 results (test1 x2, test2 x2) settle almost instantly;
  // test3 then genuinely takes ~2s (a real timeout, not mocked). If
  // rendering were all-at-once-at-the-end, we'd see 0 rows here. If it's
  // progressive, we should already see the fast ones well before the
  // whole run (summary) finishes.
  await page.waitForTimeout(500);
  const rowsBeforeSummary = await page.getByTestId('result-row').count();
  await expect(page.getByTestId('summary')).not.toBeVisible();

  console.log('rows visible 500ms in, before summary exists:', rowsBeforeSummary);
  expect(rowsBeforeSummary).toBeGreaterThanOrEqual(4);

  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 10_000 });
  const finalRows = await page.getByTestId('result-row').count();
  expect(finalRows).toBe(7);
});
