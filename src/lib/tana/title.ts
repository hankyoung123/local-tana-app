import type { FieldValue, NodeId, TanaIndex, TanaNode } from './types';

export type TanaTitleExpressionToken =
  | { kind: 'literal'; text: string; marks?: TanaTitleExpressionMarks }
  | {
      kind: 'expression';
      name: string;
      placeholder: boolean;
      limit?: string;
      raw: string;
      marks?: TanaTitleExpressionMarks;
    };

export type TanaTitleExpressionMarks = {
  bold?: true;
  italic?: true;
};

export type TanaTitleExpressionSegment = {
  marks?: TanaTitleExpressionMarks;
  text: string;
};

const FORMAT_TAG_PATTERN = /<\/?(?:b|i)>/g;

function hasBalancedFormatting(expression: string): boolean {
  const stack: string[] = [];

  for (const match of expression.matchAll(FORMAT_TAG_PATTERN)) {
    const tag = match[0];
    const name = tag.includes('b') ? 'b' : 'i';

    if (tag.startsWith('</')) {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }

  return stack.length === 0;
}

function marksForStack(stack: readonly string[]): TanaTitleExpressionMarks | undefined {
  const marks: TanaTitleExpressionMarks = {};

  if (stack.includes('b')) marks.bold = true;
  if (stack.includes('i')) marks.italic = true;

  return Object.keys(marks).length > 0 ? marks : undefined;
}

function withMarks<T extends { kind: 'literal' | 'expression' }>(
  token: T,
  marks: TanaTitleExpressionMarks | undefined
): T {
  return marks ? ({ ...token, marks } as T) : token;
}

/** Parses display-only title expressions without changing canonical text. */
export function parseTanaTitleExpression(
  expression: string
): readonly TanaTitleExpressionToken[] {
  const formattingIsBalanced = hasBalancedFormatting(expression);
  const tokens: TanaTitleExpressionToken[] = [];
  const pattern = /\$\{([^}]+)\}/g;
  let cursor = 0;
  const formattingStack: string[] = [];

  const emitLiteral = (text: string) => {
    if (!text) return;
    tokens.push(withMarks(
      { kind: 'literal', text },
      formattingIsBalanced ? marksForStack(formattingStack) : undefined
    ));
  };

  const emitFormatting = (text: string) => {
    if (!formattingIsBalanced) return false;

    const tag = text;
    const name = tag.includes('b') ? 'b' : 'i';

    if (tag.startsWith('</')) {
      if (formattingStack.at(-1) !== name) return false;
      formattingStack.pop();
    } else {
      formattingStack.push(name);
    }

    return true;
  };

  for (const match of expression.matchAll(pattern)) {
    const start = match.index ?? 0;
    const literal = expression.slice(cursor, start);
    let literalCursor = 0;

    for (const tagMatch of literal.matchAll(FORMAT_TAG_PATTERN)) {
      const tagStart = tagMatch.index ?? 0;
      const beforeTag = literal.slice(literalCursor, tagStart);
      emitLiteral(beforeTag);
      const tag = tagMatch[0];

      if (!formattingIsBalanced || !emitFormatting(tag)) {
        emitLiteral(tag);
      }

      literalCursor = tagStart + tag.length;
    }

    emitLiteral(literal.slice(literalCursor));

    const descriptor = match[1] ?? '';
    const [rawName, rawLimit] = descriptor.split('|', 2);
    const nameWithPlaceholder = rawName.trim();
    const limitWithPlaceholder = rawLimit?.trim();
    const placeholder = nameWithPlaceholder.endsWith('?') ||
      limitWithPlaceholder?.endsWith('?') === true;
    const name = nameWithPlaceholder.endsWith('?')
      ? nameWithPlaceholder.slice(0, -1).trim()
      : nameWithPlaceholder;
    const limit = limitWithPlaceholder?.endsWith('?')
      ? limitWithPlaceholder.slice(0, -1)
      : limitWithPlaceholder;

    tokens.push(withMarks(
      {
        kind: 'expression',
        name,
        placeholder,
        ...(limit ? { limit } : {}),
        raw: match[0],
      },
      formattingIsBalanced ? marksForStack(formattingStack) : undefined
    ));
    cursor = start + match[0].length;
  }

  const trailing = expression.slice(cursor);
  let trailingCursor = 0;

  for (const tagMatch of trailing.matchAll(FORMAT_TAG_PATTERN)) {
    const tagStart = tagMatch.index ?? 0;
    emitLiteral(trailing.slice(trailingCursor, tagStart));
    const tag = tagMatch[0];

    if (!formattingIsBalanced || !emitFormatting(tag)) {
      emitLiteral(tag);
    }

    trailingCursor = tagStart + tag.length;
  }

  emitLiteral(trailing.slice(trailingCursor));

  return tokens;
}

