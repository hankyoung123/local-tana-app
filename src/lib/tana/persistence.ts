import type { Descendant, TElement, Value } from 'platejs';

import { isTauri } from '@tauri-apps/api/core';
import { KEYS, normalizeNodeId } from 'platejs';

import {
  isTanaNodeElement,
  TANA_SUPERTAG_KEY,
} from './constants';

const DATABASE_URL = 'sqlite:local-tana.db';
const DOCUMENT_ID = 'main';

export const CURRENT_SCHEMA_VERSION = 3;

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
    tanaFieldValues?: unknown;
    tanaSupertagDefinition?: unknown;
    tanaViewDefinition?: unknown;
  };

  if (semantic.tanaFieldValues !== undefined) {
    if (
      !semantic.tanaFieldValues ||
      typeof semantic.tanaFieldValues !== 'object'
    ) {
      return false;
    }

    if (!Object.values(semantic.tanaFieldValues).every(isFieldValue)) {
      return false;
    }
  }

  if (semantic.tanaSupertagDefinition !== undefined) {
    const definition = semantic.tanaSupertagDefinition as {
      fields?: unknown;
    };

    if (!definition || !Array.isArray(definition.fields)) return false;

    const fieldIds = new Set<string>();

    for (const field of definition.fields) {
      if (!isFieldDefinition(field) || fieldIds.has(field.id)) return false;

      fieldIds.add(field.id);
    }
  }

  if (semantic.tanaViewDefinition !== undefined) {
    const definition = semantic.tanaViewDefinition as { clauses?: unknown };

    if (!definition || !Array.isArray(definition.clauses)) return false;
  }

  return true;
}

function isFieldDefinition(value: unknown): value is {
  id: string;
  name: string;
  options?: string[];
  type: string;
} {
  if (!value || typeof value !== 'object') return false;

  const field = value as Record<string, unknown>;
  const validType = [
    'boolean',
    'date',
    'node-reference',
    'number',
    'select',
    'text',
  ].includes(field.type as string);

  if (
    typeof field.id !== 'string' ||
    field.id.length === 0 ||
    typeof field.name !== 'string' ||
    !validType
  ) {
    return false;
  }

  return (
    field.type !== 'select' ||
    (Array.isArray(field.options) &&
      field.options.every((option) => typeof option === 'string'))
  );
}

function isFieldValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  const fieldValue = value as Record<string, unknown>;

  switch (fieldValue.type) {
    case 'boolean':
      return typeof fieldValue.value === 'boolean';
    case 'number':
      return (
        typeof fieldValue.value === 'number' &&
        Number.isFinite(fieldValue.value)
      );
    case 'date':
    case 'node-reference':
    case 'select':
    case 'text':
      return typeof fieldValue.value === 'string';
    default:
      return false;
  }
}

export function isPlateDocument(value: unknown): value is Value {
  return Array.isArray(value) && value.length > 0 && value.every(isDescendant);
}

/** Validates the Tana invariants layered on top of a valid Plate value. */
export function isValidTanaDocument(value: unknown): value is Value {
  if (!isPlateDocument(value)) return false;

  const nodeIds = new Set<string>();
  let valid = true;

  function visit(descendant: Descendant, path: number[]): void {
    if (!valid || !isElement(descendant)) return;

    const isTanaNode = isTanaNodeElement(descendant, path);
    const semantic = descendant as TElement & {
      key?: unknown;
      tanaFieldValues?: unknown;
      tanaSupertagDefinition?: unknown;
      tanaViewDefinition?: unknown;
    };
    const hasTanaMetadata =
      semantic.tanaFieldValues !== undefined ||
      semantic.tanaSupertagDefinition !== undefined ||
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

  return valid;
}

function stripCopiedSemanticNames(value: Value): Value {
  function migrate(descendant: Descendant): Descendant {
    if (!isElement(descendant)) return { ...descendant };

    const next = {
      ...descendant,
      children: descendant.children.map(migrate),
    } as TElement & { value?: unknown };

    if (next.type === KEYS.mention || next.type === TANA_SUPERTAG_KEY) {
      delete next.value;
    }

    return next;
  }

  return value.map(migrate) as Value;
}

export function migratePlateDocument(
  value: Value,
  schemaVersion: number
): Value {
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error(`Invalid schema version: ${schemaVersion}`);
  }
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Document schema ${schemaVersion} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`
    );
  }

  let migrated = structuredClone(value);
  let version = schemaVersion;

  while (version < CURRENT_SCHEMA_VERSION) {
    if (version === 1) {
      migrated = stripCopiedSemanticNames(migrated);
      version = 2;

      continue;
    }

    if (version === 2) {
      migrated = normalizeNodeId(migrated, {
        filter: isTanaNodeElement,
      });
      version = 3;

      continue;
    }

    throw new Error(`No migration from schema version ${version}`);
  }

  return migrated;
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

  const parsed: unknown = JSON.parse(rows[0].value);

  if (!isPlateDocument(parsed)) {
    throw new Error('The persisted Plate document is structurally invalid');
  }

  const value = migratePlateDocument(parsed, rows[0].schema_version);

  if (!isValidTanaDocument(value)) {
    throw new Error('The persisted Plate document violates Tana invariants');
  }

  if (rows[0].schema_version !== CURRENT_SCHEMA_VERSION) {
    await savePlateDocument(value);
  }

  return value;
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
