import type {
  FieldDefinition,
  FieldId,
  TanaIndex,
  TanaNode,
  TanaQueryClause,
} from './types';
import { isFieldDefined, isFieldValueValid } from './fields';

export function getFieldDefinition(
  index: TanaIndex,
  fieldId: FieldId
): FieldDefinition | undefined {
  return index.nodesById.get(fieldId)?.fieldDefinition;
}

export function getFieldDisplayName(index: TanaIndex, fieldId: FieldId): string {
  return index.nodesById.get(fieldId)?.text || fieldId;
}

/** Validates new v1 Query clauses against the current derived Tana Index. */
export function isTanaQueryClauseValid(
  index: TanaIndex,
  clause: TanaQueryClause
): boolean {
  switch (clause.kind) {
    case 'has-supertag':
      return !!index.nodesById.get(clause.supertagId)?.supertagDefinition;
    case 'field-defined':
    case 'field-exists':
      return !!getFieldDefinition(index, clause.fieldId);
    case 'field-equals': {
      const definition = getFieldDefinition(index, clause.fieldId);

      return !!definition && isFieldValueValid(index, definition, clause.value);
    }
    case 'text-contains':
      return clause.text.trim().length > 0;
  }
}

export function describeTanaQueryClause(
  index: TanaIndex,
  clause: TanaQueryClause
): string {
  switch (clause.kind) {
    case 'field-equals':
      return `${getFieldDisplayName(index, clause.fieldId)} 等于 ${String(clause.value.value)}`;
    case 'field-defined':
      return `${getFieldDisplayName(index, clause.fieldId)} 已定义`;
    case 'field-exists':
      return `${getFieldDisplayName(index, clause.fieldId)} 已设置`;
    case 'has-supertag':
      return `包含 #${index.nodesById.get(clause.supertagId)?.text ?? clause.supertagId}`;
    case 'text-contains':
      return `文本包含“${clause.text}”`;
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
    case 'field-defined':
      return isFieldDefined(index, node.id, clause.fieldId);
    case 'field-exists':
      return index.fieldValues.get(node.id)?.get(clause.fieldId) != null;
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
