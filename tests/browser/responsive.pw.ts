import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

for (const width of [760, 1000, 1440]) {
  test(`Inspector and Sidebar fit ${width}px while preserving manual collapse`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/editor');
    const editor = page.locator('[data-slate-editor]');
    await expect(editor).toBeVisible();
    const before = await editor.boundingBox();
    await page.getByRole('button', { name: '更多页面操作' }).click();
    await page.getByRole('menuitem', { name: '配置…', exact: true }).click();
    const inspector = page.getByRole('complementary', { name: '检查器' });
    await expect(inspector).toBeVisible();
    const after = await editor.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (width < 1280) expect(after!.width).toBeCloseTo(before!.width, 0);
    else expect(before!.width - after!.width).toBeCloseTo(320, 0);
    await page.getByRole('button', { name: '关闭检查器' }).click();
    await expect(inspector).toHaveCount(0);
    await page.getByRole('button', { name: '收起导航' }).click();
    const collapsed = page.getByRole('button', { name: '展开导航' }).locator('xpath=ancestor::aside');
    expect((await collapsed.boundingBox())!.width).toBe(40);
    await page.setViewportSize({ width: width + 50, height: 850 });
    expect((await collapsed.boundingBox())!.width).toBe(40);
    await page.getByRole('button', { name: '展开导航' }).click();
    await expect(page.getByRole('button', { name: '收起导航' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

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

test('Supertag token has a navigation name and Supertag children use navigation semantics', async ({ page }) => {
  await page.goto('/editor');
  const token = page.getByRole('link', { name: /^打开超级标签 / }).first();
  await token.focus();
  await token.press('Enter');
  await expect(page.getByRole('navigation', { name: '超级标签内容' })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^全部实例/ })).toHaveAttribute('aria-current', 'page');
});
