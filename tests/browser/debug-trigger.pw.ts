import { test } from '@playwright/test';

test('debug trigger lifecycle', async ({ page }) => {
  const logs: unknown[] = [];
  await page.goto('/editor');
  await page.evaluate(() => {
    const events = ['keydown', 'keyup', 'beforeinput', 'input', 'selectionchange', 'focus', 'blur'];
    for (const name of events) {
      document.addEventListener(name, (event) => {
        const selection = window.getSelection();
        const target = event.target as HTMLElement | null;
        (window as any).__logs ??= [];
        (window as any).__logs.push({
          name,
          key: (event as KeyboardEvent).key,
          inputType: (event as InputEvent).inputType,
          data: (event as InputEvent).data,
          target: target?.tagName,
          role: target?.getAttribute('role'),
          active: document.activeElement?.tagName,
          activeRole: document.activeElement?.getAttribute('role'),
          anchorText: selection?.anchorNode?.textContent,
          anchorOffset: selection?.anchorOffset,
          collapsed: selection?.isCollapsed,
          inputs: document.querySelectorAll('input[role="combobox"]').length,
          editorText: document.querySelector('[data-slate-editor]')?.textContent,
        });
      }, true);
    }
  });
  const editor = page.locator('[data-slate-editor]');
  await editor.locator('[data-slate-string="true"]').filter({ hasText: 'Plate 文档是唯一真相源。' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Space');
  await page.keyboard.press('#');
  await page.waitForTimeout(100);
  logs.push(await page.evaluate(() => (window as any).__logs));
  console.log(JSON.stringify(logs, null, 2));
});
