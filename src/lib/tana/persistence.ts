import type { Descendant, TElement, Value } from 'platejs';

import { isTauri } from '@tauri-apps/api/core';
import { KEYS } from 'platejs';

import {
  isTanaNodeElement,
  TANA_SUPERTAG_KEY,
} from './constants';
import { getTanaDirectChildPaths, getTanaParentPath } from './outliner';
import { isTanaDay } from './time';
import type { NodeId, TanaBlockElement } from './types';
import { validateWorkspaceStructure } from './workspace';

const DATABASE_URL = 'sqlite:local-tana.db';
const DOCUMENT_ID = 'main';

export const CURRENT_SCHEMA_VERSION = 6;

const TANA_SYSTEM_NODES = new Set([
  'workspace',
  'home',
  'daily-notes',
  'schema',
  'library',
  'settings',
  'trash',
]);

type DocumentRow = {
  schema_version: number;
  value: string;
};

type TableInfoRow = {
  name: string;
};

export type SaveLifecycleStatus = 'error' | 'saved' | 'saving';

export type DocumentSaveController = {
  flush: () => Promise<void>;
  schedule: (value: Value) => void;
};

let databasePromise:
  | Promise<import('@tauri-apps/plugin-sql').default>
  | undefined;

function isDescendant(value: unknown): value is Descendant {
  if (!value || typeof value !== 'object') return false;

  if ('text' in value) return typeof value.text === 'string';

  return (
    'type' in value &&
    typeof value.type === 'string' &&
    'children' in value &&
    Array.isArray(value.children) &&
    value.children.every(isDescendant)
  );
}

function isElement(value: Descendant): value is TElement {
  return 'children' in value && Array.isArray(value.children);
}

