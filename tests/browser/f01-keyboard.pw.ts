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

test('Tab keeps an empty child caret at its text coordinate', async ({ page }) => {
  await page.goto('/editor');
  const source = page
    .getByText('Plate 提供编辑器能力，Local Tana 只补充语义。', { exact: true })
    .locator('xpath=ancestor::*[@data-slate-node="element"][1]');
  const sourceMarginLeft = await source.evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).marginLeft)
  );
  await source.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Tab');

  const geometry = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    const text = selection?.anchorNode?.parentElement?.closest(
      '[data-slate-node="text"]'
    );
    const element = text?.closest('[data-slate-node="element"]');
    const gutter = element?.querySelector<HTMLElement>('.tana-nodeGutter');

    if (!range || !text || !element || !gutter) return null;

    return {
      caretLeft: range.getBoundingClientRect().left,
      gutterPosition: getComputedStyle(gutter).position,
      gutterRight: gutter.getBoundingClientRect().right,
      marginLeft: Number.parseFloat(getComputedStyle(element).marginLeft),
      textLeft: text.getBoundingClientRect().left,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.gutterPosition).toBe('absolute');
  expect(geometry!.marginLeft).toBeGreaterThan(sourceMarginLeft);
  expect(geometry!.caretLeft).toBeCloseTo(geometry!.textLeft, 0);
  expect(geometry!.caretLeft).toBeCloseTo(geometry!.gutterRight, 0);
});
