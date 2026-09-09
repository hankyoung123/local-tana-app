import type { Path, TElement, Value } from 'platejs';

import type { TanaNodeSemanticType } from './node-semantic';

export type NodeId = string;
export type FieldId = NodeId;
export type TanaDoneState = 'todo' | 'done';

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

export type FieldVisibilityPolicy =
  | 'always'
  | 'default'
  | 'never'
  | 'when-empty'
  | 'when-non-empty';

type FieldDefinitionBase = {
  cardinality?: FieldCardinality;
  required?: true;
  /** Visibility is presentation configuration, derived per occurrence. */
  visibility?: FieldVisibilityPolicy;
};

export type FieldDefinition = FieldDefinitionBase & (
  | { type: 'checkbox' }
  | { type: 'date' }
  | { type: 'email' }
  | {
      sourceSupertagId: NodeId | null;
      type: 'from-supertag';
    }
  | {
      max?: number;
      min?: number;
      type: 'number';
    }
  /** Option candidates are ordered direct child Nodes of this definition. */
  | { type: 'options' }
  | { type: 'plain' }
  | { type: 'url' }
);

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

/**
 * Validation is a read-only interpretation of an existing Value Node. It is
 * deliberately not persisted: invalid input remains canonical document data.
 */
export type FieldValidationIssue =
  | 'incompatible-type'
  | 'invalid-checkbox'
  | 'invalid-date'
  | 'invalid-email'
  | 'invalid-number'
  | 'invalid-option'
  | 'invalid-url'
  | 'missing-required'
  | 'missing-reference';

export type TanaQueryClause =
  | { kind: 'field-equals'; fieldId: FieldId; value: FieldValue }
  | { kind: 'field-defined'; fieldId: FieldId }
  | { kind: 'field-exists'; fieldId: FieldId }
  | { kind: 'has-supertag'; supertagId: NodeId }
  | { kind: 'text-contains'; text: string };

export type TanaGraphQueryClause =
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
  calendarDateFieldId?: NodeId;
  groupFieldId?: NodeId;
  sort?: {
    direction: 'asc' | 'desc';
    fieldId: NodeId | '$title';
  };
  type: 'calendar' | 'cards' | 'outline' | 'table';
  visibleFieldIds?: readonly NodeId[];
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
  /** Canonical completion state; Plate checkbox fields are presentation only. */
  tanaDoneState?: TanaDoneState;
  tanaFieldDefinition?: FieldDefinition;
  /** Applies only to a Field binding directly beneath a Supertag definition. */
  tanaFieldOptional?: true;
  /** Applies only to a Field template directly beneath a Supertag definition. */
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
  doneState?: TanaDoneState;
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
  /** Missing, non-Field, or trashed targets are readable history, not an invalid document. */
  brokenFieldDefinition: boolean;
  value?: FieldValue;
  /** Read-only decoded value lookup by real Value NodeId, including list Fields. */
  valueByNodeId: ReadonlyMap<NodeId, FieldValue>;
  /** Derived warnings by stored Value NodeId; never document state. */
  validationIssuesByValueNodeId: ReadonlyMap<NodeId, readonly FieldValidationIssue[]>;
  /** A required unset warning is field-level because no Value Node owns it. */
  validationIssues: readonly FieldValidationIssue[];
  valueNodeId?: NodeId;
  /** Every direct Value Node, including invalid or incompatible history. */
  valueNodeIds: readonly NodeId[];
  /** True when any direct Value Node has user-authored stored content. */
  hasStoredValue: boolean;
  /** Decoded Values in document order, including semantically invalid values. */
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
