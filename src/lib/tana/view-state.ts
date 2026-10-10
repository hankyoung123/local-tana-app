import type {
  TanaViewDefinition,
  TanaViewState,
  TanaViewType,
} from './types';

const STATE_KEYS = [
  'calendarDateFieldIds',
  'filter',
  'groupFieldId',
  'pagination',
  'sort',
  'visibleFieldIds',
] as const;

function pickLegacyState(definition: TanaViewDefinition): TanaViewState {
  const state: TanaViewState = {};
  for (const key of STATE_KEYS) {
    const value = definition[key];
    if (value !== undefined) {
      state[key] = value as never;
    }
  }
  return state;
}

/** Reads new per-type settings and falls back to the legacy flat shape. */
export function getTanaViewState(
  definition: TanaViewDefinition | undefined,
  type = definition?.type,
): TanaViewState {
  if (!definition || !type) return {};
  return definition.states?.[type] ?? pickLegacyState(definition);
}

/** Writes a presentation patch into one renderer's saved state. */
export function writeTanaViewState(
  definition: TanaViewDefinition,
  type: TanaViewType,
  patch: Partial<TanaViewState>,
): TanaViewDefinition {
  const current = getTanaViewState(definition, type);
  const next: TanaViewState = { ...current, ...patch };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete (next as Record<string, unknown>)[key];
  }

  return {
    type: definition.type,
    ...(definition.toolbarVisible === undefined
      ? {}
      : { toolbarVisible: definition.toolbarVisible }),
    states: {
      ...(definition.states ?? {}),
      [type]: next,
    },
  };
}

/** Changes renderer type without copying another renderer's settings. */
export function setTanaViewType(
  definition: TanaViewDefinition,
  type: TanaViewType,
): TanaViewDefinition {
  const current = getTanaViewState(definition, definition.type);
  return {
    type,
    ...(definition.toolbarVisible === undefined
      ? {}
      : { toolbarVisible: definition.toolbarVisible }),
    states: {
      ...(definition.states ?? {}),
      [definition.type]: current,
    },
  };
}