/**
 * A title expression is presentation derived from canonical Nodes. It never
 * writes computed text back into the Plate document or into the TanaIndex.
 */
export function getTanaTitleExpression(
  index: TanaIndex,
  nodeId: NodeId
): string | undefined {
  return index.nodesById.get(nodeId)?.titleExpression;
}

/** `${name}`-first expressions keep the canonical title editing affordance. */
export function isTanaTitleExpressionNameEditable(expression: string | undefined): boolean {
  return expression?.trim().startsWith('${name}') ?? false;
}

function formatFieldValue(
  index: TanaIndex,
  value: FieldValue,
  resolving: ReadonlySet<NodeId>
): string {
  switch (value.type) {
    case 'checkbox':
      return value.value ? '已完成' : '未完成';
    case 'from-supertag':
    case 'options':
      return index.nodesById.has(value.value)
        ? resolveTanaNodeTitleInternal(index, value.value, resolving)
        : '';
    default:
      return String(value.value);
  }
}

function getFieldNode(
  index: TanaIndex,
  nodeId: NodeId,
  name: string
) {
  const normalizedName = name.trim().toLocaleLowerCase();

  return (index.fieldNodesByParent.get(nodeId) ?? []).find((fieldNode) => {
    const definition = index.nodesById.get(fieldNode.fieldId);

    return definition?.text.trim().toLocaleLowerCase() === normalizedName;
  });
}

function getFieldPathValueText(
  index: TanaIndex,
  nodeId: NodeId,
  path: readonly string[],
  resolving: ReadonlySet<NodeId>
): string | undefined {
  const field = getFieldNode(index, nodeId, path[0] ?? '');

  if (!field) return;

  const values = field.values.map((value) => {
    if (path.length === 1) return formatFieldValue(index, value, resolving);

    if (value.type !== 'options' && value.type !== 'from-supertag') return '';

    return getFieldPathValueText(index, value.value, path.slice(1), resolving) ?? '';
  }).filter(Boolean);

  return values.length > 0 ? values.join(', ') : undefined;
}

function applyLimit(value: string, limit: string | undefined): string {
  if (!limit) return value;

  const match = limit.match(/^(\d+)(.*)$/);

  if (!match) return value;

  const max = Number(match[1]);

  if (!Number.isSafeInteger(max) || max < 0 || value.length <= max) return value;

  return `${value.slice(0, max)}${match[2] || '…'}`;
}

function getSystemAttribute(
  index: TanaIndex,
  node: TanaNode,
  name: string,
  resolving: ReadonlySet<NodeId>
): string | undefined {
  const raw = node.node as TanaNode['node'] & Record<string, unknown>;
  const readScalar = (...keys: string[]) => {
    const value = keys.map((key) => raw[key]).find(
      (candidate) => typeof candidate === 'string' || typeof candidate === 'number'
    );

    return value === undefined ? undefined : String(value);
  };

  switch (name.trim().toLocaleLowerCase()) {
    case 'donetime':
      return readScalar('tanaDoneTime', 'doneTime', 'tanaDoneAt');
    case 'description':
      return readScalar('tanaDescription', 'description');
    case 'lasteditedby':
      return readScalar('tanaLastEditedBy', 'lastEditedBy');
    case 'editedby':
      return readScalar('tanaEditedBy', 'editedBy');
    case 'owner':
      return readScalar('tanaOwner', 'owner') ?? (() => {
        const ownerId = index.parentNodeIds.get(node.id);
        return ownerId ? resolveTanaNodeTitleInternal(index, ownerId, resolving) : undefined;
      })();
    case 'datefromcalendarnode':
      return readScalar('tanaDateFromCalendarNode', 'dateFromCalendarNode');
    case 'createdat':
    case 'created':
      return readScalar('tanaCreatedAt', 'createdAt', 'created');
    case 'lasteditedat':
    case 'modifiedat':
    case 'modified':
      return readScalar('tanaLastEditedAt', 'lastEditedAt', 'tanaModifiedAt', 'modifiedAt', 'modified');
    case 'cdate':
      return readScalar('tanaCreatedDate', 'createdDate', 'tanaCreatedAt', 'createdAt', 'created');
    case 'ctime':
      return readScalar('tanaCreatedTime', 'createdTime');
    case 'mdate':
      return readScalar('tanaModifiedDate', 'modifiedDate', 'tanaModifiedAt', 'modifiedAt', 'modified');
    case 'mtime':
      return readScalar('tanaModifiedTime', 'modifiedTime');
    default:
      return undefined;
  }
}

