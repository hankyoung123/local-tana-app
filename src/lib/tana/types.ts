import type { Path, TElement } from 'platejs';

export type NodeId = string;
export type FieldId = NodeId;

export type FieldDefinition =
  | { type: 'checkbox' }
  | { type: 'date' }
  | { sourceSupertagId: NodeId; type: 'from-supertag' }
  | { type: 'number' }
  | { options: readonly NodeId[]; type: 'options' }
  | { type: 'plain' };

export type FieldType = FieldDefinition['type'];

export type FieldValue =
  | { type: 'checkbox'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'from-supertag'; value: NodeId }
  | { type: 'number'; value: number }
  | { type: 'options'; value: NodeId }
  | { type: 'plain'; value: string };

/** A present `null` key means a Node directly defines an unset Field. */
export type FieldValueState = FieldValue | null;

export type FieldBinding = {
  defaultValue?: FieldValue;
  fieldId: FieldId;
};

export type TanaQueryClause =
  | { kind: 'field-equals'; fieldId: FieldId; value: FieldValue }
  | { kind: 'field-defined'; fieldId: FieldId }
  | { kind: 'field-exists'; fieldId: FieldId }
  | { kind: 'has-supertag'; supertagId: NodeId }
  | { kind: 'text-contains'; text: string };

export type TanaViewDefinition = {
  clauses: readonly TanaQueryClause[];
};

export type SupertagDefinition = {
  fields: readonly FieldBinding[];
};

export type TanaBlockElement = TElement & {
  tanaFieldDefinition?: FieldDefinition;
  tanaFieldValues?: Readonly<Record<FieldId, FieldValueState>>;
  tanaSupertagDefinition?: SupertagDefinition;
  tanaViewDefinition?: TanaViewDefinition;
};

export type TanaNode = {
  id: NodeId;
  node: TElement;
  path: Path;
  text: string;
  fieldValues?: Readonly<Record<FieldId, FieldValueState>>;
  fieldDefinition?: FieldDefinition;
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
  fieldValues: ReadonlyMap<NodeId, ReadonlyMap<FieldId, FieldValueState>>;
  nodesById: ReadonlyMap<NodeId, TanaNode>;
  nodesBySupertag: ReadonlyMap<string, readonly NodeId[]>;
};

export function getNodeId(node: TElement): NodeId {
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new Error('Plate block is missing its NodeId');
  }

  return node.id;
}
