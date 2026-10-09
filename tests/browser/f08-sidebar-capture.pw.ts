import { expect, test } from "@playwright/test";

test("Toolbar owns navigation visibility without duplicate sidebar controls", async ({
  page,
}) => {
  await page.goto("/editor");
  const sidebar = page.getByTestId("tana-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /导航/ })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: /专注模式/ })).toHaveCount(0);
  await page.getByRole("button", { name: "侧栏设置" }).click();
  await expect(page.getByRole("button", { name: "完整", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "迷你", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "隐藏", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "收起导航", exact: true }).click();
  await expect(page.getByTestId("tana-sidebar")).toHaveCount(0);
  await page.getByRole("button", { name: "展开导航", exact: true }).click();
  await expect(page.getByTestId("tana-sidebar")).toBeVisible();
});

test("Legacy mini sidebar preferences keep full navigation and the shared toggle", async ({ page }) => {
  await page.goto("/editor");
  await page.getByRole("button", { name: "收起导航", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const raw = sessionStorage.getItem("local-tana:plate-document");
    return raw ? JSON.parse(raw)[0]?.tanaWorkspaceUi?.sidebar?.mode : null;
  })).toBe("hidden");
  await page.evaluate(() => {
    const key = "local-tana:plate-document";
    const document = JSON.parse(sessionStorage.getItem(key)!);
    document[0].tanaWorkspaceUi.sidebar.mode = "mini";
    sessionStorage.setItem(key, JSON.stringify(document));
  });
  await page.reload();
  await expect(page.getByTestId("tana-sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: "收起导航", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "收起导航", exact: true }).click();
  await expect(page.getByTestId("tana-sidebar")).toHaveCount(0);
  await page.getByRole("button", { name: "展开导航", exact: true }).click();
  await expect(page.getByTestId("tana-sidebar")).toBeVisible();
});

test("Sidebar stays a navigation surface instead of duplicating the Plate outline", async ({ page }) => {
  await page.goto("/editor");
  const sidebar = page.getByTestId("tana-sidebar");
  await expect(sidebar.getByRole("button", { name: "主页", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "全部节点", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByText("Plate 提供编辑器能力，Local Tana 只补充语义。", { exact: true })).toHaveCount(0);
  await expect(page.locator(".tana-page-header")).toHaveCount(0);
  await expect(page.locator("[data-slate-editor]")).toContainText("Plate 提供编辑器能力，Local Tana 只补充语义。");
});

test("Sidebar resize and top item visibility are canonical preferences", async ({
  page,
}) => {
  await page.goto("/editor");
  const sidebar = page.getByTestId("tana-sidebar");
  const before = await sidebar.boundingBox();
  expect(before).not.toBeNull();
  const resizer = page.getByTestId("sidebar-resizer");
  await resizer.hover();
  await page.mouse.down();
  await page.mouse.move(300, 300);
  await page.mouse.up();
  const after = await sidebar.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width);
  await page.reload();
  await expect(page.getByTestId("tana-sidebar")).toHaveCSS("width", `${after!.width}px`);

  await page.getByRole("button", { name: "侧栏设置" }).click();
  await page.getByRole("button", { name: "隐藏 今日笔记" }).click();
  await expect(page.getByTestId("sidebar-today")).toHaveCount(0);
  await page.getByRole("button", { name: "显示 今日笔记" }).click();
  await expect(page.getByTestId("sidebar-today")).toBeVisible();
});

test("Create New creates a focused ordinary Today child", async ({ page }) => {
  await page.goto("/editor");
  await page
    .locator("[data-slate-editor]")
    .getByText("Plate 提供编辑器能力，Local Tana 只补充语义。", {
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "新建节点", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "路径导航" }),
  ).toContainText("未命名节点");
  await expect(page.locator("[data-slate-editor]")).toBeFocused();
});

test("Quick Add preserves a draft on Escape and commits without navigating from the current page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 120)));
  await page.goto("/editor");
  const editor = page.locator("[data-slate-editor]");
  await page
    .locator("[data-slate-editor]")
    .getByText("Plate 提供编辑器能力，Local Tana 只补充语义。", {
      exact: true,
    })
    .click();
  await page.keyboard.press("ControlOrMeta+.");
  await expect(
    page.getByRole("navigation", { name: "路径导航" }),
  ).toContainText("Plate 提供编辑器能力");
  await page.keyboard.press("ControlOrMeta+e");
  const input = page.locator('[data-slate-editor][aria-label="Quick Add 草稿"]');
  await expect(input).toBeVisible();
  await input.click();
  await page.keyboard.type("F08 quick capture");
  await expect(input).toContainText("F08 quick capture");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+e");
  await expect(input).toContainText("F08 quick capture");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(input).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "路径导航" }),
  ).toContainText("Plate 提供编辑器能力");
  await expect(editor).toBeVisible();
  expect(errors).toEqual([]);
});

test("Global Search uses ControlOrMeta+S", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.locator("[data-slate-editor]")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "搜索所有节点" }),
  ).toBeVisible();
});

test('Command palette uses the shared workspace command registry', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.locator('[data-slate-editor]')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+P');
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('新建节点', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('option', { name: /新建节点/ }).click();
  await expect(page.getByRole('navigation', { name: '路径导航' })).toContainText('未命名节点');
  await expect(page.locator('[data-slate-editor]')).toBeFocused();
});

test("block context menu pins a canonical node once and exposes it in Sidebar", async ({
  page,
}) => {
  await page.goto("/editor");
  const node = page
    .locator("[data-slate-editor]")
    .getByText("Plate 提供编辑器能力，Local Tana 只补充语义。", {
      exact: true,
    });
  await node.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "固定到侧栏", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "固定到侧栏", exact: true }).click();
  await expect(page.getByRole("heading", { name: "固定" })).toBeVisible();
  await expect(page.getByTestId("tana-sidebar")).toContainText(
    "Plate 提供编辑器能力",
  );
  await node.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "取消固定到侧栏", exact: true }),
  ).toBeVisible();
});

test("Pinned Search expands live canonical results through the shared Toggle state", async ({
  page,
}) => {
  await page.goto("/editor");
  const searchNode = page
    .locator("[data-slate-editor]")
    .getByText("全部项目", { exact: true });
  await searchNode.click({ button: "right" });
  await page.getByRole("menuitem", { name: "固定到侧栏", exact: true }).click();

  const sidebar = page.getByTestId("tana-sidebar");
  await expect(sidebar.getByText("全部项目", { exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name: "展开 (1)" }).click();
  await expect(
    sidebar.getByText("示例 ", { exact: false }).first(),
  ).toBeVisible();
});

test("Recents is derived from entity nodes and excludes Field and Value children", async ({
  page,
}) => {
  await page.goto("/editor");
  await page.getByRole("button", { name: /最近/ }).click();
  const sidebar = page.getByTestId("tana-sidebar");
  await expect(sidebar.getByText("全部项目", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("截止日期", { exact: true })).toHaveCount(0);
});

test("browser clipper surface stays a transient composer without desktop shortcut registration", async ({
  page,
}) => {
  await page.goto("/clipper");
  await expect(
    page.getByRole("textbox", { name: "Global Capture 草稿" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeDisabled();
  const editor = page.locator('[data-slate-editor][aria-label="Global Capture 草稿"]');
  await editor.click();
  await page.keyboard.type("#");
  await expect(page.locator('input[role="combobox"]')).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await editor.fill("");
  await editor.click();
  await page.keyboard.type("@");
  await expect(page.locator('input[role="combobox"]')).toHaveAttribute("aria-expanded", "true");
});