function hasValidSemanticData(element: TElement): boolean {
  const semantic = element as TElement & {
    tanaFieldDefinition?: unknown;
    tanaFieldId?: unknown;
    tanaFieldOptional?: unknown;
    tanaFieldPinned?: unknown;
    tanaFieldValueType?: unknown;
    tanaFieldValues?: unknown;
    tanaDefaultChildSupertagId?: unknown;
    tanaPresentation?: unknown;
    tanaReferenceTargetId?: unknown;
    tanaSearchDefinition?: unknown;
    tanaSupertagIds?: unknown;
    tanaSupertagDefinition?: unknown;
    tanaSystemNode?: unknown;
    tanaTime?: unknown;
    tanaViewDefinition?: unknown;
  };

  if (
    semantic.tanaDefaultChildSupertagId !== undefined &&
    (typeof semantic.tanaDefaultChildSupertagId !== 'string' ||
      semantic.tanaDefaultChildSupertagId.length === 0)
  ) {
    return false;
  }

  if (
    semantic.tanaFieldId !== undefined &&
    (typeof semantic.tanaFieldId !== 'string' || semantic.tanaFieldId.length === 0)
  ) {
    return false;
  }

  if (semantic.tanaFieldOptional !== undefined && semantic.tanaFieldOptional !== true) {
    return false;
  }

  if (semantic.tanaFieldPinned !== undefined && semantic.tanaFieldPinned !== true) {
    return false;
  }

  if (
    semantic.tanaReferenceTargetId !== undefined &&
    (typeof semantic.tanaReferenceTargetId !== 'string' ||
      semantic.tanaReferenceTargetId.length === 0)
  ) {
    return false;
  }

  if (
    semantic.tanaSupertagIds !== undefined &&
    (!Array.isArray(semantic.tanaSupertagIds) ||
      !semantic.tanaSupertagIds.every(
        (supertagId) => typeof supertagId === 'string' && supertagId.length > 0
      ) ||
      new Set(semantic.tanaSupertagIds).size !== semantic.tanaSupertagIds.length)
  ) {
    return false;
  }

  if (
    semantic.tanaSystemNode !== undefined &&
    (typeof semantic.tanaSystemNode !== 'string' ||
      !TANA_SYSTEM_NODES.has(semantic.tanaSystemNode))
  ) {
    return false;
  }

  if (semantic.tanaTime !== undefined) {
    const time = semantic.tanaTime as { unit?: unknown; value?: unknown };

    if (!time || time.unit !== 'day' || !isTanaDay(time.value)) return false;
  }

  // Field-as-Node is a schema break. Parent value maps and the previous
  // options array are never valid in the current schema and are reset rather
  // than migrated.
  if (semantic.tanaFieldValues !== undefined) return false;

  if (
    semantic.tanaFieldValueType !== undefined &&
    !isFieldType(semantic.tanaFieldValueType)
  ) {
    return false;
  }

  if (
    semantic.tanaFieldDefinition !== undefined &&
    !isFieldDefinition(semantic.tanaFieldDefinition)
  ) {
    return false;
  }

  if (semantic.tanaPresentation !== undefined) {
    const presentation = semantic.tanaPresentation as {
      hiddenFieldNodeIds?: unknown;
    };

    if (
      !presentation ||
      typeof presentation !== 'object' ||
      (presentation.hiddenFieldNodeIds !== undefined &&
        (!Array.isArray(presentation.hiddenFieldNodeIds) ||
          !presentation.hiddenFieldNodeIds.every(
            (fieldNodeId) =>
              typeof fieldNodeId === 'string' && fieldNodeId.length > 0
          ) ||
          new Set(presentation.hiddenFieldNodeIds).size !==
            presentation.hiddenFieldNodeIds.length))
    ) {
      return false;
    }
  }

  if (semantic.tanaSupertagDefinition !== undefined) {
    const definition = semantic.tanaSupertagDefinition as {
      defaultChildSupertagId?: unknown;
      extends?: unknown;
      titleExpression?: unknown;
    };

    if (!definition || typeof definition !== 'object' ||
      Object.keys(definition).some(
        (key) =>
          key !== 'defaultChildSupertagId' &&
          key !== 'extends' &&
          key !== 'titleExpression'
      ) ||
      (definition.extends !== undefined &&
        (!Array.isArray(definition.extends) ||
          !definition.extends.every(
            (parentId) => typeof parentId === 'string' && parentId.length > 0
          ) ||
          new Set(definition.extends).size !== definition.extends.length)) ||
      (definition.defaultChildSupertagId !== undefined &&
        (typeof definition.defaultChildSupertagId !== 'string' ||
          definition.defaultChildSupertagId.length === 0)) ||
      (definition.titleExpression !== undefined &&
        typeof definition.titleExpression !== 'string')) {
      return false;
    }
  }

  if (semantic.tanaSearchDefinition !== undefined) {
    const definition = semantic.tanaSearchDefinition as { query?: unknown };

    if (
      !definition ||
      !definition.query ||
      typeof definition.query !== 'object' ||
      !('type' in definition.query)
    ) {
      return false;
    }
  }

  if (semantic.tanaViewDefinition !== undefined) {
    const definition = semantic.tanaViewDefinition as { type?: unknown };

    if (
      !definition ||
      (definition.type !== 'outline' &&
        definition.type !== 'table' &&
        definition.type !== 'calendar' &&
        definition.type !== 'cards')
    ) {
      return false;
    }
  }

  return true;
}

