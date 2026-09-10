import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Value } from 'platejs';

import {
  createDocumentSaveController,
  CURRENT_SCHEMA_VERSION,
  isPlateDocument,
  isValidTanaDocument,
} from './persistence';

const value = (text: string): Value => [
  { children: [{ text }], id: 'node', type: 'p' },
];

const minimalWorkspace = (): Value => [
  { children: [{ text: 'Workspace' }], id: 'ws', tanaSystemNode: 'workspace', type: 'p' },
  { children: [{ text: 'Home' }], id: 'ws-home', indent: 1, tanaSystemNode: 'home', type: 'p' },
  { children: [{ text: 'Daily' }], id: 'ws-daily', indent: 1, tanaSystemNode: 'daily-notes', type: 'p' },
  { children: [{ text: 'Schema' }], id: 'ws-schema', indent: 1, tanaSystemNode: 'schema', type: 'p' },
  { children: [{ text: 'Library' }], id: 'ws-library', indent: 1, tanaSystemNode: 'library', type: 'p' },
  { children: [{ text: 'Settings' }], id: 'ws-settings', indent: 1, tanaSystemNode: 'settings', type: 'p' },
  { children: [{ text: 'Trash' }], id: 'ws-trash', indent: 1, tanaSystemNode: 'trash', type: 'p' },
];

const withWorkspace = (extra: Value): Value => [
  ...minimalWorkspace(),
  ...extra.map((node) => ({
    ...node,
    indent: typeof node.indent === 'number' ? node.indent + 1 : 1,
  })),
];

const withHomeNodes = (nodes: Value): Value => {
  const document = minimalWorkspace();

  document.splice(2, 0, ...nodes);

  return document;
};

