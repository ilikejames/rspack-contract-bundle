import { expect, test } from '@playwright/test';

test('editing the textbox genuinely changes the target endpoint', async ({ page }) => {
  await page.goto('/');

  const input = page.getByTestId('echo-url-input');
  await input.fill('ws://127.0.0.1:1/unreachable');

  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 10_000 });

  const rows = await page.getByTestId('result-row').all();
  let sawConnectionError = false;
  for (const row of rows) {
    const text = await row.innerText();
    console.log('ROW:', text);
    if (/websocket error talking to ws:\/\/127\.0\.0\.1:1/.test(text)) {
      sawConnectionError = true;
    }
  }

  expect(sawConnectionError).toBe(true);
});
