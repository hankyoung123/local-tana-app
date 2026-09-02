import type { Path, TElement, Value } from 'platejs';

import type { TanaNodeSemanticType } from './node-semantic';

export type NodeId = string;
export type FieldId = NodeId;

export type FieldDefinition =
  | { type: 'checkbox' }
  | { type: 'date' }
  | { sourceSupertagId: NodeId | null; type: 'from-supertag' }
  | { type: 'number' }
  /** Option candidates are ordered direct child Nodes of this definition. */
  | { type: 'options' }
  | { type: 'plain' };

export type FieldType = FieldDefinition['type'];

export type FieldValue =
  | { type: 'checkbox'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'from-supertag'; value: NodeId }
  | { type: 'number'; value: number }
  | { type: 'options'; value: NodeId }
  | { type: 'plain'; value: string };

export type TanaQueryClause =
  | { kind: 'field-equals'; fieldId: FieldId; value: FieldValue }
  | { kind: 'field-defined'; fieldId: FieldId }
  | { kind: 'field-exists'; fieldId: FieldId }
  | { kind: 'has-supertag'; supertagId: NodeId }
  | { kind: 'text-contains'; text: string };

export type TanaViewDefinition = {
  clauses: readonly TanaQueryClause[];
};

/**
 * Per-Node presentation preferences. These never replace or alter the Field
 * semantics stored on the same Plate Node.
 */
export type TanaPresentation = {
  hiddenFieldNodeIds?: readonly NodeId[];
};

/** A Supertag's template Fields are direct child Field Nodes in the document. */
export type SupertagDefinition = Record<never, never>;

export type TanaBlockElement = TElement & {
  tanaFieldDefinition?: FieldDefinition;
  /** A Field occurrence is still an ordinary top-level Tana Node. */
  tanaFieldId?: FieldId;
  /**
   * A Field value is also an ordinary Node. This small marker preserves the
   * value's original type when a Field Definition later changes type.
   */
  tanaFieldValueType?: FieldType;
  tanaPresentation?: TanaPresentation;
  tanaSupertagDefinition?: SupertagDefinition;
  tanaViewDefinition?: TanaViewDefinition;
};

export type TanaNode = {
  id: NodeId;
  node: TElement;
  path: Path;
  text: string;
  fieldDefinition?: FieldDefinition;
  presentation?: TanaPresentation;
  /** Derived runtime classification; it is never persisted on the Plate Node. */
  semanticType: TanaNodeSemanticType;
  /** Preserves composable semantics such as Field Definition + View. */
  semanticTypes: readonly TanaNodeSemanticType[];
  supertagDefinition?: SupertagDefinition;
  viewDefinition?: TanaViewDefinition;
};

/**
 * Read-only index entry for one Field occurrence Node. The Field Node and its
 * optional value child are ordinary Plate/Tana Nodes in the document.
 */
export type TanaFieldNode = {
  fieldId: FieldId;
  id: NodeId;
  node: TanaBlockElement;
  parentNodeId: NodeId;
  path: Path;
  value?: FieldValue;
  valueNodeId?: NodeId;
};

export type ReferenceRelation = {
  path: Path;
  sourceNodeId: NodeId;
  targetNodeId: NodeId;
};

export type TanaIndex = {
  backlinks: ReadonlyMap<NodeId, readonly ReferenceRelation[]>;
  fieldNodesById: ReadonlyMap<NodeId, TanaFieldNode>;
  fieldNodesByParent: ReadonlyMap<NodeId, readonly TanaFieldNode[]>;
  /** Derived only from Field Nodes; never persisted on the parent document Node. */
  fieldValues: ReadonlyMap<NodeId, ReadonlyMap<FieldId, FieldValue>>;
  /** The unchanged Plate document from which every index entry is derived. */
  document: Value;
  nodesById: ReadonlyMap<NodeId, TanaNode>;
  nodesBySupertag: ReadonlyMap<string, readonly NodeId[]>;
};

export function getNodeId(node: TElement): NodeId {
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new Error('Plate block is missing its NodeId');
  }

  return node.id;
}