function isFieldDefinition(value: unknown): value is {
  sourceSupertagId?: string | null;
  type: string;
} {
  if (!value || typeof value !== 'object') return false;

  const field = value as Record<string, unknown>;
  const validType = isFieldType(field.type);

  if (!validType) {
    return false;
  }

  if (
    field.cardinality !== undefined &&
    field.cardinality !== 'single' &&
    field.cardinality !== 'list'
  ) {
    return false;
  }

  if (field.required !== undefined && field.required !== true) return false;

  if (field.type === 'options') {
    return Object.keys(field).every(
      (key) => key === 'type' || key === 'cardinality' || key === 'required'
    );
  }

  if (field.type === 'number') {
    if (!Object.keys(field).every((key) => ['type', 'cardinality', 'required', 'min', 'max'].includes(key))) {
      return false;
    }

    const min = field.min;
    const max = field.max;

    return (
      (min === undefined || (typeof min === 'number' && Number.isFinite(min))) &&
      (max === undefined || (typeof max === 'number' && Number.isFinite(max))) &&
      (typeof min !== 'number' || typeof max !== 'number' || min <= max)
    );
  }

  if (['checkbox', 'date', 'email', 'plain', 'url'].includes(field.type as string)) {
    return Object.keys(field).every(
      (key) => key === 'type' || key === 'cardinality' || key === 'required'
    );
  }

  return (
    Object.keys(field).every(
      (key) => key === 'type' || key === 'cardinality' || key === 'required' || key === 'sourceSupertagId'
    ) &&
    (field.sourceSupertagId === null ||
      (typeof field.sourceSupertagId === 'string' && field.sourceSupertagId.length > 0))
  );
}

function isFieldType(value: unknown): value is string {
  return [
    'checkbox',
    'date',
    'email',
    'from-supertag',
    'number',
    'options',
    'plain',
    'url',
  ].includes(value as string);
}

export function isPlateDocument(value: unknown): value is Value {
  return Array.isArray(value) && value.length > 0 && value.every(isDescendant);
}

