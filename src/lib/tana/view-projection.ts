import { getTanaProjectionTarget } from './index';
import { getSupertagTemplateFields } from './fields';
import { resolveTanaNodeTitle } from './title';
import type {
  FieldValue,
  NodeId,
  TanaIndex,
  TanaNode,
  TanaViewDefinition,
  TanaViewFilterClause,
} from './types';

const TITLE_SORT = '$title';
const DEFAULT_PAGE_SIZE = 100;

export type TanaViewProjectionItem = {
  /** The occurrence preserves source/context identity for navigation. */
  occurrence: TanaNode;
  /** All content semantics are read from this one direct canonical target. */
  target: TanaNode;
};

export type TanaViewProjectionGroup = {
  fieldValue?: FieldValue;
  key: string;
  label: string;
  items: readonly TanaViewProjectionItem[];
};

export type TanaViewProjection = {
  availableFieldIds: readonly NodeId[];
  groups: readonly TanaViewProjectionGroup[];
  items: readonly TanaViewProjectionItem[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  visibleFieldIds: readonly NodeId[];
};

function fieldNodes(index: TanaIndex, targetId: NodeId, fieldId: NodeId) {
  return (index.fieldNodesByParent.get(targetId) ?? []).filter(
    (field) => field.fieldId === fieldId
  );
}

function fieldValues(index: TanaIndex, targetId: NodeId, fieldId: NodeId): FieldValue[] {
  return fieldNodes(index, targetId, fieldId).flatMap((field) => field.values);
}

function hasStoredFieldValue(index: TanaIndex, targetId: NodeId, fieldId: NodeId): boolean {
  return fieldNodes(index, targetId, fieldId).some((field) => field.hasStoredValue);
}

function equalFieldValue(left: FieldValue, right: FieldValue): boolean {
  return left.type === right.type && left.value === right.value;
}

function hasUsableField(index: TanaIndex, fieldId: NodeId): boolean {
  return index.nodesById.get(fieldId)?.fieldDefinition !== undefined;
}

/** Missing field definitions disable the affected filter rather than corrupting a projection. */
export function matchesTanaViewFilterClause(
  index: TanaIndex,
  target: TanaNode,
  clause: TanaViewFilterClause
): boolean {
  switch (clause.kind) {
    case 'text-contains':
      return [target.text, resolveTanaNodeTitle(index, target.id)]
        .some((text) => text.toLocaleLowerCase().includes(clause.text.toLocaleLowerCase()));
    case 'has-supertag':
      return target.supertagIds.includes(clause.supertagId);
    case 'field-set':
      return !hasUsableField(index, clause.fieldId) || hasStoredFieldValue(index, target.id, clause.fieldId);
    case 'field-not-set':
      return !hasUsableField(index, clause.fieldId) || !hasStoredFieldValue(index, target.id, clause.fieldId);
    case 'field-equals':
      return !hasUsableField(index, clause.fieldId) || fieldValues(index, target.id, clause.fieldId).some((value) => equalFieldValue(value, clause.value));
  }
}

export function matchesTanaViewFilter(
  index: TanaIndex,
  target: TanaNode,
  definition: TanaViewDefinition | undefined
): boolean {
  const filter = definition?.filter;
  if (!filter || filter.clauses.length === 0) return true;

  const match = (clause: TanaViewFilterClause) =>
    matchesTanaViewFilterClause(index, target, clause);

  return filter.mode === 'or' ? filter.clauses.some(match) : filter.clauses.every(match);
}

export function getTanaViewFieldValueLabel(
  index: TanaIndex,
  targetId: NodeId,
  fieldId: NodeId
): string {
  return fieldValues(index, targetId, fieldId)
    .map((value) =>
      value.type === 'options' || value.type === 'from-supertag'
        ? resolveTanaNodeTitle(index, value.value)
        : String(value.value)
    )
    .join('、');
}

function compareValues(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/** Stable multi-sort: document/source order remains the final tie breaker. */
export function sortTanaViewProjectionItems(
  index: TanaIndex,
  items: readonly TanaViewProjectionItem[],
  definition: TanaViewDefinition | undefined
): TanaViewProjectionItem[] {
  const criteria = definition?.sort?.filter(
    (criterion) => criterion.fieldId === TITLE_SORT || hasUsableField(index, criterion.fieldId)
  ) ?? [];

  if (criteria.length === 0) return [...items];

  return items
    .map((item, position) => ({ item, position }))
    .sort((left, right) => {
      for (const criterion of criteria) {
        const leftValue = criterion.fieldId === TITLE_SORT
          ? resolveTanaNodeTitle(index, left.item.target.id)
          : getTanaViewFieldValueLabel(index, left.item.target.id, criterion.fieldId);
        const rightValue = criterion.fieldId === TITLE_SORT
          ? resolveTanaNodeTitle(index, right.item.target.id)
          : getTanaViewFieldValueLabel(index, right.item.target.id, criterion.fieldId);
        const comparison = compareValues(leftValue, rightValue);
        if (comparison !== 0) return criterion.direction === 'asc' ? comparison : -comparison;
      }
      return left.position - right.position;
    })
    .map(({ item }) => item);
}

/** Configured fields and template fields are derived from canonical targets only. */
export function getTanaViewAvailableFieldIds(
  index: TanaIndex,
  items: readonly TanaViewProjectionItem[],
  configuredFieldIds: readonly NodeId[] = []
): NodeId[] {
  const fieldIds: NodeId[] = [];
  const seen = new Set<NodeId>();
  const add = (fieldId: NodeId) => {
    if (seen.has(fieldId) || !hasUsableField(index, fieldId)) return;
    seen.add(fieldId);
    fieldIds.push(fieldId);
  };

  configuredFieldIds.forEach(add);
  for (const { target } of items) {
    target.supertagIds.forEach((supertagId) =>
      getSupertagTemplateFields(index, supertagId).forEach((field) => add(field.fieldId))
    );
    (index.fieldNodesByParent.get(target.id) ?? []).forEach((field) => add(field.fieldId));
  }
  return fieldIds;
}

function getGroupValue(index: TanaIndex, targetId: NodeId, fieldId: NodeId): FieldValue | undefined {
  return fieldValues(index, targetId, fieldId)[0];
}

function paginate<T>(items: readonly T[], definition: TanaViewDefinition | undefined) {
  const pageSize = definition?.pagination?.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const configuredPage = definition?.pagination?.page ?? 0;
  const page = Math.min(configuredPage, pageCount - 1);
  return {
    items: items.slice(page * pageSize, page * pageSize + pageSize),
    page,
    pageCount,
    pageSize,
  };
}

/**
 * The shared projection pipeline. It deliberately retains an occurrence for
 * identity while reading filter/sort/display values from its canonical target.
 * Nothing here writes a result list into the Plate document.
 */
export function resolveTanaViewProjection(
  index: TanaIndex,
  view: TanaNode,
  source: readonly TanaNode[]
): TanaViewProjection {
  const definition = view.viewDefinition;
  const allItems = source.flatMap((occurrence) => {
    const target = getTanaProjectionTarget(index, occurrence.id);
    return target ? [{ occurrence, target }] : [];
  });
  const filtered = allItems.filter(({ target }) => matchesTanaViewFilter(index, target, definition));
  const sorted = sortTanaViewProjectionItems(index, filtered, definition);
  const paged = paginate(sorted, definition);
  const configuredFields = [
    ...(definition?.visibleFieldIds ?? []),
    ...(definition?.sort?.flatMap((criterion) => criterion.fieldId === TITLE_SORT ? [] : [criterion.fieldId]) ?? []),
    ...(definition?.groupFieldId ? [definition.groupFieldId] : []),
    ...(definition?.calendarDateFieldIds ?? []),
  ];
  const availableFieldIds = getTanaViewAvailableFieldIds(index, allItems, configuredFields);
  const visibleFieldIds = definition?.visibleFieldIds
    ? availableFieldIds.filter((fieldId) => definition.visibleFieldIds?.includes(fieldId))
    : availableFieldIds;
  const groupFieldId =
    (definition?.type === 'outline' || definition?.type === 'cards') &&
    definition.groupFieldId &&
    hasUsableField(index, definition.groupFieldId)
      ? definition.groupFieldId
      : undefined;
  const groupsByKey = new Map<string, { fieldValue?: FieldValue; items: TanaViewProjectionItem[]; label: string }>();
  for (const item of paged.items) {
    const fieldValue = groupFieldId ? getGroupValue(index, item.target.id, groupFieldId) : undefined;
    const key = fieldValue ? `${fieldValue.type}:${String(fieldValue.value)}` : '__unset__';
    const label = groupFieldId
      ? getTanaViewFieldValueLabel(index, item.target.id, groupFieldId) || '未设置'
      : '';
    const group = groupsByKey.get(key) ?? { fieldValue, items: [], label };
    group.items.push(item);
    groupsByKey.set(key, group);
  }

  return {
    availableFieldIds,
    groups: Array.from(groupsByKey, ([key, group]) => ({ key, ...group })),
    items: paged.items,
    page: paged.page,
    pageCount: paged.pageCount,
    pageSize: paged.pageSize,
    total: sorted.length,
    visibleFieldIds,
  };
}
