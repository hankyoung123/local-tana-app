import { expect, test, type Page } from '@playwright/test';

const firstNodeTitle = 'Plate 提供编辑器能力，Local Tana 只补充语义。';

async function createDisposableNode(page: Page, suffix: string) {
  const title = `F10 disposable ${suffix}`;
  const editor = page.locator('[data-slate-editor]');
  await editor.getByText(firstNodeTitle, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.insertText(title);
  await expect(editor.getByText(title, { exact: true })).toBeVisible();
  return title;
}

async function deleteNode(page: Page, title: string) {
  const node = page.locator('[data-slate-editor]').getByText(title, { exact: true });
  await node.click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
}

async function addBlockReferenceFromEmptyNode(page: Page, targetTitle: string) {
  const editor = page.locator('[data-slate-editor]');
  await editor.getByText(firstNodeTitle, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('@');
  const input = page.locator('input[role="combobox"]');
  await expect(input).toBeFocused();
  await page.keyboard.type(targetTitle);
  await page.getByRole('option', { name: targetTitle, exact: true }).click();
}

async function addInlineReference(page: Page, targetTitle: string) {
  const editor = page.locator('[data-slate-editor]');
  await editor.getByText(firstNodeTitle, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' @');
  const input = page.locator('input[role="combobox"]');
  await expect(input).toBeFocused();
  await page.keyboard.type(targetTitle);
  await page.getByRole('option', { name: targetTitle, exact: true }).click();
}


test('Delete → Trash → Restore keeps the canonical title', async ({ page }) => {
  await page.goto('/editor');
  const title = await createDisposableNode(page, 'restore');
  await deleteNode(page, title);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.getByRole('heading', { name: '废纸篓' })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('[data-slate-editor]').getByText(title, { exact: true })).toBeVisible();
});

test('Deleting a block Reference removes only the occurrence', async ({ page }) => {
  await page.goto('/editor');
  await addBlockReferenceFromEmptyNode(page, 'Plate 文档是唯一真相源。');
  const reference = page.getByRole('button', { name: '打开 Plate 文档是唯一真相源。' });
  await expect(reference).toBeVisible();
  await reference.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除引用', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开 Plate 文档是唯一真相源。' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '聚焦 节点：Plate 文档是唯一真相源。' })).toBeVisible();
});

test('Permanent delete removes a Trash root after confirmation', async ({ page }) => {
  await page.goto('/editor');
  const title = await createDisposableNode(page, 'permanent');
  await deleteNode(page, title);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '永久删除…', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('可使用编辑器的撤销恢复');
  await expect(page.getByRole('alertdialog')).not.toContainText('无法撤销');
  await page.getByRole('alertdialog').getByRole('button', { name: '永久删除', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});

test('Reload keeps a deleted Node in Trash with its canonical identity', async ({ page }) => {
  await page.goto('/editor');
  const title = await createDisposableNode(page, 'reload');
  await deleteNode(page, title);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '废纸篓' })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test('Empty Trash removes all Trash roots in one confirmed action', async ({ page }) => {
  await page.goto('/editor');
  const title = await createDisposableNode(page, 'empty');
  await deleteNode(page, title);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '清空废纸篓', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空废纸篓', exact: true }).click();
  await expect(page.getByText('废纸篓为空', { exact: true })).toBeVisible();
});

test('A Trash item can be viewed without being restored', async ({ page }) => {
  await page.goto('/editor');
  const title = await createDisposableNode(page, 'view');
  await deleteNode(page, title);
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '查看', exact: true }).click();
  await expect(page).toHaveURL(/\/editor\?node=/);
  await expect(page.getByRole('button', { name: '恢复', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slate-editor]')).toContainText(title);
});

test('Deleting the focused Node page returns to Workspace', async ({ page }) => {
  await page.goto('/editor');
  const title = await createDisposableNode(page, 'focused');
  await page.getByRole('button', { name: `聚焦 节点：${title}` }).click();
  await page.locator('[data-slate-editor]').getByText(title, { exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '路径导航' })).toContainText('工作区');
  await expect(page).toHaveURL(/\/editor$/);
});

test('A Reference shows Trash state and restores its exact target', async ({ page }) => {
  await page.goto('/editor');
  await addBlockReferenceFromEmptyNode(page, 'Plate 文档是唯一真相源。');
  const liveReference = page.getByRole('button', { name: '打开 Plate 文档是唯一真相源。' });
  await expect(liveReference).toBeVisible();

  await page.getByRole('button', { name: '聚焦 节点：Plate 文档是唯一真相源。' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
  await expect(page.getByLabel('引用：目标在废纸篓：Plate 文档是唯一真相源。')).toBeVisible();
  await page.getByRole('button', { name: '恢复原节点' }).click();
  await expect(liveReference).toBeVisible();
});

test('Hard delete preserves inline References to the trashed target', async ({ page }) => {
  await page.goto('/editor');
  await addInlineReference(page, 'Plate 文档是唯一真相源。');
  const inlineReference = page.locator('[data-target-node-id="node-document-source"]');
  await expect(inlineReference).toHaveAttribute('data-reference-status', 'live');

  await page.getByRole('button', { name: '聚焦 节点：Plate 文档是唯一真相源。' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '删除节点及引用…', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '删除块引用', exact: true }).click();

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(inlineReference).toHaveCount(1);
  await expect(inlineReference).toHaveAttribute('data-reference-status', 'trashed');
});

test('Hard delete removes block References while retaining the target identity in Trash', async ({ page }) => {
  await page.goto('/editor');
  await addBlockReferenceFromEmptyNode(page, 'Plate 文档是唯一真相源。');
  const blockReference = page.getByRole('button', { name: '打开 Plate 文档是唯一真相源。' });
  await expect(blockReference).toBeVisible();

  await page.getByRole('button', { name: '聚焦 节点：Plate 文档是唯一真相源。' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '删除节点及引用…', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '删除块引用', exact: true }).click();

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开 Plate 文档是唯一真相源。' })).toHaveCount(0);
});