/** Validates the Tana invariants layered on top of a valid Plate value. */
export function isValidTanaDocument(value: unknown): value is Value {
  if (!isPlateDocument(value)) return false;

  const nodeIds = new Set<string>();
  const entries: Array<[TanaBlockElement, number[]]> = [];
  let valid = true;

  function visit(descendant: Descendant, path: number[]): void {
    if (!valid || !isElement(descendant)) return;

    const isTanaNode = isTanaNodeElement(descendant, path);
    const semantic = descendant as TElement & {
      key?: unknown;
      tanaFieldDefinition?: unknown;
      tanaFieldId?: unknown;
      tanaFieldOptional?: unknown;
      tanaFieldPinned?: unknown;
      tanaFieldValueType?: unknown;
      tanaFieldValues?: unknown;
      tanaDefaultChildSupertagId?: unknown;
      tanaPresentation?: unknown;
      tanaReferenceTargetId?: unknown;
      tanaSearchDefinition?: unknown;
      tanaSupertagIds?: unknown;
      tanaSupertagDefinition?: unknown;
      tanaSystemNode?: unknown;
      tanaTime?: unknown;
      tanaViewDefinition?: unknown;
    };
    const hasTanaMetadata =
      semantic.tanaFieldDefinition !== undefined ||
      semantic.tanaFieldId !== undefined ||
      semantic.tanaFieldOptional !== undefined ||
      semantic.tanaFieldPinned !== undefined ||
      semantic.tanaFieldValueType !== undefined ||
      semantic.tanaFieldValues !== undefined ||
      semantic.tanaDefaultChildSupertagId !== undefined ||
      semantic.tanaPresentation !== undefined ||
      semantic.tanaReferenceTargetId !== undefined ||
      semantic.tanaSearchDefinition !== undefined ||
      semantic.tanaSupertagIds !== undefined ||
      semantic.tanaSupertagDefinition !== undefined ||
      semantic.tanaSystemNode !== undefined ||
      semantic.tanaTime !== undefined ||
      semantic.tanaViewDefinition !== undefined;

    if (isTanaNode) {
      if (
        typeof descendant.id !== 'string' ||
        descendant.id.length === 0 ||
        nodeIds.has(descendant.id) ||
        !hasValidSemanticData(descendant)
      ) {
        valid = false;

        return;
      }

      nodeIds.add(descendant.id);
      entries.push([descendant as TanaBlockElement, path]);
    } else if (hasTanaMetadata) {
      valid = false;

      return;
    }

    if (
      (descendant.type === KEYS.mention ||
        descendant.type === TANA_SUPERTAG_KEY) &&
      (typeof semantic.key !== 'string' || semantic.key.length === 0)
    ) {
      valid = false;

      return;
    }

    descendant.children.forEach((child, index) => {
      visit(child, [...path, index]);
    });
  }

  value.forEach((descendant, index) => visit(descendant, [index]));

  if (!valid) return false;

  const elementsByPath = new Map(entries.map((entry) => [entry[1][0], entry[0]]));
  const fieldDefinitions = new Map(
    entries.flatMap(([node]) =>
      typeof node.id === 'string' && node.tanaFieldDefinition
        ? [[node.id, node.tanaFieldDefinition] as const]
        : []
    )
  );
  const systemNodes = new Set<string>();
  const timeValues = new Set<string>();

  for (const [node, path] of entries) {
    if (node.tanaSystemNode) {
      if (systemNodes.has(node.tanaSystemNode)) return false;
      systemNodes.add(node.tanaSystemNode);
    }

    if (node.tanaTime) {
      if (node.tanaTime.unit !== 'day' || !isTanaDay(node.tanaTime.value)) {
        return false;
      }
      if (timeValues.has(node.tanaTime.value)) return false;
      timeValues.add(node.tanaTime.value);

    }

    if (node.tanaFieldDefinition && node.tanaFieldId) return false;

    if (node.tanaFieldId) {
      const definition = fieldDefinitions.get(node.tanaFieldId);
      const parentPath = getTanaParentPath(value, path);
      const parent = parentPath ? elementsByPath.get(parentPath[0]) : undefined;

      if (
        !parent ||
        parent.tanaFieldDefinition !== undefined ||
        parent.tanaFieldId !== undefined ||
        parent.tanaFieldValueType !== undefined
      ) {
        return false;
      }

      const valuePaths = getTanaDirectChildPaths(value, path).filter(
        (childPath) =>
          elementsByPath.get(childPath[0])?.tanaFieldValueType !== undefined
      );

      if (
        definition &&
        valuePaths.some(
          (valuePath) =>
            elementsByPath.get(valuePath[0])?.tanaFieldValueType !== definition.type
        )
      ) {
        return false;
      }
    }

    if (!node.tanaFieldValueType) continue;

    const parentPath = getTanaParentPath(value, path);
    const parent = parentPath ? elementsByPath.get(parentPath[0]) : undefined;
    const definition = parent?.tanaFieldId
      ? fieldDefinitions.get(parent.tanaFieldId)
      : undefined;

    if (!parent?.tanaFieldId) return false;
    if (definition && node.tanaFieldValueType !== definition.type) return false;
  }

  // Canonical workspace structure is the final persistence gate. Field
  // Definition ownership stays unrestricted: only the seven system Nodes are
  // required to be unique with the six children directly under Workspace.
  const parentNodeIds = new Map<NodeId, NodeId | undefined>();

  for (const [node, path] of entries) {
    const parentPath = getTanaParentPath(value, path);
    const parent = parentPath ? elementsByPath.get(parentPath[0]) : undefined;
    const parentId =
      parent && typeof parent.id === 'string' ? parent.id : undefined;

    if (typeof node.id === 'string') parentNodeIds.set(node.id, parentId);
  }

  if (!validateWorkspaceStructure(value, { parentNodeIds })) return false;

  return true;
}

