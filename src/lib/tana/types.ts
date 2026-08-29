import type { Path, TElement } from 'platejs';

export type NodeId = string;
export type FieldId = string;

type FieldDefinitionBase = {
  id: FieldId;
  name: string;
};

export type FieldDefinition =
  | (FieldDefinitionBase & { type: 'boolean' })
  | (FieldDefinitionBase & { type: 'date' })
  | (FieldDefinitionBase & { type: 'node-reference' })
  | (FieldDefinitionBase & { type: 'number' })
  | (FieldDefinitionBase & {
      options: readonly string[];
      type: 'select';
    })
  | (FieldDefinitionBase & { type: 'text' });

export type FieldType = FieldDefinition['type'];

export type FieldValue =
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'node-reference'; value: NodeId }
  | { type: 'number'; value: number }
  | { type: 'select'; value: string }
  | { type: 'text'; value: string };

export type TanaQueryClause =
  | { kind: 'field-equals'; fieldId: FieldId; value: FieldValue }
  | { kind: 'field-exists'; fieldId: FieldId }
  | { kind: 'has-supertag'; supertagId: NodeId }
  | { kind: 'text-contains'; text: string };

export type TanaViewDefinition = {
  clauses: readonly TanaQueryClause[];
};

export type SupertagDefinition = {
  fields: readonly FieldDefinition[];
};

export type TanaBlockElement = TElement & {
  tanaFieldValues?: Readonly<Record<FieldId, FieldValue>>;
  tanaSupertagDefinition?: SupertagDefinition;
  tanaViewDefinition?: TanaViewDefinition;
};

export type TanaNode = {
  id: NodeId;
  node: TElement;
  path: Path;
  text: string;
  fieldValues?: Readonly<Record<FieldId, FieldValue>>;
  supertagDefinition?: SupertagDefinition;
  viewDefinition?: TanaViewDefinition;
};

export type ReferenceRelation = {
  path: Path;
  sourceNodeId: NodeId;
  targetNodeId: NodeId;
};

export type TanaIndex = {
  backlinks: ReadonlyMap<NodeId, readonly ReferenceRelation[]>;
  fieldValues: ReadonlyMap<NodeId, ReadonlyMap<FieldId, FieldValue>>;
  nodesById: ReadonlyMap<NodeId, TanaNode>;
  nodesBySupertag: ReadonlyMap<string, readonly NodeId[]>;
};

export function getNodeId(node: TElement): NodeId {
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new Error('Plate block is missing its NodeId');
  }

  return node.id;
}
