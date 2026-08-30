import { normalizeStaticValue } from 'platejs';

export const initialDocument = normalizeStaticValue([
  {
    id: 'workspace-root',
    children: [{ text: 'Local Tana' }],
    type: 'p',
  },
  {
    id: 'node-principle',
    children: [{ text: 'Plate provides the editor; Local Tana adds semantics.' }],
    indent: 1,
    type: 'p',
  },
  {
    id: 'node-document-source',
    children: [{ text: 'The Plate document is the single source of truth.' }],
    indent: 2,
    type: 'p',
  },
  {
    id: 'node-first-loop',
    children: [{ text: 'First working loop' }],
    type: 'toggle',
  },
  {
    id: 'node-reference',
    children: [
      { text: 'Inline references reuse Plate Mention: ' },
      {
        children: [{ text: '' }],
        key: 'workspace-root',
        type: 'mention',
      },
    ],
    indent: 1,
    type: 'p',
  },
  {
    id: 'node-supertag',
    children: [{ text: 'Supertags reuse Plate Combobox.' }],
    indent: 1,
    type: 'p',
  },
  {
    id: 'supertag-project',
    children: [{ text: 'Project' }],
    indent: 2,
    tanaSupertagDefinition: {
      fields: [
        { id: 'field-summary', name: 'Summary', type: 'text' },
        { id: 'field-estimate', name: 'Estimate', type: 'number' },
        { id: 'field-active', name: 'Active', type: 'boolean' },
        { id: 'field-due', name: 'Due date', type: 'date' },
        {
          id: 'field-status',
          name: 'Status',
          options: ['Planned', 'Active', 'Done'],
          type: 'select',
        },
        { id: 'field-owner', name: 'Owner', type: 'node-reference' },
      ],
    },
    type: 'p',
  },
  {
    id: 'node-project-example',
    children: [
      { text: 'Example ' },
      {
        children: [{ text: '' }],
        key: 'supertag-project',
        type: 'tana_supertag',
      },
    ],
    indent: 2,
    type: 'p',
  },
  {
    id: 'node-local-persistence',
    children: [{ text: 'SQLite persists the document locally.' }],
    indent: 1,
    type: 'p',
  },
  {
    id: 'view-projects',
    children: [{ text: 'All projects' }],
    tanaViewDefinition: {
      clauses: [{ kind: 'has-supertag', supertagId: 'supertag-project' }],
    },
    type: 'p',
  },
]);
