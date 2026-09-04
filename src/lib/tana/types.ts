import type { Path, TElement, Value } from 'platejs';

import type { TanaNodeSemanticType } from './node-semantic';

export type NodeId = string;
export type FieldId = NodeId;

/**
 * Time is a Node semantic, not a separate calendar record. `day` uses the
 * exact same YYYY-MM-DD identity accepted by Date Field values; year/month/
 * week are derived views of that identity in the first Calendar iteration.
 */
export type TanaTime = {
  unit: 'day';
  value: string;
};

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
  | { cardinality?: FieldCardinality; required?: true; type: 'checkbox' }
  | { cardinality?: FieldCardinality; required?: true; type: 'date' }
  | { cardinality?: FieldCardinality; required?: true; type: 'email' }
  | {
      cardinality?: FieldCardinality;
      required?: true;
      sourceSupertagId: NodeId | null;
      type: 'from-supertag';
    }
  | {
      cardinality?: FieldCardinality;
      max?: number;
      min?: number;
      required?: true;
      type: 'number';
    }
  /** Option candidates are ordered direct child Nodes of this definition. */
  | { cardinality?: FieldCardinality; required?: true; type: 'options' }
  | { cardinality?: FieldCardinality; required?: true; type: 'plain' }
  | { cardinality?: FieldCardinality; required?: true; type: 'url' };

export type FieldType = FieldDefinition['type'];
export type FieldCardinality = 'list' | 'single';

export type FieldValue =
  | { type: 'checkbox'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'email'; value: string }
  | { type: 'from-supertag'; value: NodeId }
  | { type: 'number'; value: number }
  | { type: 'options'; value: NodeId }
  | { type: 'plain'; value: string }
  | { type: 'url'; value: string };

export type TanaQueryClause =
  | { kind: 'field-equals'; fieldId: FieldId; value: FieldValue }
  | { kind: 'field-defined'; fieldId: FieldId }
  | { kind: 'field-exists'; fieldId: FieldId }
  | { kind: 'has-supertag'; supertagId: NodeId }
  | { kind: 'text-contains'; text: string };

export type TanaGraphQueryClause =
  | { kind: 'parent-is'; nodeId: NodeId }
  | { kind: 'child-of'; nodeId: NodeId }
  | { kind: 'descendant-of'; nodeId: NodeId }
  | { kind: 'references'; nodeId: NodeId }
  | { kind: 'referenced-by'; nodeId: NodeId };

export type TanaQueryPredicate = TanaQueryClause | TanaGraphQueryClause;

/** A persisted Search expression; results are always derived from this AST. */
export type TanaQueryExpression =
  | { children: readonly TanaQueryExpression[]; type: 'and' | 'or' }
  | { child: TanaQueryExpression; type: 'not' }
  | { predicate: TanaQueryPredicate; type: 'predicate' };

/** A Search owns the result set independently of how that set is rendered. */
export type TanaSearchDefinition = {
  query: TanaQueryExpression;
};

/** View presentation never owns Search results or canonical Node data. */
export type TanaViewDefinition = {
  type: 'calendar' | 'cards' | 'outline' | 'table';
};

/**
 * Per-Node presentation preferences. These never replace or alter the Field
 * semantics stored on the same Plate Node.
 */
export type TanaPresentation = {
  hiddenFieldNodeIds?: readonly NodeId[];
};

/**
 * A Supertag's template Fields are direct child Field Nodes in the document.
 * `extends` is the only stored inheritance relation; templates and inherited
 * membership remain derived from the same Plate hierarchy.
 */
export type SupertagDefinition = {
  /** Applied to every newly created direct child of an instance. */
  defaultChildSupertagId?: NodeId;
  extends?: readonly NodeId[];
  /** Pure display template; it never replaces the canonical Plate title. */
  titleExpression?: string;
};

export type TanaBlockElement = TElement & {
  tanaFieldDefinition?: FieldDefinition;
  /** Applies only to a Field binding directly beneath a Supertag definition. */
  tanaFieldOptional?: true;
  /** A Field occurrence may opt into pinned presentation without moving its Node. */
  tanaFieldPinned?: true;
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
  /** Per-node counterpart of a Supertag's default child configuration. */
  tanaDefaultChildSupertagId?: NodeId;
  tanaSystemNode?: TanaSystemNode;
  tanaTime?: TanaTime;
  tanaViewDefinition?: TanaViewDefinition;
};

export type TanaNode = {
  id: NodeId;
  node: TElement;
  path: Path;
  /** Canonical Plate text, retained when a title expression changes display. */
  rawText: string;
  text: string;
  /** Derived from directly applied (and inherited) Supertag configuration. */
  titleExpression?: string;
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
  time?: TanaTime;
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
  /** Read-only value lookup by real Value NodeId, including list Fields. */
  valueByNodeId: ReadonlyMap<NodeId, FieldValue>;
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
  /** Inline and block-level references in document order, including broken targets. */
  references: readonly ReferenceRelation[];
  /** Block-level Reference occurrences, keyed by their own NodeId, including broken targets. */
  referenceTargetsByNode: ReadonlyMap<NodeId, NodeId>;
  /** System-node lookup derived from explicit Node metadata. */
  systemNodeIds: ReadonlyMap<TanaSystemNode, NodeId>;
  /** Calendar identities derived from time-marked Nodes; never a second calendar store. */
  timeNodeIds: ReadonlyMap<string, NodeId>;
};

export function getNodeId(node: TElement): NodeId {
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new Error('Plate block is missing its NodeId');
  }

  return node.id;
}
