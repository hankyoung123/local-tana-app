import { expect, test } from '@playwright/test';

test('STILL geometry follows the shared contract and docks properties on wide windows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await expect(page.locator('[data-slate-editor]')).toBeVisible();
  await expect(page.getByTestId('tana-sidebar')).toHaveCSS('width', '240px');
  await expect(page.getByRole('toolbar')).toHaveCSS('height', '52px');
  await expect(page.locator('.tana-workspace-shell')).toHaveCSS('border-radius', '17px');
  await expect(page.locator('.tana-workspace-main')).toHaveCSS('border-radius', '13px');
  await expect(page.locator('.tana-editor-column').first()).toHaveCSS('width', '740px');
  await page.getByRole('button', { name: '查看 项目 属性', exact: true }).click();
  await expect.poll(async () => {
    const work = await page.locator('.tana-workspace-main').boundingBox();
    const panel = await page.getByRole('complementary', { name: '检查器' }).boundingBox();
    return Math.round(panel!.x - work!.x - work!.width);
  }).toBe(8);
  const work = await page.locator('.tana-workspace-main').boundingBox();
  const panel = await page.getByRole('complementary', { name: '检查器' }).boundingBox();
  expect(panel!.y).toBe(work!.y);
});

test('Opening tag properties preserves the page and returns the Plate caret on dismissal', async ({ page }) => {
  await page.goto('/editor?node=node-project-example');
  const editor = page.locator('[data-slate-editor]');
  await editor.getByText('示例', { exact: true }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const original = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor?.parentElement;
    const row = element?.closest('[data-slate-node="element"]');
    if (!range || !row) return null;
    range.selectNodeContents(row);
    range.setEnd(selection!.anchorNode!, selection!.anchorOffset);
    return range.toString();
  });
  expect(original).not.toBeNull();
  const url = page.url();
  await page.getByRole('button', { name: '查看 项目 属性', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '检查器' }).getByRole('heading', { name: '示例', exact: true })).toBeVisible();
  await expect(page).toHaveURL(url);
  await page.getByRole('button', { name: '关闭检查器' }).click();
  await expect(editor).toBeFocused();
  const restored = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor?.parentElement;
    const row = element?.closest('[data-slate-node="element"]');
    if (!range || !row) return null;
    range.selectNodeContents(row);
    range.setEnd(selection!.anchorNode!, selection!.anchorOffset);
    return range.toString();
  });
  expect(restored).toEqual(original);
});

test('Inline properties save into the canonical Plate document and option creation is on demand', async ({ page }) => {
  await page.goto('/editor?node=node-project-example');
  await page.getByRole('button', { name: '查看 项目 属性', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '检查器' });
  await panel.getByRole('textbox', { name: '摘要属性值' }).fill('STILL property saved');
  await expect(page.locator('[data-slate-editor]')).toContainText('STILL property saved');
  await expect(page.getByRole('textbox', { name: '新建选项', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: '添加字段选项', exact: true }).click();
  await page.getByRole('textbox', { name: '新建选项', exact: true }).fill('STILL新选项');
  await page.getByRole('button', { name: '创建并选择新选项' }).click();
  await expect(panel.getByRole('combobox', { name: '状态字段值' })).toContainText('STILL新选项');
  await expect(page.getByRole('textbox', { name: '新建选项', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-slate-editor]')).toContainText('STILL property saved');
  await expect(page.locator('[data-slate-editor]').getByRole('combobox', { name: '状态字段值' })).toContainText('STILL新选项');
});

test('Focus mode keeps context and an inspector request exits focus mode correctly', async ({ page }) => {
  await page.goto('/editor?node=node-project-example');
  const url = page.url();
  await page.getByRole('button', { name: '查看 项目 属性', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+Shift+f');
  await expect(page.getByTestId('tana-sidebar')).toBeHidden();
  await expect(page.getByRole('complementary', { name: '检查器' })).toBeHidden();
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('button', { name: '退出专注模式', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '展开导航', exact: true }).click();
  await expect(page.getByTestId('tana-sidebar')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '检查器' })).toBeVisible();
  await expect(page).toHaveURL(url);
  await page.keyboard.press('ControlOrMeta+Shift+f');
  await page.getByRole('button', { name: '打开配置面板' }).click();
  await expect(page.getByTestId('tana-sidebar')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '检查器' })).toBeVisible();
  await expect(page).toHaveURL(url);
});

test('Narrow navigation closes after a destination and properties overlay without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 850 });
  await page.goto('/editor');
  await expect(page.getByTestId('tana-sidebar')).toBeHidden();
  await page.getByRole('button', { name: '展开导航', exact: true }).click();
  await expect(page.getByTestId('tana-sidebar')).toBeVisible();
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await expect(page.getByTestId('tana-sidebar')).toBeHidden();
  await page.getByRole('button', { name: '查看 项目 属性', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '检查器' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Explicit theme overrides the system and persists through reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/editor');
  await page.getByRole('button', { name: '切换明暗主题' }).click();
  await page.getByRole('menuitem', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await expect(page.locator('.tana-workspace-main')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await page.getByRole('button', { name: '切换明暗主题' }).click();
  await page.getByRole('menuitem', { name: '跟随系统', exact: true }).click();
  await expect(page.locator('.tana-workspace-main')).toHaveCSS('background-color', 'rgb(28, 28, 30)');
});
