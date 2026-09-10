import type { Path, TElement, Value } from 'platejs';

import { isTanaNodeElement } from './constants';
import type { NodeId, TanaBlockElement } from './types';

function getIndent(element: TElement): number {
  return typeof element.indent === 'number' ? element.indent : 0;
}

function isElement(value: Value[number] | undefined): value is TElement {
  return !!value && 'children' in value && Array.isArray(value.children);
}

function getTanaNodeAt(document: Value, path: Path): TElement | undefined {
  if (path.length !== 1) return;

  const node = document[path[0]];

  return isElement(node) && isTanaNodeElement(node, path) ? node : undefined;
}

function hasStoredFieldValueNode(node: TanaBlockElement): boolean {
  const visit = (candidate: TElement | { text: unknown }): boolean => {
    if ('text' in candidate) {
      return typeof candidate.text === 'string' && candidate.text.trim().length > 0;
    }

    return candidate.children.some((child) => {
      if ('text' in child && typeof child.text === 'string' && child.text.trim().length > 0) {
        return true;
      }

      if ('children' in child && Array.isArray(child.children)) {
        const relationKey = (child as TElement & { key?: unknown }).key;

        return (
          (typeof relationKey === 'string' && relationKey.length > 0) || visit(child)
        );
      }

      return false;
    });
  };

  return visit(node);
}

function getFieldDefinitionForOccurrence(
  document: Value,
  fieldId: NodeId
): TanaBlockElement['tanaFieldDefinition'] | undefined {
  return getTanaNodePaths(document).flatMap((definitionPath) => {
    const definition = getTanaNodeAt(document, definitionPath) as TanaBlockElement | undefined;

    return definition?.id === fieldId && definition.tanaFieldDefinition
      ? [definition.tanaFieldDefinition]
      : [];
  })[0];
}

/**
 * Normalizes the current canonical Value representation for comparison with a
 * template default. This is presentation-only: it does not add a value state
 * to either the Field occurrence or its Definition.
 */
function getFieldValueSignature(value: TanaBlockElement): string | undefined {
  const type = value.tanaFieldValueType;

  if (!type) return;

  const findRelationTarget = (candidate: TElement): string | undefined => {
    if (typeof candidate.key === 'string' && candidate.key.length > 0) {
      return candidate.key;
    }

    for (const child of candidate.children) {
      if ('children' in child && Array.isArray(child.children)) {
        const target = findRelationTarget(child as TElement);

        if (target) return target;
      }
    }
  };
  const getText = (candidate: TElement | { text: unknown }): string => {
    if ('text' in candidate) {
      return typeof candidate.text === 'string' ? candidate.text : '';
    }

    return candidate.children
      .map((child) =>
        'children' in child && Array.isArray(child.children)
          ? getText(child as TElement)
          : 'text' in child && typeof child.text === 'string'
            ? child.text
            : ''
      )
      .join('');
  };
  const text = getText(value);

  if (type === 'options' || type === 'from-supertag') {
    const target = findRelationTarget(value);

    return target ? `${type}:${target}` : undefined;
  }

  if (type === 'number') {
    const numericValue = Number(text.trim());

    return text.trim().length > 0 && Number.isFinite(numericValue)
      ? `${type}:${numericValue}`
      : undefined;
  }

  if (type === 'checkbox') {
    return text === 'true' || text === 'false' ? `${type}:${text}` : undefined;
  }

  return text.length > 0 ? `${type}:${text}` : undefined;
}

function getDirectFieldValueSignatures(document: Value, path: Path): string[] {
  return getTanaDirectChildPaths(document, path).flatMap((valuePath) => {
    const value = getTanaNodeAt(document, valuePath) as TanaBlockElement | undefined;
    const signature = value ? getFieldValueSignature(value) : undefined;

    return signature ? [signature] : [];
  });
}

/**
 * Returns whether a real Field occurrence currently equals at least one
 * applicable Supertag template default. Inheritance follows Definition edges
 * only; it never follows Reference edges or writes a derived marker.
 */
