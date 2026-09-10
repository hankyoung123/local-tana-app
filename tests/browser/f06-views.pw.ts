import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

function render(type: string) {
  return execFileSync('bun', ['tests/browser/render-view-fixture.tsx', type], { encoding: 'utf8' });
}

test('List, Tabs and Side menu render the same canonical source projection', async ({ page }) => {
  for (const type of ['list', 'tabs', 'side-menu']) {
    await page.setContent(`<main>${render(type)}</main>`);
    const navigation = page.getByRole('navigation', { name: '视图导航' });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('button', { name: /^打开 candidate/ })).toHaveCount(1);
  }
});

test('Calendar renders an undated bucket instead of deriving an event from arbitrary Node time', async ({ page }) => {
  await page.setContent(`<main>${render('calendar')}</main>`);
  await expect(page.getByText(/未安排/)).toBeVisible();
  await expect(page.getByText('candidate', { exact: false })).toBeVisible();
});
