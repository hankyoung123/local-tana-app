import { expect, test, type Page } from '@playwright/test';

const firstNodeTitle = 'Plate 提供编辑器能力，Local Tana 只补充语义。';

async function deleteFirstNode(page: Page) {
  const node = page
    .locator('[data-slate-editor]')
    .getByText(firstNodeTitle, { exact: true });
  await node.click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
}

async function addReferenceFromEmptyNode(page: Page, targetTitle: string) {
  const editor = page.locator('[data-slate-editor]');
  await editor.getByText(firstNodeTitle, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('@');
  const input = page.locator('input[role="combobox"]');
  await expect(input).toBeFocused();
  await page.keyboard.type(targetTitle);
  await page.getByRole('option', { name: targetTitle, exact: true }).click();
}


test('Delete → Trash → Restore keeps the canonical title', async ({ page }) => {
  await page.goto('/editor');
  await deleteFirstNode(page);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.getByRole('heading', { name: '废纸篓' })).toBeVisible();
  await expect(page.getByText(firstNodeTitle, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('[data-slate-editor]').getByText(firstNodeTitle, { exact: true })).toBeVisible();
});

test('Permanent delete removes a Trash root after confirmation', async ({ page }) => {
  await page.goto('/editor');
  await deleteFirstNode(page);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '永久删除…', exact: true }).click();
  await expect(page.getByText(firstNodeTitle, { exact: true })).toHaveCount(0);
});

test('Empty Trash removes all Trash roots in one confirmed action', async ({ page }) => {
  await page.goto('/editor');
  await deleteFirstNode(page);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '清空废纸篓', exact: true }).click();
  await expect(page.getByText('废纸篓为空', { exact: true })).toBeVisible();
});

test('A Trash item can be viewed without being restored', async ({ page }) => {
  await page.goto('/editor');
  await deleteFirstNode(page);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '查看', exact: true }).click();
  await expect(page).toHaveURL(/\/editor\?node=node-principle/);
  await expect(page.getByRole('button', { name: '恢复', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slate-editor]')).toContainText(firstNodeTitle);
});

test('Deleting the focused Node page returns to Workspace', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: `聚焦 节点：${firstNodeTitle}` }).click();
  await page.locator('[data-slate-editor]').getByText(firstNodeTitle, { exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '路径导航' })).toContainText('工作区');
  await expect(page).toHaveURL(/\/editor$/);
});

test('A Reference shows Trash state and restores its exact target', async ({ page }) => {
  await page.goto('/editor');
  await addReferenceFromEmptyNode(page, 'Plate 文档是唯一真相源。');
  const reference = page.locator('[data-target-node-id="node-document-source"]');
  await expect(reference).toHaveAttribute('data-reference-status', 'live');

  await page.getByRole('button', { name: '聚焦 节点：Plate 文档是唯一真相源。' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
  await expect(reference).toHaveAttribute('data-reference-status', 'trashed');
  await page.getByRole('button', { name: '恢复原节点' }).click();
  await expect(reference).toHaveAttribute('data-reference-status', 'live');
});

test('Hard delete preserves inline References to the trashed target', async ({ page }) => {
  await page.goto('/editor');
  await addReferenceFromEmptyNode(page, 'Plate 文档是唯一真相源。');
  const inlineReference = page.locator('[data-target-node-id="node-document-source"]');
  await expect(inlineReference).toHaveAttribute('data-reference-status', 'live');

  await page.getByRole('button', { name: '聚焦 节点：Plate 文档是唯一真相源。' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除节点及引用…', exact: true }).click();

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(inlineReference).toHaveCount(1);
  await expect(inlineReference).toHaveAttribute('data-reference-status', 'trashed');
});
