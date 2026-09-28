import { expect, test, type Page } from '@playwright/test';

const firstNodeTitle = 'Plate 提供编辑器能力，Local Tana 只补充语义。';

function canonicalNodeCount(page: Page) {
  return page.locator('[data-tana-semantic]').count();
}

test('Node bullet opens the canonical page and reload restores the deep link', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: `聚焦 节点：${firstNodeTitle}` }).click();

  await expect(page).toHaveURL(/\/editor\?node=/);
  await expect(page.getByRole('navigation', { name: '路径导航' })).toContainText(firstNodeTitle);

  const deepLink = page.url();
  await page.reload();
  await expect(page).toHaveURL(deepLink);
  await expect(page.getByRole('navigation', { name: '路径导航' })).toContainText(firstNodeTitle);
});

test('empty page navigation stays read-only until the body affordance is activated', async ({ page }) => {
  await page.goto('/editor');
  const editor = page.locator('[data-slate-editor]');
  await editor.getByText(firstNodeTitle, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');

  await page.keyboard.press('ControlOrMeta+.');
  await expect(page.getByRole('button', { name: '输入内容…' })).toBeVisible();
  expect(await canonicalNodeCount(page)).toBe(1);

  await page.getByRole('button', { name: '输入内容…' }).click();
  await page.keyboard.type('F09 lazy body');
  await expect(editor).toContainText('F09 lazy body');
  expect(await canonicalNodeCount(page)).toBe(2);
});

test('search navigation shares history with Node pages', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: `聚焦 节点：${firstNodeTitle}` }).click();
  const navigation = page.getByRole('navigation', { name: '路径导航' });
  await expect(navigation).toContainText(firstNodeTitle);

  await page.keyboard.press('ControlOrMeta+s');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: '搜索所有节点' }).fill('全部项目');
  await dialog.getByText('全部项目', { exact: true }).click();
  await expect(navigation).toContainText('全部项目');

  await page.getByRole('button', { name: '返回上一页' }).click();
  await expect(navigation).toContainText(firstNodeTitle);
  await expect(navigation).not.toContainText('全部项目');
});

test('location breadcrumbs navigate through canonical ancestors', async ({ page }) => {
  await page.goto('/editor');
  await page
    .getByRole('button', { name: '聚焦 节点：Plate 文档是唯一真相源。' })
    .click();

  const navigation = page.getByRole('navigation', { name: '路径导航' });
  await expect(navigation).toContainText('主页');
  await expect(navigation).toContainText(firstNodeTitle);
  await expect(navigation).toContainText('Plate 文档是唯一真相源。');

  await navigation
    .getByRole('button', { name: firstNodeTitle })
    .click();
  await expect(navigation).toContainText(firstNodeTitle);
  await expect(navigation).not.toContainText('Plate 文档是唯一真相源。');
});
