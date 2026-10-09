import { expect, test, type Page } from '@playwright/test';

async function openDailyNotes(page: Page) {
  const breadcrumbs = page.getByRole('navigation', { name: '路径导航' });
  const direct = breadcrumbs.getByRole('button', { name: '每日笔记', exact: true });
  if (await direct.isVisible()) await direct.click();
  else {
    await breadcrumbs.getByRole('button', { name: /显示 .*个上级路径/ }).click();
    await page.getByRole('menuitem', { name: '每日笔记', exact: true }).click();
  }
}

test('Today opens one canonical Day and @today inserts a Date Object that returns to it', async ({ page }) => {
  await page.goto('/editor');
  const editor = page.locator('[data-slate-editor]');
  await expect(editor).toBeVisible();

  await page.getByRole('button', { name: '今日笔记', exact: true }).click();
  const breadcrumbs = page.getByRole('navigation', { name: '路径导航' });
  await breadcrumbs.getByRole('button', { name: /显示 .*个上级路径/ }).click();
  await expect(page.getByRole('menuitem', { name: /\d{4} 年/ })).toBeVisible();
  await page.keyboard.press('Escape');
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
  await page.getByRole('button', { name: '今日笔记', exact: true }).click();
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

test('Daily Notes opens canonical Day, Week, Month, and Year Nodes from its header', async ({ page }) => {
  await page.goto('/editor');
  const breadcrumbs = page.getByRole('navigation', { name: '路径导航' });

  await page.getByRole('button', { name: '今日笔记', exact: true }).click();
  await openDailyNotes(page);

  await page.getByLabel('前往指定日期').fill('2026-02-03');
  await page.getByLabel('前往指定日期').press('Enter');
  await expect(breadcrumbs).toContainText(/2026年2月3日/);

  await openDailyNotes(page);
  await page.getByLabel('前往指定周').fill('2026-W09');
  await page.getByLabel('前往指定周').press('Enter');
  await expect(breadcrumbs).toContainText('2026-W09 周');

  await openDailyNotes(page);
  await page.getByLabel('前往指定月份').fill('2026-02');
  await page.getByLabel('前往指定月份').press('Enter');
  await expect(breadcrumbs).toContainText('2026-02 月');

  await openDailyNotes(page);
  await page.getByLabel('前往指定年份').fill('2026');
  await page.getByLabel('前往指定年份').press('Enter');
  await expect(breadcrumbs).toContainText('2026 年');

  await openDailyNotes(page);
  await page.getByRole('button', { name: '打开本周', exact: true }).click();
  await expect(breadcrumbs).toContainText(/\d{4}-W\d{2} 周/);

  await openDailyNotes(page);
  await page.getByRole('button', { name: '打开本月', exact: true }).click();
  await expect(breadcrumbs).toContainText(/\d{4}-\d{2} 月/);

  await openDailyNotes(page);
  await page.getByRole('button', { name: '打开今年', exact: true }).click();
  await expect(breadcrumbs).toContainText(/\d{4} 年/);
});