async function getDatabase() {
  databasePromise ??= import('@tauri-apps/plugin-sql').then(
    async ({ default: Database }) => {
      const database = await Database.load(DATABASE_URL);

      await database.execute(`
        CREATE TABLE IF NOT EXISTS plate_documents (
          id TEXT PRIMARY KEY NOT NULL,
          schema_version INTEGER NOT NULL DEFAULT ${CURRENT_SCHEMA_VERSION},
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      const columns = await database.select<TableInfoRow[]>(
        'PRAGMA table_info(plate_documents)'
      );

      if (!columns.some(({ name }) => name === 'schema_version')) {
        await database.execute(
          'ALTER TABLE plate_documents ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1'
        );
      }

      return database;
    }
  );

  return databasePromise;
}

export function usesSQLitePersistence() {
  return isTauri();
}

function hasObsoleteFieldMetadata(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  if (Array.isArray(value)) return value.some(hasObsoleteFieldMetadata);

  const record = value as Record<string, unknown>;
  const fieldDefinition = record.tanaFieldDefinition;
  const hasLegacyOptions =
    !!fieldDefinition &&
    typeof fieldDefinition === 'object' &&
    Object.hasOwn(fieldDefinition as object, 'options');

  return (
    Object.hasOwn(record, 'tanaFieldValues') ||
    hasLegacyOptions ||
    Object.values(record).some(hasObsoleteFieldMetadata)
  );
}

export async function loadPlateDocument(fallback: Value): Promise<Value> {
  if (!usesSQLitePersistence()) return structuredClone(fallback);

  const database = await getDatabase();
  const rows = await database.select<DocumentRow[]>(
    'SELECT schema_version, value FROM plate_documents WHERE id = $1 LIMIT 1',
    [DOCUMENT_ID]
  );

  if (!rows[0]) {
    await savePlateDocument(fallback);

    return structuredClone(fallback);
  }

  if (rows[0].schema_version < CURRENT_SCHEMA_VERSION) {
    await savePlateDocument(fallback);

    return structuredClone(fallback);
  }
  if (rows[0].schema_version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Document schema ${rows[0].schema_version} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`
    );
  }

  const parsed: unknown = JSON.parse(rows[0].value);

  if (!isPlateDocument(parsed)) {
    throw new Error('The persisted Plate document is structurally invalid');
  }

  if (!isValidTanaDocument(parsed)) {
    if (hasObsoleteFieldMetadata(parsed)) {
      await savePlateDocument(fallback);

      return structuredClone(fallback);
    }

    throw new Error('The persisted Plate document violates Tana invariants');
  }

  return parsed;
}

export async function savePlateDocument(value: Value): Promise<void> {
  if (!usesSQLitePersistence()) return;
  if (!isValidTanaDocument(value)) {
    throw new Error('Refusing to persist a Plate document with invalid Tana data');
  }

  const database = await getDatabase();

  await database.execute(
    `
      INSERT INTO plate_documents (id, schema_version, value, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    [
      DOCUMENT_ID,
      CURRENT_SCHEMA_VERSION,
      JSON.stringify(value),
      new Date().toISOString(),
    ]
  );
}

/** Debounces snapshots while serializing all writes through one promise chain. */
export function createDocumentSaveController({
  delay = 300,
  onStatus,
  write,
}: {
  delay?: number;
  onStatus?: (status: SaveLifecycleStatus) => void;
  write: (value: Value) => Promise<void>;
}): DocumentSaveController {
  let latestVersion = 0;
  let pending:
    | {
        value: Value;
        version: number;
      }
    | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writeChain = Promise.resolve();

  const enqueuePending = (): Promise<void> => {
    if (!pending) return writeChain;

    const scheduled = pending;
    pending = undefined;

    writeChain = writeChain
      .catch(() => undefined)
      .then(() => write(scheduled.value))
      .then(
        () => {
          if (scheduled.version === latestVersion && !pending) {
            onStatus?.('saved');
          }
        },
        (error: unknown) => {
          if (scheduled.version === latestVersion) onStatus?.('error');

          throw error;
        }
      );

    return writeChain;
  };

  return {
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }

      await enqueuePending();
    },
    schedule(value) {
      latestVersion += 1;
      pending = {
        value: structuredClone(value),
        version: latestVersion,
      };
      onStatus?.('saving');

      if (timer) clearTimeout(timer);

      timer = setTimeout(() => {
        timer = undefined;
        void enqueuePending().catch(() => undefined);
      }, delay);
    },
  };
}
