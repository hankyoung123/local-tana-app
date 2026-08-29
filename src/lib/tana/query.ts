import type {
  FieldDefinition,
  FieldId,
  TanaIndex,
  TanaNode,
  TanaQueryClause,
} from './types';

export function getFieldDefinition(
  index: TanaIndex,
  fieldId: FieldId
): FieldDefinition | undefined {
  for (const node of index.nodesById.values()) {
    const field = node.supertagDefinition?.fields.find(
      ({ id }) => id === fieldId
    );

    if (field) return field;
  }
}

export function describeTanaQueryClause(
  index: TanaIndex,
  clause: TanaQueryClause
): string {
  switch (clause.kind) {
    case 'field-equals':
      return `${getFieldDefinition(index, clause.fieldId)?.name ?? clause.fieldId} equals ${String(clause.value.value)}`;
    case 'field-exists':
      return `${getFieldDefinition(index, clause.fieldId)?.name ?? clause.fieldId} exists`;
    case 'has-supertag':
      return `has #${index.nodesById.get(clause.supertagId)?.text ?? clause.supertagId}`;
    case 'text-contains':
      return `text contains “${clause.text}”`;
  }
}

function fieldValuesEqual(
  left: TanaQueryClause & { kind: 'field-equals' },
  node: TanaNode,
  index: TanaIndex
) {
  const actual = index.fieldValues.get(node.id)?.get(left.fieldId);

  return actual?.type === left.value.type && actual.value === left.value.value;
}

export function matchesTanaQueryClause(
  node: TanaNode,
  index: TanaIndex,
  clause: TanaQueryClause
): boolean {
  switch (clause.kind) {
    case 'field-equals':
      return fieldValuesEqual(clause, node, index);
    case 'field-exists':
      return index.fieldValues.get(node.id)?.has(clause.fieldId) ?? false;
    case 'has-supertag':
      return index.nodesBySupertag.get(clause.supertagId)?.includes(node.id) ?? false;
    case 'text-contains':
      return node.text
        .toLocaleLowerCase()
        .includes(clause.text.trim().toLocaleLowerCase());
  }
}

/** Runs the intentionally small v1 query language using AND semantics. */
export function runTanaQuery(
  index: TanaIndex,
  clauses: readonly TanaQueryClause[]
): TanaNode[] {
  return Array.from(index.nodesById.values()).filter((node) =>
    clauses.every((clause) => matchesTanaQueryClause(node, index, clause))
  );
}
