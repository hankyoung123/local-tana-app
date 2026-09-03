import type { Path, TElement, Value } from 'platejs';

import type { TanaNodeSemanticType } from './node-semantic';

export type NodeId = string;
export type FieldId = NodeId;

/** Stable identities for the workspace's ordinary system Nodes. */
export type TanaSystemNode =
  | 'daily-notes'
  | 'home'
  | 'library'
  | 'schema'
  | 'settings'
  | 'trash'
  | 'workspace';

export type FieldDefinition =
  | { cardinality?: FieldCardinality; type: 'checkbox' }
  | { cardinality?: FieldCardinality; type: 'date' }
  | {
      cardinality?: FieldCardinality;
      sourceSupertagId: NodeId | null;
      type: 'from-supertag';
    }
  | { cardinality?: FieldCardinality; type: 'number' }
  /** Option candidates are ordered direct child Nodes of this definition. */
  | { cardinality?: FieldCardinality; type: 'options' }
  | { cardinality?: FieldCardinality; type: 'plain' };

export type FieldType = FieldDefinition['type'];
export type FieldCardinality = 'list' | 'single';

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

/** A Search owns the result set independently of how that set is rendered. */
export type TanaSearchDefinition = {
  clauses: readonly TanaQueryClause[];
};

/** v1 renders the result set as an outline; future types stay presentation-only. */
export type TanaViewDefinition = {
  type: 'outline';
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
  /**
   * Plate adapter for Tana reference semantics: the occurrence keeps its own
   * Plate NodeId and points at the canonical target NodeId.
   */
  tanaReferenceTargetId?: NodeId;
  tanaSearchDefinition?: TanaSearchDefinition;
  /** Semantic Supertag membership. Inline `#` elements are presentation only. */
  tanaSupertagIds?: readonly NodeId[];
  tanaSupertagDefinition?: SupertagDefinition;
  tanaSystemNode?: TanaSystemNode;
  tanaViewDefinition?: TanaViewDefinition;
};

export type TanaNode = {
  id: NodeId;
  node: TElement;
  path: Path;
  text: string;
  fieldDefinition?: FieldDefinition;
  presentation?: TanaPresentation;
  referenceTargetId?: NodeId;
  searchDefinition?: TanaSearchDefinition;
  /** Derived runtime classification; it is never persisted on the Plate Node. */
  semanticType: TanaNodeSemanticType;
  /** Preserves composable semantics such as Field Definition + View. */
  semanticTypes: readonly TanaNodeSemanticType[];
  supertagDefinition?: SupertagDefinition;
  supertagIds: readonly NodeId[];
  systemNode?: TanaSystemNode;
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
  /** Missing or non-Field targets are readable history, not an invalid document. */
  brokenFieldDefinition: boolean;
  value?: FieldValue;
  valueNodeId?: NodeId;
  /** Every valid direct Value Node, in document order. */
  valueNodeIds: readonly NodeId[];
  values: readonly FieldValue[];
};

export type ReferenceRelation = {
  kind: 'inline' | 'node';
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
  /** Direct children derived solely from flat indent and document order. */
  childrenByParent: ReadonlyMap<NodeId, readonly NodeId[]>;
  /** The unchanged Plate document from which every index entry is derived. */
  document: Value;
  nodesById: ReadonlyMap<NodeId, TanaNode>;
  /** Parent ownership derived solely from flat indent and document order. */
  parentNodeIds: ReadonlyMap<NodeId, NodeId | undefined>;
  nodesBySupertag: ReadonlyMap<NodeId, readonly NodeId[]>;
  /** All resolvable inline and block-level references in document order. */
  references: readonly ReferenceRelation[];
  /** Block-level Reference occurrences, keyed by their own NodeId. */
  referenceTargetsByNode: ReadonlyMap<NodeId, NodeId>;
  /** System-node lookup derived from explicit Node metadata. */
  systemNodeIds: ReadonlyMap<TanaSystemNode, NodeId>;
};

export function getNodeId(node: TElement): NodeId {
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new Error('Plate block is missing its NodeId');
  }

  return node.id;
}
