import { test, expect, type Page } from '@playwright/test';

async function openCombobox(page: Page) {
  await page.goto('/editor');
  await page.getByText('Plate 提供编辑器能力，Local Tana 只补充语义。', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' #');
  const input = page.locator('input[role="combobox"]');
  await expect(input).toBeFocused();
  return input;
}

test('Escape restores composed text/trigger and editor focus', async ({ page }) => {
  const input = await openCombobox(page);
  await page.keyboard.insertText('项目');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
  await expect(page.locator('[data-slate-editor]')).toContainText('#项目');
});

test('Backspace cancels an empty input without restoring the trigger', async ({ page }) => {
  const input = await openCombobox(page);
  await input.press('Backspace');
  await expect(input).toHaveCount(0);
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
  await expect(page.getByRole('button', { name: '聚焦 节点：Plate 提供编辑器能力， Local Tana 只补充语义。', exact: true })).toBeVisible();
});

test('selecting an item restores Plate focus and removes the input', async ({ page }) => {
  const input = await openCombobox(page);
  await expect(page.getByRole('option').first()).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
});

test('IME composition Enter does not select a candidate before composition ends', async ({ page }) => {
  const input = await openCombobox(page);
  await input.dispatchEvent('compositionstart', { data: '' });
  await page.keyboard.insertText('项目');
  await input.dispatchEvent('compositionupdate', { data: '项目' });
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('项目');
  await input.dispatchEvent('compositionend', { data: '项目' });
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(page.locator('[data-slate-editor]')).toContainText('#项目');
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
});

for (const [key, keyCode] of [['Escape', 27], ['Backspace', 8]] as const) {
  test(`IME ${key} does not cancel the Plate input during composition`, async ({ page }) => {
    const input = await openCombobox(page);
    await input.dispatchEvent('compositionstart', { data: '' });
    await input.dispatchEvent('keydown', { key, code: key, keyCode, which: keyCode, isComposing: true });
    await expect(input).toBeFocused();
    await input.dispatchEvent('compositionend', { data: '' });
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(page.locator('[data-slate-editor]')).toBeFocused();
  });
}

test('Backspace deletes selected input text before cancelling the empty input', async ({ page }) => {
  const input = await openCombobox(page);
  await page.keyboard.insertText('draft');
  await input.press('ControlOrMeta+A');
  await input.press('Backspace');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await input.press('Backspace');
  await expect(input).toHaveCount(0);
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
});

test('moving selection back into Plate restores the typed query at its original point', async ({ page }) => {
  const input = await openCombobox(page);
  await page.keyboard.insertText('draft');
  await page.getByText('Plate 文档是唯一真相源。', { exact: true }).click();
  await expect(input).toHaveCount(0);
  await expect(page.locator('[data-slate-editor]')).toContainText('#draft');
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
});