export function isTanaFieldNodeAtTemplateDefault(document: Value, path: Path): boolean {
  const field = getTanaNodeAt(document, path) as TanaBlockElement | undefined;
  const parentPath = getTanaParentPath(document, path);
  const parent = parentPath
    ? (getTanaNodeAt(document, parentPath) as TanaBlockElement | undefined)
    : undefined;

  if (!field?.tanaFieldId || !parent || !Array.isArray(parent.tanaSupertagIds)) {
    return false;
  }

  const currentValues = getDirectFieldValueSignatures(document, path);

  if (currentValues.length === 0) return false;

  const nodesById = new Map(
    getTanaNodePaths(document).flatMap((nodePath) => {
      const node = getTanaNodeAt(document, nodePath) as TanaBlockElement | undefined;

      return node && typeof node.id === 'string' ? [[node.id, { node, path: nodePath }] as const] : [];
    })
  );
  const resolveDefault = (supertagId: NodeId): string[] | undefined => {
    const visited = new Set<NodeId>();
    let defaultValues: string[] | undefined;
    const visit = (id: NodeId) => {
      if (visited.has(id)) return;
      visited.add(id);

      const supertag = nodesById.get(id);
      const definition = supertag?.node.tanaSupertagDefinition;

      if (!supertag || !definition) return;

      definition.extends?.forEach((parentSupertagId) => visit(parentSupertagId));
      const template = getTanaDirectChildPaths(document, supertag.path)
        .map((childPath) => ({
          node: getTanaNodeAt(document, childPath) as TanaBlockElement | undefined,
          path: childPath,
        }))
        .find(({ node }) => node?.tanaFieldId === field.tanaFieldId);

      // A direct template binding replaces an inherited binding, including an
      // unset direct template that intentionally supplies no default.
      if (template) defaultValues = getDirectFieldValueSignatures(document, template.path);
    };

    visit(supertagId);

    return defaultValues;
  };
  const defaults = parent.tanaSupertagIds.flatMap((supertagId) => {
    const values = resolveDefault(supertagId);

    return values && values.length > 0 ? [values] : [];
  });

  return defaults.some(
    (templateValues) =>
      templateValues.length === currentValues.length &&
      templateValues.every((value, index) => value === currentValues[index])
  );
}

/** Returns every top-level Plate block that participates in the outliner. */
export function getTanaNodePaths(document: Value): Path[] {
  return document.flatMap((node, index) =>
    isElement(node) && isTanaNodeElement(node, [index]) ? [[index]] : []
  );
}

/** Resolves a NodeId inside the source document without creating a node copy. */
export function getTanaNodePath(
  document: Value,
  nodeId: NodeId
): Path | undefined {
  return getTanaNodePaths(document).find(
    (path) => getTanaNodeAt(document, path)?.id === nodeId
  );
}

/** Returns the closest shallower top-level outliner node, if one exists. */
export function getTanaParentPath(
  document: Value,
  path: Path
): Path | undefined {
  const node = getTanaNodeAt(document, path);

  if (!node) return;

  const nodeIndent = getIndent(node);

  // Flat roots cannot have a parent; avoid scanning every preceding root.
  if (nodeIndent === 0) return;

  for (let index = path[0] - 1; index >= 0; index -= 1) {
    const candidate = document[index];

    if (!isElement(candidate) || !isTanaNodeElement(candidate, [index])) {
      continue;
    }
    if (getIndent(candidate) < nodeIndent) return [index];
  }
}

/** Returns the flat-indent ancestor chain from workspace root to parent. */
export function getTanaAncestorPaths(document: Value, path: Path): Path[] {
  const ancestors: Path[] = [];
  let parentPath = getTanaParentPath(document, path);

  while (parentPath) {
    ancestors.unshift(parentPath);
    parentPath = getTanaParentPath(document, parentPath);
  }

  return ancestors;
}

/** Returns the contiguous flat-indent subtree owned by a top-level Tana node. */
export function getTanaNodeDescendantPaths(
  document: Value,
  path: Path
): Path[] {
  const node = getTanaNodeAt(document, path);

  if (!node) return [];

  const descendants: Path[] = [];
  const nodeIndent = getIndent(node);

  for (let index = path[0] + 1; index < document.length; index += 1) {
    const candidate = document[index];

    if (!isElement(candidate) || !isTanaNodeElement(candidate, [index])) {
      continue;
    }
    if (getIndent(candidate) <= nodeIndent) break;

    descendants.push([index]);
  }

  return descendants;
}

/** Derives only the immediate flat-indent children of one Tana Node. */
export function getTanaDirectChildPaths(document: Value, path: Path): Path[] {
  return getTanaNodeDescendantPaths(document, path).filter((childPath) =>
    getTanaParentPath(document, childPath)?.[0] === path[0]
  );
}

/**
 * Derives the visual Zoom range from the single focused NodeId. The returned
 * paths always point into the unchanged Plate document; this never creates a
 * filtered editor value or projection document.
 */
