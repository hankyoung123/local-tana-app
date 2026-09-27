import type {
  NodeId,
  TanaSidebarMode,
  TanaSidebarTopItem,
  TanaWorkspaceUi,
} from "./types";

export const TANA_SIDEBAR_DEFAULT_WIDTH = 224;
export const TANA_SIDEBAR_MIN_WIDTH = 176;
export const TANA_SIDEBAR_MAX_WIDTH = 420;

export const TANA_SIDEBAR_TOP_ITEMS: readonly TanaSidebarTopItem[] = [
  "today",
  "create-new",
  "search",
  "quick-add",
  "supertags",
  "recents",
];

export const DEFAULT_TANA_SIDEBAR_TOP_ITEMS: readonly TanaSidebarTopItem[] = [
  "today",
  "create-new",
  "search",
  "quick-add",
  "supertags",
  "recents",
];

export function clampTanaSidebarWidth(width: unknown): number {
  const value =
    typeof width === "number" && Number.isFinite(width)
      ? Math.round(width)
      : TANA_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(
    TANA_SIDEBAR_MAX_WIDTH,
    Math.max(TANA_SIDEBAR_MIN_WIDTH, value),
  );
}

export function normalizeTanaSidebarTopItems(
  items: unknown,
): TanaSidebarTopItem[] {
  if (!Array.isArray(items)) return [...DEFAULT_TANA_SIDEBAR_TOP_ITEMS];
  const result: TanaSidebarTopItem[] = [];
  for (const item of items) {
    if (
      typeof item === "string" &&
      (TANA_SIDEBAR_TOP_ITEMS as readonly string[]).includes(item) &&
      !result.includes(item as TanaSidebarTopItem)
    ) {
      result.push(item as TanaSidebarTopItem);
    }
  }
  return result;
}

export function normalizeTanaWorkspaceUi(value: unknown): TanaWorkspaceUi {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      sidebar: {
        mode: "full",
        width: TANA_SIDEBAR_DEFAULT_WIDTH,
        topItems: [...DEFAULT_TANA_SIDEBAR_TOP_ITEMS],
        pinnedNodeIds: [],
      },
      quickAddDraft: "",
    };
  }
  const source = value as Record<string, unknown>;
  const sidebarSource = source.sidebar;
  const sidebar =
    sidebarSource &&
    typeof sidebarSource === "object" &&
    !Array.isArray(sidebarSource)
      ? (sidebarSource as Record<string, unknown>)
      : undefined;
  const mode: TanaSidebarMode =
    sidebar?.mode === "mini" || sidebar?.mode === "hidden"
      ? sidebar.mode
      : "full";
  const pinnedNodeIds = Array.isArray(sidebar?.pinnedNodeIds)
    ? sidebar.pinnedNodeIds.filter(
        (id): id is NodeId => typeof id === "string" && id.length > 0,
      )
    : [];
  const quickAddDraft =
    typeof source.quickAddDraft === "string" ? source.quickAddDraft : "";
  return {
    sidebar: {
      mode,
      width: clampTanaSidebarWidth(sidebar?.width),
      topItems: normalizeTanaSidebarTopItems(sidebar?.topItems),
      pinnedNodeIds: [...new Set(pinnedNodeIds)],
    },
    quickAddDraft,
  };
}

export function mergeTanaWorkspaceUi(
  current: TanaWorkspaceUi | undefined,
  patch: Partial<TanaWorkspaceUi> & {
    sidebar?: Partial<NonNullable<TanaWorkspaceUi["sidebar"]>>;
  },
): TanaWorkspaceUi {
  const normalized = normalizeTanaWorkspaceUi(current);
  const sidebarPatch = patch.sidebar;
  return {
    ...normalized,
    ...patch,
    quickAddDraft: patch.quickAddDraft ?? normalized.quickAddDraft,
    sidebar: {
      ...normalized.sidebar,
      ...sidebarPatch,
      width: clampTanaSidebarWidth(
        sidebarPatch?.width ?? normalized.sidebar?.width,
      ),
      topItems: normalizeTanaSidebarTopItems(
        sidebarPatch?.topItems ?? normalized.sidebar?.topItems,
      ),
      pinnedNodeIds: [
        ...new Set(
          (
            sidebarPatch?.pinnedNodeIds ??
            normalized.sidebar?.pinnedNodeIds ??
            []
          ).filter(
            (id): id is NodeId => typeof id === "string" && id.length > 0,
          ),
        ),
      ],
    },
  };
}
