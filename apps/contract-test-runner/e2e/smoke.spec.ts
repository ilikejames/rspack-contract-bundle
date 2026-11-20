import { expect, test } from '@playwright/test';

test('run contract tests against the local echo server', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('echo-url-input')).toHaveValue('ws://127.0.0.1:8787');

  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 10_000 });

  const summaryText = await page.getByTestId('summary').innerText();
  console.log('SUMMARY:', summaryText);

  const rows = await page.getByTestId('result-row').all();
  console.log('ROW COUNT:', rows.length);
  for (const row of rows) {
    console.log('ROW:', await row.innerText());
  }

  expect(rows.length).toBeGreaterThan(0);
});