function resolveExpressionValue(
  index: TanaIndex,
  node: TanaNode,
  name: string,
  resolving: ReadonlySet<NodeId>
): string | undefined {
  const path = name.split('.').map((part) => part.trim()).filter(Boolean);

  if (path.length === 0) return;

  const first = path[0] ?? '';
  const normalizedFirst = first.toLocaleLowerCase();

  if (normalizedFirst.startsWith('sys:')) {
    const systemName = first.slice(4).trim();

    if (systemName.toLocaleLowerCase() === 'owner' && path.length > 1) {
      const ownerId = index.parentNodeIds.get(node.id);

      return ownerId
        ? getFieldPathValueText(index, ownerId, path.slice(1), resolving)
        : undefined;
    }

    return getSystemAttribute(index, node, systemName, resolving);
  }

  if (path.length === 1 && ['cdate', 'ctime', 'mdate', 'mtime'].includes(normalizedFirst)) {
    return getSystemAttribute(index, node, normalizedFirst, resolving);
  }

  return getFieldPathValueText(index, node.id, path, resolving);
}

/** Resolves derived title text for search, sort, and accessibility without mutation. */
export function resolveTanaNodeTitle(index: TanaIndex, nodeId: NodeId): string {
  return resolveTanaNodeTitleSegments(index, nodeId).map((segment) => segment.text).join('');
}

/** Resolves a title expression into safe text segments for React renderers. */
export function resolveTanaNodeTitleSegments(
  index: TanaIndex,
  nodeId: NodeId
): readonly TanaTitleExpressionSegment[] {
  return resolveTanaNodeTitleSegmentsInternal(index, nodeId, new Set());
}

function resolveTanaNodeTitleSegmentsInternal(
  index: TanaIndex,
  nodeId: NodeId,
  resolving: ReadonlySet<NodeId>
): readonly TanaTitleExpressionSegment[] {
  const node = index.nodesById.get(nodeId);

  if (!node || node.titleExpression === undefined || node.titleExpression.length === 0) {
    return [{ text: node?.text ?? '' }];
  }

  if (resolving.has(nodeId)) return [{ text: node.rawText }];

  const nextResolving = new Set(resolving).add(nodeId);

  return parseTanaTitleExpression(node.titleExpression).flatMap((token) => {
    const value = token.kind === 'literal'
      ? token.text
      : token.name === 'name'
        ? node.rawText
        : resolveExpressionValue(index, node, token.name, nextResolving);
    const resolved = value === undefined || value.length === 0
      ? token.kind === 'expression' && token.placeholder ? token.raw : ''
      : token.kind === 'expression' ? applyLimit(value, token.limit) : value;

    return resolved.length > 0 ? [{ text: resolved, ...(token.marks ? { marks: token.marks } : {}) }] : [];
  });
}

function resolveTanaNodeTitleInternal(
  index: TanaIndex,
  nodeId: NodeId,
  resolving: ReadonlySet<NodeId>
): string {
  const node = index.nodesById.get(nodeId);
  const expression = node?.titleExpression;

  if (!node || expression === undefined || expression.length === 0) return node?.text ?? '';

  if (resolving.has(nodeId)) return node.rawText;

  const nextResolving = new Set(resolving).add(nodeId);

  return parseTanaTitleExpression(expression).map((token) => {
    if (token.kind === 'literal') return token.text;

    const value = token.name === 'name'
      ? node.rawText
      : resolveExpressionValue(index, node, token.name, nextResolving);

    if (value === undefined || value.length === 0) {
      return token.placeholder ? token.raw : '';
    }

    return applyLimit(value, token.limit);
  }).join('');
}

/** Used by renderers that need both the canonical Node and its derived title. */
export function getTanaNodeTitle(index: TanaIndex, node: TanaNode): string {
  return resolveTanaNodeTitle(index, node.id);
}
