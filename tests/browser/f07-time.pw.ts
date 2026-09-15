import { expect, test } from '@playwright/test';

test('Today opens one canonical Day and @today inserts a Date Object that returns to it', async ({ page }) => {
  await page.goto('/editor');
  const editor = page.locator('[data-slate-editor]');
  await expect(editor).toBeVisible();

  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const breadcrumbs = page.getByRole('navigation', { name: '路径导航' });
  await expect(breadcrumbs.getByRole('button', { name: /\d{4} 年/ })).toBeVisible();
  await expect(breadcrumbs.getByRole('button', { name: /\d{4}-W\d{2} 周/ })).toBeVisible();
  await expect(breadcrumbs).toContainText(/\d{4}年\d{1,2}月\d{1,2}日/);

  const dayTitle = editor.getByText(/^\d{4}年\d{1,2}月\d{1,2}日 · 第\d{1,2}周$/, { exact: true });
  await dayTitle.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' @today');
  const input = page.locator('input[role="combobox"]');
  await expect(input).toBeFocused();
  const dateOption = page.getByRole('option', { name: /日期：\d{4}-\d{2}-\d{2}/ });
  await expect(dateOption).toBeVisible();
  await dateOption.click();

  const dateObject = page.getByRole('button', { name: /打开日期 \d{4}-\d{2}-\d{2}/ });
  await expect(dateObject).toBeVisible();
  await dateObject.click();
  await expect(breadcrumbs).toContainText(/\d{4}年\d{1,2}月\d{1,2}日/);
});

test('Date Object input accepts tomorrow and yesterday without creating Node references', async ({ page }) => {
  await page.goto('/editor');
  const editor = page.locator('[data-slate-editor]');
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const dayTitle = editor.getByText(/年\d{1,2}月\d{1,2}日 · 第\d{1,2}周$/, { exact: true });
  await dayTitle.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' @tomorrow');
  const input = page.locator('input[role="combobox"]');
  await expect(input).toBeFocused();
  await page.getByRole('option', { name: /日期：\d{4}-\d{2}-\d{2}/ }).click();
  await expect(page.getByRole('button', { name: /打开日期 \d{4}-\d{2}-\d{2}/ })).toBeVisible();

  await editor.focus();
  await page.keyboard.press('End');
  await page.keyboard.type(' @yesterday');
  await expect(input).toBeFocused();
  await page.getByRole('option', { name: /日期：\d{4}-\d{2}-\d{2}/ }).click();
  await expect(page.getByRole('button', { name: /打开日期 \d{4}-\d{2}-\d{2}/ })).toHaveCount(2);
});
