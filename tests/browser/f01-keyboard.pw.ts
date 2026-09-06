import { test, expect } from '@playwright/test';

for (const key of ['Shift+Enter', 'ControlOrMeta+Shift+Enter']) {
  test(`${key} creates a separate Node and undo restores it`, async ({ page }) => {
    await page.goto('/editor');
    await page.getByText('Plate 提供编辑器能力，Local Tana 只补充语义。', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.press(key);
    await page.keyboard.insertText('F01 keyboard sibling');
    const title = page.getByRole('button', { name: /聚焦.*F01 keyboard sibling/ });
    await expect(title).toHaveCount(1);
    await expect(title).not.toHaveAccessibleName(/Plate 提供/);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-slate-editor]')).not.toContainText('F01 keyboard sibling');
  });
}

test('Escape opens the existing node menu', async ({ page }) => {
  await page.goto('/editor');
  await page.getByText('Plate 提供编辑器能力，Local Tana 只补充语义。', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: '复制', exact: true })).toBeVisible();
});

test('Done shortcut toggles the existing checkbox', async ({ page }) => {
  await page.goto('/editor');
  const text = page.getByText('Plate 提供编辑器能力，Local Tana 只补充语义。', { exact: true });
  const row = text.locator('xpath=ancestor::*[@data-slate-node="element"][1]');
  const checkbox = row.getByRole('checkbox');
  await text.click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(checkbox).toBeChecked();
  await text.click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(checkbox).not.toBeChecked();
});

test('Zoom shortcuts navigate into the canonical Node and back', async ({ page }) => {
  await page.goto('/editor');
  await page.getByText('Plate 提供编辑器能力，Local Tana 只补充语义。', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+.');
  await expect(page.getByRole('navigation', { name: '路径导航' })).toContainText(
    'Plate 提供编辑器能力，Local Tana 只补充语义。'
  );
  await page.locator('[data-slate-editor]').click();
  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('navigation', { name: '路径导航' })).toContainText('工作区');
});