export function getTanaZoomRange(
  document: Value,
  focusedNodeId: NodeId | null
): Path[] {
  const allNodePaths = getTanaNodePaths(document);

  if (!focusedNodeId) return allNodePaths;

  const focusedPath = getTanaNodePath(document, focusedNodeId);

  return focusedPath
    ? [focusedPath, ...getTanaNodeDescendantPaths(document, focusedPath)]
    : [];
}

/** Whether a Node remains in the current, purely derived Zoom range. */
export function isTanaNodeInZoomRange(
  document: Value,
  path: Path,
  focusedNodeId: NodeId | null
): boolean {
  return getTanaZoomRange(document, focusedNodeId).some(
    (zoomPath) => zoomPath[0] === path[0]
  );
}

/** A node owns children when the following flat outliner block is indented. */
export function hasTanaNodeDescendants(document: Value, path: Path): boolean {
  return getTanaNodeDescendantPaths(document, path).length > 0;
}

/** Finds top-level Tana nodes that own a nested outliner subtree. */
export function getTanaParentPaths(document: Value): Path[] {
  return document.flatMap((node, index) =>
    isElement(node) &&
    isTanaNodeElement(node, [index]) &&
    hasTanaNodeDescendants(document, [index])
      ? [[index]]
      : []
  );
}

/** Stable IDs for the current parent nodes, used only to initialize openIds. */
export function getTanaParentNodeIds(document: Value): string[] {
  return getTanaParentPaths(document).flatMap((path) => {
    const id = getTanaNodeAt(document, path)?.id;

    return typeof id === 'string' ? [id] : [];
  });
}

/** Collapse is UI behavior: a parent is collapsed when its ID is not open. */
export function isTanaNodeCollapsed(
  document: Value,
  path: Path,
  openIds: ReadonlySet<string>
): boolean {
  const node = getTanaNodeAt(document, path);

  return (
    !!node &&
    typeof node.id === 'string' &&
    hasTanaNodeDescendants(document, path) &&
    !openIds.has(node.id)
  );
}

/** A node is hidden when any of its flat-indent ancestors is collapsed. */
export function isTanaNodeHidden(
  document: Value,
  path: Path,
  openIds: ReadonlySet<string>
): boolean {
  let parentPath = getTanaParentPath(document, path);

  while (parentPath) {
    if (isTanaNodeCollapsed(document, parentPath, openIds)) return true;

    parentPath = getTanaParentPath(document, parentPath);
  }

  return false;
}

/**
 * A Field's presentation preference conceals its real occurrence Node and
 * every descendant, without removing any document structure or semantics.
 */
export function isTanaFieldNodePresentationHidden(
  document: Value,
  path: Path
): boolean {
  let candidatePath: Path | undefined = path;

  while (candidatePath) {
    const candidate = getTanaNodeAt(
      document,
      candidatePath
    ) as TanaBlockElement | undefined;

    if (candidate?.tanaFieldId && typeof candidate.id === 'string') {
      const parentPath = getTanaParentPath(document, candidatePath);
      const parent = parentPath
        ? (getTanaNodeAt(document, parentPath) as TanaBlockElement | undefined)
        : undefined;

      if (parent?.tanaPresentation?.hiddenFieldNodeIds?.includes(candidate.id)) {
        return true;
      }

      const definition = getFieldDefinitionForOccurrence(document, candidate.tanaFieldId);
      const hasStoredValue = getTanaDirectChildPaths(document, candidatePath).some(
        (valuePath) => {
          const value = getTanaNodeAt(document, valuePath) as TanaBlockElement | undefined;

          return value?.tanaFieldValueType !== undefined && hasStoredFieldValueNode(value);
        }
      );

      switch (definition?.visibility ?? 'never') {
        case 'always':
          return true;
        case 'when-empty':
          return !hasStoredValue;
        case 'when-non-empty':
          return hasStoredValue;
        case 'when-default':
          return isTanaFieldNodeAtTemplateDefault(document, candidatePath);
        case 'never':
          break;
      }
    }

    candidatePath = getTanaParentPath(document, candidatePath);
  }

  return false;
}

/**
 * The one interaction boundary for the outliner: a top-level Tana node that
 * is neither concealed by a collapsed ancestor nor outside the derived Zoom
 * range. `null` represents the workspace root and keeps every Tana Node in
 * range.
 */
export function isTanaNodeInteractable(
  document: Value,
  path: Path,
  openIds: ReadonlySet<string>,
  focusedNodeId: NodeId | null
): boolean {
  return (
    !!getTanaNodeAt(document, path) &&
    !isTanaNodeHidden(document, path, openIds) &&
    !isTanaFieldNodePresentationHidden(document, path) &&
    isTanaNodeInZoomRange(document, path, focusedNodeId)
  );
}
