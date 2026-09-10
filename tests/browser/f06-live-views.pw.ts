import { expect, test, type Page } from '@playwright/test';

/** Opens the real persisted Search + View sample through the user-facing dialog. */
async function openProjectsView(page: Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: /Search/ }).click();
  const input = page.getByRole('combobox', { name: '搜索所有节点' });
  await expect(input).toBeFocused();
  await input.fill('全部项目');
  await page.getByRole('option', { name: '全部项目' }).click();
  await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible();
}

async function chooseViewType(page: Page, label: '表格' | '卡片' | '日历' | '大纲') {
  const presentation = page.getByLabel('选择视图展示方式');
  await presentation.click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(presentation).toContainText(label);
}

test('F06 View chrome changes only presentation while retaining the shared Search source', async ({ page }) => {
  await openProjectsView(page);

  await chooseViewType(page, '表格');
  const table = page.locator('table');
  await expect(table).toBeVisible();
  const title = page.getByRole('textbox', { name: '编辑引用目标标题' });
  await title.fill('F06 Table title');
  await title.press('Tab');
  await expect(title).toHaveValue('F06 Table title');
  const due = page.getByRole('textbox', { name: '截止日期字段值' });
  await due.fill('2026-09-18');
  await due.press('Tab');
  await expect(due).toHaveValue('2026-09-18');
  const rowsBeforeAdd = await table.getByRole('row').count();
  await page.getByRole('button', { name: '添加行' }).click();
  // This is a Search + View. Add creates a canonical sibling and never adds
  // an ordinary child/result row below the Search owner.
  await expect(table.getByRole('row')).toHaveCount(rowsBeforeAdd);
  await page.getByRole('button', { name: '选择表格字段列' }).click();
  await page.getByRole('menuitemcheckbox', { name: '摘要' }).click();
  await expect(table.getByRole('columnheader', { name: '摘要' })).toHaveCount(0);
  await page.getByRole('button', { name: '添加表格字段列' }).click();
  await page.getByRole('menuitem', { name: '摘要' }).click();
  await expect(table.getByRole('columnheader', { name: '摘要' })).toBeVisible();
  await page.getByRole('button', { name: '添加表格字段列' }).click();
  await page.getByRole('menuitem', { name: '创建字段定义' }).click();
  await expect(table.getByRole('columnheader', { name: /新字段/ })).toBeVisible();

  await chooseViewType(page, '卡片');
  await expect(page.getByRole('button', { name: '添加卡片' })).toBeVisible();
  await expect(page.locator('input[value="F06 Table title"]')).toBeVisible();

  await chooseViewType(page, '日历');
  await expect(page.getByLabel('日历范围')).toBeVisible();
  await expect(page.getByRole('button', { name: '添加' })).toHaveCount(30);
  const september18 = page.getByRole('heading', { name: /2026年9月18日/ }).locator('..');
  const september19 = page.getByRole('heading', { name: /2026年9月19日/ }).locator('..');
  await expect(september18.getByText('F06 Table title', { exact: true })).toBeVisible();
  // Exercise the real calendar DnD payload. It carries the exact Date Field
  // that created the entry, so a move cannot update a different Date Field.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await september18.getByText('F06 Table title', { exact: true }).dispatchEvent('dragstart', { dataTransfer: transfer });
  await september19.dispatchEvent('dragover', { dataTransfer: transfer });
  await september19.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(september19.getByText('F06 Table title', { exact: true })).toBeVisible();
  await expect(september18.getByText('F06 Table title', { exact: true })).toHaveCount(0);
  await page.getByLabel('选择日历日期字段').click();
  await page.getByRole('menuitemcheckbox', { name: '截止日期' }).click();
  await expect(page.getByText(/未安排 · 1/)).toBeVisible();
  await expect(page.getByText('F06 Table title', { exact: true })).toBeVisible();

  await chooseViewType(page, '大纲');
  await expect(page.getByLabel('选择显示字段')).toBeVisible();
  await expect(page.getByLabel('排序视图结果')).toBeVisible();
  await page.getByLabel('排序视图结果').click();
  await expect(page.getByLabel('添加排序条件')).toBeVisible();
});

test('F06 filters and multi-sort use the real toolbar controls', async ({ page }) => {
  await openProjectsView(page);
  await page.getByLabel('筛选视图').click();
  await expect(page.getByLabel('筛选匹配方式')).toContainText('匹配全部');
  await page.getByLabel('筛选匹配方式').click();
  await page.getByRole('option', { name: '匹配任意' }).click();
  await expect(page.getByLabel('筛选匹配方式')).toContainText('匹配任意');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: '筛选视图' })).toHaveCount(0);

  await page.getByLabel('排序视图结果').click();
  await page.getByLabel('添加排序条件').click();
  await page.getByRole('option', { name: '标题 ↑' }).click();
  await expect(page.getByRole('combobox', { name: '排序条件 1' })).toContainText('标题 ↑');
  await page.getByLabel('添加排序条件').click();
  await page.getByRole('option', { name: '摘要 ↑' }).click();
  await expect(page.getByRole('combobox', { name: '排序条件 2' })).toContainText('摘要 ↑');
  await page.getByRole('button', { name: '下移排序条件 1' }).click();
  await expect(page.getByRole('combobox', { name: '排序条件 1' })).toContainText('摘要 ↑');
  await page.getByRole('button', { name: '移除排序条件 2' }).click();
  await expect(page.getByRole('combobox', { name: '排序条件 2' })).toHaveCount(0);
});
