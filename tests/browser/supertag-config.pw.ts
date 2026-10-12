import { expect, test } from '@playwright/test';

test('Supertag configuration targets the definition after navigating away from a Plate selection', async ({ page }) => {
  await page.goto('/editor');
  await page.locator('[data-slate-editor]').getByText(
    'Plate 提供编辑器能力，Local Tana 只补充语义。',
    { exact: true },
  ).click();
  await page.getByRole('button', { name: /^#项目/ }).click();
  await expect(page).toHaveURL(/node=supertag-project/);
  await expect(page.getByRole('heading', { name: '项目', exact: true })).toBeVisible();

  // The toolbar must not inspect the caret left behind in the hidden outline.
  await page.getByRole('button', { name: '打开配置面板', exact: true }).click();
  const configuration = page.getByRole('complementary', { name: '超级标签配置' });
  await expect(configuration.getByRole('heading', { name: '项目', exact: true })).toBeVisible();
  await expect(configuration.getByRole('tab', { name: '字段', exact: true })).toHaveAttribute('data-state', 'active');
  await configuration.getByRole('button', { name: '关闭检查器' }).click();
  await expect(configuration).toHaveCount(0);

  // The visible entry reopens the same canonical definition without navigation.
  await page.getByRole('button', { name: '配置超级标签', exact: true }).click();
  await expect(configuration.getByRole('heading', { name: '项目', exact: true })).toBeVisible();
  await configuration.getByRole('tab', { name: '继承', exact: true }).click();
  await expect(configuration.getByRole('heading', { name: '继承超级标签' })).toBeVisible();
  await configuration.getByRole('tab', { name: '设置', exact: true }).click();
  await expect(configuration.getByText('默认子超级标签', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/node=supertag-project/);
  await expect(page.locator('table')).toBeVisible();
});

test('Supertag field settings expose template behavior and option management in place', async ({ page }) => {
  await page.goto('/editor?node=supertag-project');
  await page.getByRole('button', { name: '配置超级标签', exact: true }).click();

  const configuration = page.getByRole('complementary', { name: '超级标签配置' });
  await configuration.getByRole('tab', { name: '字段', exact: true }).click();
  await configuration.getByRole('button', { name: '配置字段 摘要', exact: true }).click();
  await expect(configuration.getByText('字段类型', { exact: true })).toBeVisible();
  await expect(configuration.getByLabel('设为可选字段')).toBeVisible();
  await expect(configuration.getByLabel('设为置顶字段')).toBeVisible();
  await expect(configuration.getByText('默认值', { exact: true })).toBeVisible();
  await expect(configuration.getByLabel('模板默认值')).toBeVisible();

  const fieldType = configuration.getByRole('combobox', { name: '字段类型', exact: true });
  await fieldType.click();
  await page.getByRole('option', { name: '邮箱', exact: true }).click();
  const emailDefault = configuration.getByLabel('模板默认邮箱');
  await expect(emailDefault).toHaveAttribute('type', 'email');
  await emailDefault.fill('first@example.com');
  await emailDefault.press('Tab');
  await configuration.getByRole('button', { name: '收起字段 摘要', exact: true }).click();
  await configuration.getByRole('button', { name: '配置字段 摘要', exact: true }).click();
  await expect(configuration.getByLabel('模板默认邮箱')).toHaveValue('first@example.com');

  await configuration.getByLabel('模板默认邮箱').fill('updated@example.com');
  await configuration.getByLabel('模板默认邮箱').press('Tab');
  await configuration.getByRole('button', { name: '收起字段 摘要', exact: true }).click();
  await configuration.getByRole('button', { name: '配置字段 摘要', exact: true }).click();
  await expect(configuration.getByLabel('模板默认邮箱')).toHaveValue('updated@example.com');

  await configuration.getByRole('combobox', { name: '字段类型', exact: true }).click();
  await page.getByRole('option', { name: '网址', exact: true }).click();
  await expect(configuration.getByLabel('模板默认网址')).toHaveAttribute('type', 'url');

  await configuration.getByRole('button', { name: '收起字段 摘要', exact: true }).click();
  await configuration.getByRole('button', { name: '配置字段 预估', exact: true }).click();
  const numberDefault = configuration.getByLabel('模板默认数字');
  await expect(numberDefault).toHaveAttribute('type', 'number');
  await expect(numberDefault).toHaveAttribute('step', 'any');
  await numberDefault.fill('4.5');
  await numberDefault.press('Tab');
  await configuration.getByRole('button', { name: '收起字段 预估', exact: true }).click();
  await configuration.getByRole('button', { name: '配置字段 预估', exact: true }).click();
  await expect(configuration.getByLabel('模板默认数字')).toHaveValue('4.5');

  await configuration.getByRole('button', { name: '收起字段 预估', exact: true }).click();
  await configuration.getByRole('button', { name: '配置字段 截止日期', exact: true }).click();
  await expect(configuration.getByLabel('模板默认日期')).toHaveAttribute('type', 'text');
  await expect(configuration.getByLabel('模板默认日期')).toHaveAttribute('placeholder', /YYYY-Www/);
  await expect(configuration.getByLabel('选择默认日期')).toBeVisible();
  await configuration.getByLabel('模板默认日期').fill('2026-W41');
  await configuration.getByLabel('模板默认日期').press('Tab');
  await configuration.getByRole('button', { name: '收起字段 截止日期', exact: true }).click();
  await configuration.getByRole('button', { name: '配置字段 截止日期', exact: true }).click();
  await expect(configuration.getByLabel('模板默认日期')).toHaveValue('2026-W41');

  await configuration.getByRole('button', { name: '配置字段 状态', exact: true }).click();
  await expect(configuration.getByLabel('默认选项')).toBeVisible();
  await expect(configuration.getByLabel('新增选项')).toBeVisible();
  await expect(configuration.getByRole('button', { name: '添加选项', exact: true })).toBeVisible();

  await configuration.getByRole('button', { name: '配置字段 进行中', exact: true }).click();
  await expect(configuration.getByLabel('默认复选框值')).toBeVisible();
  await expect(configuration.getByText('完成状态映射', { exact: true })).toBeVisible();
  await expect(configuration.getByRole('combobox', { name: '勾选时完成状态', exact: true })).toBeVisible();
  await expect(configuration.getByRole('combobox', { name: '取消勾选时完成状态', exact: true })).toBeVisible();
  await configuration.getByRole('combobox', { name: '勾选时完成状态', exact: true }).click();
  await page.getByRole('option', { name: '已完成', exact: true }).click();
  await expect(configuration.getByRole('combobox', { name: '勾选时完成状态', exact: true })).toContainText('已完成');

  await configuration.getByRole('button', { name: '配置字段 负责人', exact: true }).click();
  await expect(configuration.getByLabel('默认关联节点')).toBeVisible();
});

test('removing a Supertag field removes its template binding from field settings', async ({ page }) => {
  await page.goto('/editor?node=supertag-project');
  await page.getByRole('button', { name: '配置超级标签', exact: true }).click();

  const configuration = page.getByRole('complementary', { name: '超级标签配置' });
  await configuration.getByRole('tab', { name: '字段', exact: true }).click();
  await expect(configuration.getByRole('button', { name: '配置字段 摘要', exact: true })).toBeVisible();

  await configuration.getByRole('button', { name: '从超级标签移除字段 摘要', exact: true }).click();

  await expect(configuration.getByRole('button', { name: '配置字段 摘要', exact: true })).toHaveCount(0);
  await expect(configuration.getByRole('button', { name: '配置字段 预估', exact: true })).toBeVisible();
});
