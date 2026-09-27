import { expect, test } from "@playwright/test";

test("Sidebar cycles through full, mini, hidden and recovers", async ({
  page,
}) => {
  await page.goto("/editor");
  const sidebar = page.getByTestId("tana-sidebar");
  await expect(sidebar).toBeVisible();
  await page.getByRole("button", { name: "收起导航" }).click();
  await expect(page.getByTestId("tana-sidebar-mini")).toBeVisible();
  await page.getByRole("button", { name: "展开导航" }).click();
  await expect(sidebar).toBeVisible();
  await page.getByRole("button", { name: "侧栏设置" }).click();
  await page.getByRole("button", { name: "隐藏", exact: true }).click();
  await expect(page.getByTestId("tana-sidebar")).toHaveCount(0);
  await page.getByRole("button", { name: "恢复侧栏" }).click();
  await expect(page.getByTestId("tana-sidebar")).toBeVisible();
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

  await page.getByRole("button", { name: "侧栏设置" }).click();
  await page.getByRole("button", { name: "隐藏 Today" }).click();
  await expect(page.getByTestId("sidebar-today")).toHaveCount(0);
  await page.getByRole("button", { name: "显示 Today" }).click();
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
  await page.getByTestId("sidebar-create-new").click();
  await expect(
    page.getByRole("navigation", { name: "路径导航" }),
  ).toContainText("未命名节点");
  await expect(page.locator("[data-slate-editor]")).toBeFocused();
});

test("Quick Add preserves a draft on Escape and commits without navigating from the current page", async ({
  page,
}) => {
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
  const input = page.getByRole("textbox", { name: "Quick Add 草稿" });
  await expect(input).toBeVisible();
  await input.fill("F08 quick capture");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+e");
  await expect(input).toHaveValue("F08 quick capture");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(input).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "路径导航" }),
  ).toContainText("Plate 提供编辑器能力");
  await expect(editor).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Pinned" })).toBeVisible();
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
  await page.getByRole("button", { name: /Recents/ }).click();
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
    page.getByRole("button", { name: "添加", exact: true }),
  ).toBeDisabled();
});