describe('Plate document persistence', () => {
  test('validates Plate structure and Tana node invariants', () => {
    assert.equal(isPlateDocument(value('A')), true);
    // A bare Node is valid Plate but not a valid Tana workspace document.
    assert.equal(isValidTanaDocument(value('A')), false);
    assert.equal(isValidTanaDocument(minimalWorkspace()), true);
    assert.equal(isPlateDocument([]), false);
    assert.equal(isPlateDocument([{ children: 'nope', type: 'p' }]), false);
    assert.equal(
      isValidTanaDocument([{ children: [{ text: 'Missing ID' }], type: 'p' }]),
      false
    );
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'A' }], id: 'same', type: 'p' },
        { children: [{ text: 'B' }], id: 'same', type: 'toggle' },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          {
            children: [{ text: 'Tags' }],
            id: 'tags',
            tanaFieldDefinition: { cardinality: 'list', type: 'plain' },
            type: 'p',
          },
          { children: [{ text: 'Task' }], id: 'task', type: 'p' },
          {
            children: [{ text: '' }],
            id: 'task-tags',
            indent: 1,
            tanaFieldId: 'tags',
            type: 'p',
          },
          {
            children: [{ text: 'First' }],
            id: 'task-tags-first',
            indent: 2,
            tanaFieldValueType: 'plain',
            type: 'p',
          },
          {
            children: [{ text: 'Second' }],
            id: 'task-tags-second',
            indent: 2,
            tanaFieldValueType: 'plain',
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          {
            children: [{ text: 'Status' }],
            id: 'status',
            tanaFieldDefinition: { type: 'plain', visibility: 'when-default' },
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          { children: [{ text: 'Task' }], id: 'task', type: 'p' },
          {
            children: [{ text: '' }],
            id: 'historical-field',
            indent: 1,
            tanaFieldId: 'deleted-definition',
            type: 'p',
          },
          {
            children: [{ text: 'Historical value' }],
            id: 'historical-value',
            indent: 2,
            tanaFieldValueType: 'plain',
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Orphan' }],
          id: 'orphan-value',
          tanaFieldValueType: 'plain',
          type: 'p',
        },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          { children: [{ text: 'Priority' }], id: 'priority', tanaFieldDefinition: { type: 'plain' }, type: 'p' },
          { children: [{ text: 'Task' }], id: 'task', type: 'p' },
          {
            children: [{ text: '' }],
            id: 'field-occurrence',
            indent: 1,
            tanaFieldId: 'priority',
            type: 'p',
          },
          {
            children: [{ text: '' }],
            id: 'field-value',
            indent: 2,
            tanaFieldValueType: 'plain',
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          {
            children: [{ text: 'Visible field preference' }],
            id: 'presentation',
            tanaPresentation: { hiddenFieldNodeIds: ['status-occurrence'] },
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Duplicate field preference' }],
          id: 'invalid-presentation',
          tanaPresentation: {
            hiddenFieldNodeIds: ['status-occurrence', 'status-occurrence'],
          },
          type: 'p',
        },
      ]),
      false
    );
  });

  test('treats obsolete Field metadata as a breaking schema', () => {
    assert.equal(CURRENT_SCHEMA_VERSION, 6);
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Task' }],
          id: 'task',
          tanaFieldValues: { priority: { type: 'plain', value: 'legacy' } },
          type: 'p',
        },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Status' }],
          id: 'status',
          tanaFieldDefinition: { options: ['active'], type: 'options' },
          type: 'p',
        },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          {
            children: [{ text: 'Status' }],
            id: 'status',
            tanaFieldDefinition: { type: 'plain', visibility: 'when-empty' },
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          {
            children: [{ text: 'Status' }],
            id: 'status',
            tanaFieldDefinition: { type: 'plain', visibility: 'sometimes' },
            type: 'p',
          },
        ])
      ),
      false
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          {
            children: [{ text: 'Status' }],
            id: 'status',
            tanaFieldDefinition: { type: 'plain', visibility: 'default' },
            type: 'p',
          },
        ])
      ),
      false
    );
  });

  test('accepts only a date initializer on a direct Supertag template binding', () => {
    const valid = withWorkspace([
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: {}, type: 'p' },
      {
        children: [{ text: '' }],
        id: 'template-due',
        indent: 1,
        tanaFieldId: 'due',
        tanaFieldInitializer: { kind: 'current-date' },
        type: 'p',
      },
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: 'p' },
    ]);

    assert.equal(isValidTanaDocument(valid), true);

    const invalidKind = structuredClone(valid) as Value;
    (invalidKind.find((node) => node.id === 'template-due') as Record<string, unknown>)
      .tanaFieldInitializer = { kind: 'tomorrow' };
    assert.equal(isValidTanaDocument(invalidKind), false);

    const invalidDefinitionType = structuredClone(valid) as Value;
    (invalidDefinitionType.find((node) => node.id === 'due') as Record<string, unknown>)
      .tanaFieldDefinition = { type: 'plain' };
    assert.equal(isValidTanaDocument(invalidDefinitionType), false);

    const invalidPlacement = structuredClone(valid) as Value;
    (invalidPlacement.find((node) => node.id === 'project') as Record<string, unknown>)
      .tanaFieldInitializer = { kind: 'current-date' };
    assert.equal(isValidTanaDocument(invalidPlacement), false);
  });

  test('rejects duplicate and single Field structure while retaining invalid historical values', () => {
    const historical = withWorkspace([
      { children: [{ text: 'When' }], id: 'when', tanaFieldDefinition: { type: 'date' }, type: 'p' },
      { children: [{ text: 'Email' }], id: 'email', tanaFieldDefinition: { type: 'email' }, type: 'p' },
      { children: [{ text: 'Range' }], id: 'range', tanaFieldDefinition: { max: 8, min: 2, type: 'number' }, type: 'p' },
      { children: [{ text: 'Task' }], id: 'task', type: 'p' },
      { children: [{ text: '' }], id: 'task-when', indent: 1, tanaFieldId: 'when', type: 'p' },
      { children: [{ text: 'still plain text' }], id: 'task-when-value', indent: 2, tanaFieldValueType: 'plain', type: 'p' },
      { children: [{ text: '' }], id: 'task-email', indent: 1, tanaFieldId: 'email', type: 'p' },
      { children: [{ text: 'not-an-email' }], id: 'task-email-value', indent: 2, tanaFieldValueType: 'email', type: 'p' },
      { children: [{ text: '' }], id: 'task-range', indent: 1, tanaFieldId: 'range', type: 'p' },
      { children: [{ text: '99' }], id: 'task-range-value', indent: 2, tanaFieldValueType: 'number', type: 'p' },
    ]);

    assert.equal(isValidTanaDocument(historical), true);

    const duplicateOccurrence = structuredClone(historical);
    duplicateOccurrence.push({
      children: [{ text: '' }],
      id: 'task-when-duplicate',
      indent: 2,
      tanaFieldId: 'when',
      type: 'p',
    });
    assert.equal(isValidTanaDocument(duplicateOccurrence), false);

    const multipleSingleValues = structuredClone(historical);
    multipleSingleValues.splice(13, 0, {
      children: [{ text: 'second' }],
      id: 'task-when-value-second',
      indent: 3,
      tanaFieldValueType: 'plain',
      type: 'p',
    });
    assert.equal(isValidTanaDocument(multipleSingleValues), false);

    const listValues = structuredClone(historical);
    const rangeDefinitionIndex = listValues.findIndex((node) => node.id === 'range');
    listValues[rangeDefinitionIndex] = {
      ...listValues[rangeDefinitionIndex],
      tanaFieldDefinition: { cardinality: 'list', type: 'number' },
    };
    listValues.push({
      children: [{ text: '2' }],
      id: 'task-range-list-second',
      indent: 3,
      tanaFieldValueType: 'number',
      type: 'p',
    });
    assert.equal(isValidTanaDocument(listValues), true);
  });

  test('keeps View presentation settings in the persisted Plate Document', () => {
    const document = withWorkspace([
      {
        children: [{ text: 'Tasks' }],
        id: 'tasks-view',
        tanaViewDefinition: {
          calendarDateFieldId: 'due-date',
          groupFieldId: 'status',
          sort: { direction: 'asc', fieldId: '$title' },
          type: 'table',
          visibleFieldIds: ['status', 'owner'],
        },
        type: 'p',
      },
    ]);

    const reloaded = JSON.parse(JSON.stringify(document)) as Value;

    assert.equal(isValidTanaDocument(document), true);
    assert.equal(isValidTanaDocument(reloaded), true);
    assert.deepEqual(reloaded.at(-1)?.tanaViewDefinition, {
      calendarDateFieldId: 'due-date',
      groupFieldId: 'status',
      sort: { direction: 'asc', fieldId: '$title' },
      type: 'table',
      visibleFieldIds: ['status', 'owner'],
    });
  });

  test('accepts explicit system Nodes and rejects invalid membership metadata', () => {
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'Workspace' }], id: 'ws', tanaSystemNode: 'workspace', type: 'p' },
        { children: [{ text: 'Home' }], id: 'ws-home', indent: 1, tanaSystemNode: 'home', type: 'p' },
        { children: [{ text: 'Daily' }], id: 'ws-daily', indent: 1, tanaSystemNode: 'daily-notes', type: 'p' },
        { children: [{ text: 'Schema' }], id: 'ws-schema', indent: 1, tanaSystemNode: 'schema', type: 'p' },
        { children: [{ text: 'Project' }], id: 'project', indent: 2, tanaSupertagDefinition: {}, type: 'p' },
        { children: [{ text: 'Library' }], id: 'ws-library', indent: 1, tanaSystemNode: 'library', type: 'p' },
        { children: [{ text: 'Settings' }], id: 'ws-settings', indent: 1, tanaSystemNode: 'settings', type: 'p' },
        { children: [{ text: 'Trash' }], id: 'ws-trash', indent: 1, tanaSystemNode: 'trash', type: 'p' },
        { children: [{ text: 'Task' }], id: 'task', indent: 1, tanaSupertagIds: ['project'], type: 'p' },
      ]),
      true
    );
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'Task' }], id: 'task', tanaSupertagIds: ['project', 'project'], type: 'p' },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'Workspace' }], id: 'ws', tanaSystemNode: 'workspace', type: 'p' },
        { children: [{ text: 'Home' }], id: 'ws-home', indent: 1, tanaSystemNode: 'home', type: 'p' },
        { children: [{ text: 'Daily' }], id: 'ws-daily', indent: 1, tanaSystemNode: 'daily-notes', type: 'p' },
        { children: [{ text: 'Schema' }], id: 'ws-schema', indent: 1, tanaSystemNode: 'schema', type: 'p' },
        { children: [{ text: 'Base' }], id: 'base', indent: 2, tanaSupertagDefinition: {}, type: 'p' },
        { children: [{ text: 'Task' }], id: 'task-tag', indent: 2, tanaSupertagDefinition: { extends: ['base'] }, type: 'p' },
        { children: [{ text: 'Library' }], id: 'ws-library', indent: 1, tanaSystemNode: 'library', type: 'p' },
        { children: [{ text: 'Settings' }], id: 'ws-settings', indent: 1, tanaSystemNode: 'settings', type: 'p' },
        { children: [{ text: 'Trash' }], id: 'ws-trash', indent: 1, tanaSystemNode: 'trash', type: 'p' },
      ]),
      true
    );
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'Task' }], id: 'task', tanaSystemNode: 'not-a-system-node', type: 'p' },
      ]),
      false
    );
  });

  test('accepts one valid Day Node and rejects duplicate or invalid time identity', () => {
    const document = minimalWorkspace();

    document.splice(3, 0, {
      children: [{ text: 'Day' }],
      id: 'day',
      indent: 2,
      tanaTime: { unit: 'day', value: '2026-03-01' },
      type: 'p',
    });
    assert.equal(isValidTanaDocument(document), true);

    const duplicate = structuredClone(document);
    duplicate.splice(4, 0, {
      children: [{ text: 'Same day' }],
      id: 'same-day',
      indent: 2,
      tanaTime: { unit: 'day', value: '2026-03-01' },
      type: 'p',
    });
    assert.equal(isValidTanaDocument(duplicate), false);

    const invalidDay = structuredClone(document);
    invalidDay[3] = {
      ...invalidDay[3],
      tanaTime: { unit: 'day', value: '2026-02-29' },
    };
    assert.equal(isValidTanaDocument(invalidDay), false);
  });

  test('flushes a debounced final edit before close', async () => {
    const writes: Value[] = [];
    const controller = createDocumentSaveController({
      delay: 10_000,
      write: async (document) => {
        writes.push(structuredClone(document));
      },
    });

    controller.schedule(value('Last edit'));
    await controller.flush();

    assert.deepEqual(writes, [value('Last edit')]);
  });

  test('serializes writes and reloads the latest saved snapshot', async () => {
    const writes: string[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const controller = createDocumentSaveController({
      delay: 0,
      write: async (document) => {
        const text = (document[0].children[0] as { text: string }).text;

        if (text === 'First') await firstWriteBlocked;
        writes.push(text);
      },
    });

    controller.schedule(value('First'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.schedule(value('Second'));
    const flushPromise = controller.flush();

    assert.deepEqual(writes, []);
    releaseFirstWrite?.();
    await flushPromise;

    assert.deepEqual(writes, ['First', 'Second']);
    assert.deepEqual(value(writes.at(-1)!), value('Second'));
  });
});

test('Search persistence requires the exact query envelope and a canonical ordinary host', () => {
  const valid = withWorkspace([
    {
      children: [{ text: 'Search' }],
      id: 'search',
      tanaSearchDefinition: { query: { children: [], type: 'and' } },
      type: 'p',
    },
  ]);
  assert.equal(isValidTanaDocument(valid), true);

  const nonAndRoot = structuredClone(valid);
  const nonAndSearch = nonAndRoot.find((node) => node.id === 'search')!;
  nonAndSearch.tanaSearchDefinition = {
    query: { predicate: { kind: 'text-contains', text: 'root' }, type: 'predicate' },
  } as never;
  assert.equal(isValidTanaDocument(nonAndRoot), false);

  const extraEnvelope = structuredClone(valid);
  const search = extraEnvelope.find((node) => node.id === 'search')!;
  search.tanaSearchDefinition = { extra: true, query: { children: [], type: 'and' } } as never;
  assert.equal(isValidTanaDocument(extraEnvelope), false);

  const referenceHost = withWorkspace([
    { children: [{ text: 'Target' }], id: 'target', type: 'p' },
    {
      children: [{ text: 'Search occurrence' }],
      id: 'reference-search',
      tanaReferenceTargetId: 'target',
      tanaSearchDefinition: { query: { children: [], type: 'and' } },
      type: 'p',
    },
  ]);
  assert.equal(isValidTanaDocument(referenceHost), false);

  const systemHost = minimalWorkspace();
  systemHost[1] = {
    ...systemHost[1],
    tanaSearchDefinition: { query: { children: [], type: 'and' } },
  };
  assert.equal(isValidTanaDocument(systemHost), false);
});

test('rejects malformed Query AST and illegal flat indent at the persistence boundary', () => {
  for (const query of [
    { type: 'not' },
    { type: 'and', children: 'invalid' },
    { type: 'predicate', predicate: { kind: 'text-contains', text: ' ' } },
    { type: 'predicate', predicate: { kind: 'child-of', nodeId: '' } },
  ]) {
    const document = minimalWorkspace();
    document[1] = { ...document[1], tanaSearchDefinition: { query } };
    assert.equal(isValidTanaDocument(document), false);
  }
  const document = minimalWorkspace();
  document[1].indent = -1;
  assert.equal(isValidTanaDocument(document), false);
  assert.equal(isPlateDocument([{ text: 'top-level text' }]), false);
});

test('rejects canonical children beneath Reference occurrences and Search definitions at the persistence boundary', () => {
  const target = {
    children: [{ text: 'Canonical target' }],
    id: 'canonical-target',
    indent: 2,
    type: 'p',
  };
  const reference = {
    children: [{ text: 'Reference occurrence' }],
    id: 'reference-occurrence',
    indent: 2,
    tanaReferenceTargetId: 'canonical-target',
    type: 'p',
  };

  assert.equal(
    isValidTanaDocument(
      withHomeNodes([
        target,
        reference,
        { children: [{ text: 'Invalid direct child' }], id: 'reference-child', indent: 3, type: 'p' },
      ])
    ),
    false
  );

  assert.equal(
    isValidTanaDocument(
      withHomeNodes([
        {
          children: [{ text: 'Search' }],
          id: 'search',
          indent: 2,
          tanaSearchDefinition: { query: { children: [], type: 'and' } },
          type: 'p',
        },
        { children: [{ text: 'Invalid Search child' }], id: 'search-child', indent: 3, type: 'p' },
      ])
    ),
    false
  );

  assert.equal(
    isValidTanaDocument(
      withHomeNodes([
        target,
        reference,
        { children: [{ text: 'Invalid subtree root' }], id: 'reference-subtree-root', indent: 3, type: 'p' },
        { children: [{ text: 'Invalid deep child' }], id: 'reference-deep-child', indent: 4, type: 'p' },
      ])
    ),
    false
  );

  assert.equal(
    isValidTanaDocument(
      withHomeNodes([
        target,
        { children: [{ text: 'Canonical child' }], id: 'canonical-child', indent: 3, type: 'p' },
        reference,
      ])
    ),
    true
  );

  assert.equal(
    isValidTanaDocument(
      withHomeNodes([
        target,
        { children: [{ text: 'Canonical parent' }], id: 'canonical-parent', indent: 2, type: 'p' },
        {
          children: [{ text: 'Reference child' }],
          id: 'reference-child-of-canonical-parent',
          indent: 3,
          tanaReferenceTargetId: 'canonical-target',
          type: 'p',
        },
      ])
    ),
    true
  );

  assert.equal(
    isValidTanaDocument(
      withHomeNodes([
        target,
        {
          ...reference,
          tanaSupertagIds: ['project-tag'],
        },
        {
          children: [{ text: 'Project' }],
          id: 'project-tag',
          indent: 2,
          tanaSupertagDefinition: {},
          type: 'p',
        },
      ])
    ),
    false
  );
});

test('rejects soft line breaks and impossible Done adapter states at the persistence boundary', () => {
  for (const lineBreak of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
    const document = withWorkspace([
      { children: [{ text: `A${lineBreak}B` }], id: `multiline-${lineBreak.charCodeAt(0)}`, type: 'p' },
    ]);
    assert.equal(isValidTanaDocument(document), false);
  }

  const todoChecked = withWorkspace([
    { children: [{ text: 'Task' }], checked: true, id: 'task', listStyleType: 'todo', tanaDoneState: 'todo', type: 'p' },
  ]);
  const doneUnchecked = withWorkspace([
    { children: [{ text: 'Task' }], checked: false, id: 'task', listStyleType: 'todo', tanaDoneState: 'done', type: 'p' },
  ]);
  const uncheckedTaskList = withWorkspace([
    { children: [{ text: 'Task' }], checked: false, id: 'task', listStyleType: 'todo', type: 'p' },
  ]);

  assert.equal(isValidTanaDocument(todoChecked), false);
  assert.equal(isValidTanaDocument(doneUnchecked), false);
  assert.equal(isValidTanaDocument(uncheckedTaskList), false);
});

test('enforces every persisted SuperTag relation without repairing historical content', () => {
  const valid = withHomeNodes([
    {
      children: [{ text: 'Project' }],
      id: 'project-tag',
      indent: 2,
      tanaSupertagDefinition: {},
      type: 'p',
    },
    {
      children: [
        { text: 'Task ' },
        { children: [{ text: '' }], key: 'project-tag', type: 'tana_supertag' },
      ],
      id: 'task',
      indent: 2,
      tanaSupertagIds: ['project-tag'],
      type: 'p',
    },
  ]);

  assert.equal(isValidTanaDocument(valid), true);

  const missingMembership = structuredClone(valid);
  missingMembership[3].tanaSupertagIds = ['missing-tag'];
  assert.equal(isValidTanaDocument(missingMembership), false);

  const missingInheritance = structuredClone(valid);
  missingInheritance[2].tanaSupertagDefinition = { extends: ['missing-tag'] };
  assert.equal(isValidTanaDocument(missingInheritance), false);

  const cyclicInheritance = structuredClone(valid);
  cyclicInheritance[2].tanaSupertagDefinition = { extends: ['second-tag'] };
  cyclicInheritance.splice(3, 0, {
    children: [{ text: 'Second' }],
    id: 'second-tag',
    indent: 2,
    tanaSupertagDefinition: { extends: ['project-tag'] },
    type: 'p',
  });
  assert.equal(isValidTanaDocument(cyclicInheritance), false);

  const missingDefaultChild = structuredClone(valid);
  missingDefaultChild[2].tanaSupertagDefinition = {
    defaultChildSupertagId: 'missing-tag',
  };
  assert.equal(isValidTanaDocument(missingDefaultChild), false);

  const tokenConflict = structuredClone(valid);
  tokenConflict[3].tanaSupertagIds = [];
  assert.equal(isValidTanaDocument(tokenConflict), false);

  const tokenMissingTarget = structuredClone(valid);
  tokenMissingTarget[3].children[1].key = 'missing-tag';
  assert.equal(isValidTanaDocument(tokenMissingTarget), false);

  // A Definition in Trash remains a valid historical membership target.
  const trashedDefinition = minimalWorkspace();
  trashedDefinition.splice(2, 0, {
    children: [{ text: 'Historical task' }],
    id: 'historical-task',
    indent: 2,
    tanaSupertagIds: ['trashed-tag'],
    type: 'p',
  });
  trashedDefinition.push({
    children: [{ text: 'Archived tag' }],
    id: 'trashed-tag',
    indent: 2,
    tanaSupertagDefinition: {},
    type: 'p',
  });
  assert.equal(isValidTanaDocument(trashedDefinition), true);
});
