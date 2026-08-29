import type { Descendant, Value } from 'platejs';

import { isTauri } from '@tauri-apps/api/core';

const DATABASE_URL = 'sqlite:local-tana.db';
const DOCUMENT_ID = 'main';

type DocumentRow = {
  value: string;
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

export function isPlateDocument(value: unknown): value is Value {
  return Array.isArray(value) && value.length > 0 && value.every(isDescendant);
}

async function getDatabase() {
  databasePromise ??= import('@tauri-apps/plugin-sql').then(
    async ({ default: Database }) => {
      const database = await Database.load(DATABASE_URL);

      await database.execute(`
        CREATE TABLE IF NOT EXISTS plate_documents (
          id TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

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
    'SELECT value FROM plate_documents WHERE id = $1 LIMIT 1',
    [DOCUMENT_ID]
  );

  if (!rows[0]) {
    await savePlateDocument(fallback);

    return structuredClone(fallback);
  }

  const value: unknown = JSON.parse(rows[0].value);

  if (!isPlateDocument(value)) {
    throw new Error('The persisted Plate document is invalid');
  }

  return value;
}

export async function savePlateDocument(value: Value): Promise<void> {
  if (!usesSQLitePersistence()) return;

  const database = await getDatabase();

  await database.execute(
    `
      INSERT INTO plate_documents (id, value, updated_at)
      VALUES ($1, $2, $3)
      ON CONFLICT(id) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    [DOCUMENT_ID, JSON.stringify(value), new Date().toISOString()]
  );
}
