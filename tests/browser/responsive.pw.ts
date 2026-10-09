import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

for (const width of [760, 1000, 1440]) {
  test(`Inspector and Sidebar fit ${width}px with one navigation toggle`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/editor');
    const editor = page.locator('[data-slate-editor]');
    await expect(editor).toBeVisible();
    await page.getByRole('button', { name: '打开配置面板' }).click();
    const inspector = page.getByRole('complementary', { name: '检查器' });
    await expect(inspector).toBeVisible();
    const inspectorBox = await inspector.boundingBox();
    expect(inspectorBox).not.toBeNull();
    // The editor is intentionally capped for comfortable reading on wide
    // windows, so panel width is verified directly instead of inferred from
    // the editor's remaining width.
    expect(inspectorBox!.width).toBeCloseTo(320, 0);
    await page.getByRole('button', { name: '关闭检查器' }).click();
    await expect(inspector).toHaveCount(0);
    if (width <= 800) {
      await expect(page.getByTestId('tana-sidebar')).toBeHidden();
      await page.getByRole('button', { name: '展开导航', exact: true }).click();
      await expect(page.getByTestId('tana-sidebar')).toBeVisible();
      const toggleBox = await page.getByRole('button', { name: '收起导航', exact: true }).boundingBox();
      const drawerBox = await page.getByTestId('tana-sidebar').boundingBox();
      expect(drawerBox!.y).toBeGreaterThanOrEqual(toggleBox!.y + toggleBox!.height);
      expect(drawerBox!.y + drawerBox!.height).toBeLessThanOrEqual(850);
      await page.getByRole('button', { name: '收起导航', exact: true }).click();
      await expect(page.getByTestId('tana-sidebar')).toBeHidden();
    } else {
      await page.getByRole('button', { name: '收起导航', exact: true }).click();
      await expect(page.getByTestId('tana-sidebar')).toHaveCount(0);
      await page.getByRole('button', { name: '展开导航', exact: true }).click();
      await expect(page.getByTestId('tana-sidebar')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Inspector width adjusts from its keyboard splitter and restores after reopening', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.goto('/editor');
  await page.getByRole('button', { name: '打开配置面板' }).click();

  const inspector = page.getByRole('complementary', { name: '检查器' });
  const initial = await inspector.boundingBox();
  expect(initial).not.toBeNull();

  const splitter = page.getByRole('separator', { name: '调整检查器宽度' });
  await splitter.focus();
  await page.keyboard.press('ArrowLeft');
  const widened = await inspector.boundingBox();
  expect(widened).not.toBeNull();
  expect(widened!.width).toBeGreaterThan(initial!.width);

  await page.getByRole('button', { name: '关闭检查器' }).click();
  await page.getByRole('button', { name: '打开配置面板' }).click();
  const restored = await inspector.boundingBox();
  expect(restored).not.toBeNull();
  expect(restored!.width).toBeCloseTo(widened!.width, 0);
});

test('Narrow toolbar keeps the current breadcrumb and moves ancestors into a menu', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 850 });
  await page.goto('/editor');
  await page.getByRole('button', { name: '聚焦 节点：Plate 文档是唯一真相源。' }).click();

  const navigation = page.getByRole('navigation', { name: '路径导航' });
  const overflow = navigation.getByRole('button', { name: /显示 .*个上级路径/ });
  await expect(overflow).toBeVisible();
  await expect(navigation).toContainText('Plate 文档是唯一真相源。');
  await overflow.click();
  await expect(page.getByRole('menu')).toContainText('上级路径');
});

test('Table and Cards keep overflow local and Cards expose native keyboard controls', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 850 });
  await page.goto('/editor');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll((links) =>
    links.map((link) => link.outerHTML).join(''));
  for (const type of ['table', 'cards']) {
    const html = execFileSync('bun', ['tests/browser/render-view-fixture.tsx', type], { encoding: 'utf8' });
    await page.setContent(`${styles}<main class="flex min-w-0 max-w-full">${html}</main>`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (type === 'table') {
      const table = page.locator('table');
      await expect(table).toBeVisible();
      expect(await table.evaluate((element) => element.parentElement!.scrollWidth > element.parentElement!.clientWidth)).toBe(true);
    }
  }
  const card = page.locator('article.tana-projectionCard').first();
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('role', 'button');
  await expect(card.locator('button input, button button, [role="button"] input')).toHaveCount(0);
  const title = card.getByRole('textbox');
  await title.focus();
  await expect(title).toBeFocused();
  const open = card.getByRole('button', { name: /^打开 / });
  await open.focus();
  await page.keyboard.press('Tab');
  await expect(title).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(open).toBeFocused();
});

test('Supertag token opens properties in place and its definition remains navigable', async ({ page }) => {
  await page.goto('/editor');
  const token = page.getByRole('button', { name: /^查看 .* 属性$/ }).first();
  await token.focus();
  await token.press('Enter');
  await expect(page.getByRole('complementary', { name: '检查器' })).toBeVisible();
  await page.getByRole('button', { name: '关闭检查器' }).click();
  await page.getByTestId('tana-sidebar').getByRole('button', { name: '#项目 1' }).click();
  await expect(page.getByRole('navigation', { name: '超级标签内容' })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^全部实例/ })).toHaveAttribute('aria-current', 'page');
});

test('STILL semantic surfaces follow the system dark appearance', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/editor');

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      canvas: styles.getPropertyValue('--still-canvas').trim(),
      text: styles.getPropertyValue('--still-text').trim(),
      accent: styles.getPropertyValue('--still-accent').trim(),
    };
  });

  expect(tokens.canvas).toBe('#1c1c1e');
  expect(tokens.text).toBe('#eaeaec');
  expect(tokens.accent).toBe('#a8b7cc');
  await expect(page.getByRole('complementary', { name: '侧栏' })).toBeVisible();
  await expect(page.getByRole('toolbar')).toBeVisible();
});
