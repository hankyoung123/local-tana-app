"use client";

import * as React from "react";

import { LayoutPanelTopIcon, ListFilterIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEditorRef, type PlateEditor } from "platejs/react";

import { TanaSearchPlugin } from "@/components/editor/plugins/tana-search-plugin";
import { TanaViewPlugin } from "@/components/editor/plugins/tana-view-plugin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  describeTanaQueryClause,
  getFieldValueCandidates,
  isTanaNodeActive,
  resolveTanaCollectionSource,
  type FieldDefinition,
  type FieldValue,
  type NodeId,
  type TanaBlockElement,
  type TanaIndex,
  type TanaQueryExpression,
  type TanaQueryPredicate,
  type TanaViewDefinition,
} from "@/lib/tana";

import { TanaCalendarToolbarControls } from "./tana-calendar-view";
import { TanaCardsToolbarControls } from "./tana-cards-view";
import { TanaTableToolbarControls } from "./tana-table-view";

type QueryGroup = Extract<TanaQueryExpression, { type: "and" | "or" }>;
type QueryPredicateKind = TanaQueryPredicate["kind"];
type FieldQueryPredicate = Extract<TanaQueryPredicate, { fieldId: NodeId }>;
type GraphQueryPredicate = Extract<TanaQueryPredicate, { nodeId: NodeId }>;

const graphPredicateKinds: readonly Extract<
  QueryPredicateKind,
  "child-of" | "descendant-of" | "parent-is" | "references" | "referenced-by"
>[] = ["parent-is", "child-of", "descendant-of", "references", "referenced-by"];

const viewTypeLabels: Record<TanaViewDefinition["type"], string> = {
  calendar: "日历",
  cards: "卡片",
  outline: "大纲",
  table: "表格",
};

/**
 * View settings remain on the canonical View Node. This is only a contextual
 * presentation of the existing TanaViewPlugin controls; it owns no results
 * and no local view configuration state.
 */
export function TanaViewConfigurationEditor({
  index,
  nodeId,
}: {
  index: TanaIndex;
  nodeId: NodeId;
}) {
  const editor = useEditorRef();
  const view = index.nodesById.get(nodeId);

  if (!view?.viewDefinition) return null;

  const type = view.viewDefinition.type;
  const results = resolveTanaCollectionSource(index, view).nodes;

  return (
    <section className="border-t border-[var(--tana-divider)] px-5 py-4">
      <h3 className="mb-2.5 font-medium text-[var(--tana-text-tertiary)] text-[10px] uppercase tracking-[0.1em]">
        视图配置
      </h3>
      <Select
        value={type}
        onValueChange={(nextType) =>
          editor
            .getTransforms(TanaViewPlugin)
            .view.setType(nodeId, nextType as TanaViewDefinition["type"])
        }
      >
        <SelectTrigger className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
          <LayoutPanelTopIcon className="size-3.5" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(viewTypeLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {type !== "outline" && (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-[var(--tana-divider)] pt-3">
          {type === "table" ? (
            <TanaTableToolbarControls index={index} results={results} view={view} />
          ) : type === "cards" ? (
            <TanaCardsToolbarControls index={index} results={results} view={view} />
          ) : (
            <TanaCalendarToolbarControls index={index} results={results} view={view} />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The persisted AST remains on the Plate Node. Local state below is only an
 * uncommitted predicate form; every structural change writes one validated
 * TanaQueryExpression through TanaSearchPlugin.
 */
export function TanaSearchDefinitionEditor({
  editor,
  index,
  node,
  nodeId,
}: {
  editor: PlateEditor;
  index: TanaIndex;
  node: TanaBlockElement;
  nodeId: NodeId;
}) {
  const definition = node.tanaSearchDefinition;

  if (!definition) {
    return (
      <div className="border-t p-5">
        <Button
          className="w-full"
          size="sm"
          variant="outline"
          onClick={() =>
            editor.getTransforms(TanaSearchPlugin).search.define(nodeId)
          }
        >
          <ListFilterIcon />
          定义为搜索
        </Button>
      </div>
    );
  }

  return (
    <section className="border-t border-[var(--tana-divider)] px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium text-[10px] text-[var(--tana-text-tertiary)] uppercase tracking-[0.1em]">
          <ListFilterIcon className="size-3.5" />
          搜索定义
        </h3>
        <button
          className="rounded p-1 text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]"
          type="button"
          aria-label="移除搜索定义"
          onClick={() =>
            editor.getTransforms(TanaSearchPlugin).search.remove(nodeId)
          }
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      <QueryExpressionEditor
        expression={definition.query}
        index={index}
        onChange={(query) =>
          editor.getTransforms(TanaSearchPlugin).search.setQuery(nodeId, query)
        }
        root
      />
    </section>
  );
}

function QueryExpressionEditor({
  expression,
  index,
  onChange,
  onRemove,
  root = false,
}: {
  expression: TanaQueryExpression;
  index: TanaIndex;
  onChange: (expression: TanaQueryExpression) => void;
  onRemove?: () => void;
  root?: boolean;
}) {
  switch (expression.type) {
    case "predicate":
      return (
        <QueryPredicateRow
          index={index}
          predicate={expression.predicate}
          onChange={(predicate) => onChange({ predicate, type: "predicate" })}
          onRemove={onRemove}
        />
      );
    case "not":
      return (
        <div className="rounded border border-amber-200 bg-amber-50/40 p-2">
          <QueryNodeHeader label="非（NOT）" onRemove={onRemove} />
          <div className="mt-2 border-amber-200 border-l pl-2">
            <QueryExpressionEditor
              expression={expression.child}
              index={index}
              onChange={(child) => onChange({ child, type: "not" })}
            />
          </div>
        </div>
      );
    case "and":
    case "or":
      return (
        <QueryGroupEditor
          expression={expression}
          index={index}
          onChange={onChange}
          onRemove={onRemove}
          root={root}
        />
      );
  }
}

function QueryGroupEditor({
  expression,
  index,
  onChange,
  onRemove,
  root,
}: {
  expression: QueryGroup;
  index: TanaIndex;
  onChange: (expression: TanaQueryExpression) => void;
  onRemove?: () => void;
  root: boolean;
}) {
  const [addingPredicate, setAddingPredicate] = React.useState(false);
  const updateChild = (childIndex: number, child: TanaQueryExpression) => {
    onChange({
      ...expression,
      children: expression.children.map((current, indexInGroup) =>
        indexInGroup === childIndex ? child : current,
      ),
    });
  };
  const removeChild = (childIndex: number) => {
    onChange({
      ...expression,
      children: expression.children.filter(
        (_, indexInGroup) => indexInGroup !== childIndex,
      ),
    });
  };
  const append = (child: TanaQueryExpression) => {
    onChange({ ...expression, children: [...expression.children, child] });
  };

  return (
        <div className="rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] p-2">
      <div className="flex items-center gap-2">
        <Select
          value={expression.type}
          onValueChange={(type) =>
            onChange({ ...expression, type: type as QueryGroup["type"] })
          }
        >
          <SelectTrigger className="h-7 min-w-20 border-0 bg-transparent px-1.5 font-medium text-[11px] shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">全部满足（AND）</SelectItem>
            <SelectItem value="or">任一满足（OR）</SelectItem>
          </SelectContent>
        </Select>
        {root && (
          <span className="text-[10px] text-muted-foreground">根条件</span>
        )}
        <span className="min-w-0 flex-1" />
        {onRemove && <RemoveQueryNodeButton onClick={onRemove} />}
      </div>

      <div className="mt-2 space-y-1.5 border-l pl-2">
        {expression.children.map((child, childIndex) => (
          <QueryExpressionEditor
            key={`${childIndex}:${JSON.stringify(child)}`}
            expression={child}
            index={index}
            onChange={(next) => updateChild(childIndex, next)}
            onRemove={() => removeChild(childIndex)}
          />
        ))}
        {expression.children.length === 0 && (
          <p className="py-1 text-[11px] text-muted-foreground">
            {expression.type === "and"
              ? "空 AND 显示所有节点。"
              : "空 OR 不返回节点。"}
          </p>
        )}
      </div>

      {addingPredicate ? (
        <div className="mt-2 border-t pt-2">
          <QueryPredicateForm
            index={index}
            onCancel={() => setAddingPredicate(false)}
            onSubmit={(predicate) => {
              append({ predicate, type: "predicate" });
              setAddingPredicate(false);
            }}
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button
            className="h-7 px-2 text-[11px]"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setAddingPredicate(true)}
          >
            <PlusIcon />
            条件
          </Button>
          <Button
            className="h-7 px-2 text-[11px]"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => append({ children: [], type: "and" })}
          >
            <PlusIcon />
            AND 组
          </Button>
          <Button
            className="h-7 px-2 text-[11px]"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => append({ children: [], type: "or" })}
          >
            <PlusIcon />
            OR 组
          </Button>
          <Button
            className="h-7 px-2 text-[11px]"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() =>
              append({ child: { children: [], type: "and" }, type: "not" })
            }
          >
            <PlusIcon />
            NOT 组
          </Button>
        </div>
      )}
    </div>
  );
}

function QueryNodeHeader({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-[11px]">{label}</span>
      <span className="min-w-0 flex-1" />
      {onRemove && <RemoveQueryNodeButton onClick={onRemove} />}
    </div>
  );
}

function RemoveQueryNodeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
      type="button"
      aria-label="移除查询节点"
      onClick={onClick}
    >
      <Trash2Icon className="size-3" />
    </button>
  );
}

function QueryPredicateRow({
  index,
  predicate,
  onChange,
  onRemove,
}: {
  index: TanaIndex;
  predicate: TanaQueryPredicate;
  onChange: (predicate: TanaQueryPredicate) => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = React.useState(false);

  if (editing) {
    return (
        <div className="rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] p-2">
        <QueryPredicateForm
          key={JSON.stringify(predicate)}
          index={index}
          initial={predicate}
          onCancel={() => setEditing(false)}
          onSubmit={(next) => {
            onChange(next);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--tana-hover)]">
      <span className="min-w-0 flex-1">
        {describeTanaQueryClause(index, predicate)}
      </span>
      <button
        className="rounded px-1 text-[11px] text-muted-foreground hover:text-foreground"
        type="button"
        onClick={() => setEditing(true)}
      >
        编辑
      </button>
      {onRemove && <RemoveQueryNodeButton onClick={onRemove} />}
    </div>
  );
}

function QueryPredicateForm({
  index,
  initial,
  onCancel,
  onSubmit,
}: {
  index: TanaIndex;
  initial?: TanaQueryPredicate;
  onCancel: () => void;
  onSubmit: (predicate: TanaQueryPredicate) => void;
}) {
  const [kind, setKind] = React.useState<QueryPredicateKind>(
    initial?.kind ?? "has-supertag",
  );
  const [fieldId, setFieldId] = React.useState(getPredicateFieldId(initial));
  const [rawValue, setRawValue] = React.useState(getPredicateRawValue(initial));
  const [supertagId, setSupertagId] = React.useState(
    initial?.kind === "has-supertag" ? initial.supertagId : "",
  );
  const [text, setText] = React.useState(
    initial?.kind === "text-contains" ? initial.text : "",
  );
  const [targetNodeId, setTargetNodeId] = React.useState(
    getGraphTargetNodeId(initial),
  );
  const supertags = Array.from(index.nodesById.values()).filter(
    (item) =>
      isTanaNodeActive(index, item.id) &&
      item.semanticTypes.includes("supertag-definition"),
  );
  const fields = new Map(
    Array.from(index.nodesById.values())
      .filter(
        (item) =>
          isTanaNodeActive(index, item.id) &&
          item.semanticTypes.includes("field-definition"),
      )
      .map((item) => [item.id, item]),
  );
  const selectedField = fields.get(fieldId);
  const predicate = getDraftPredicate({
    field: selectedField?.fieldDefinition,
    fieldId,
    kind,
    rawValue,
    supertagId,
    targetNodeId,
    text,
  });

  return (
    <div className="space-y-2">
      <Select
        value={kind}
        onValueChange={(value) => setKind(value as QueryPredicateKind)}
      >
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="has-supertag">包含超级标签</SelectItem>
          <SelectItem value="field-equals">字段等于</SelectItem>
          <SelectItem value="field-defined">字段已定义</SelectItem>
          <SelectItem value="field-exists">字段已设置</SelectItem>
          <SelectItem value="text-contains">文本包含</SelectItem>
          <SelectItem value="parent-is">父节点是</SelectItem>
          <SelectItem value="child-of">是节点的直接子节点</SelectItem>
          <SelectItem value="descendant-of">属于节点后代</SelectItem>
          <SelectItem value="references">引用节点</SelectItem>
          <SelectItem value="referenced-by">被节点引用</SelectItem>
        </SelectContent>
      </Select>

      {kind === "has-supertag" && (
        <Select value={supertagId} onValueChange={setSupertagId}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="选择超级标签" />
          </SelectTrigger>
          <SelectContent>
            {supertags.map((supertag) => (
              <SelectItem key={supertag.id} value={supertag.id}>
                #{supertag.text || "未命名超级标签"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isFieldPredicateKind(kind) && (
        <Select value={fieldId} onValueChange={setFieldId}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="选择字段" />
          </SelectTrigger>
          <SelectContent>
            {Array.from(fields.values()).map((field) => (
              <SelectItem key={field.id} value={field.id}>
                {field.text || field.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {kind === "field-equals" && selectedField?.fieldDefinition && (
        <QueryValueInput
          field={selectedField.fieldDefinition}
          fieldId={selectedField.id}
          index={index}
          value={rawValue}
          onChange={setRawValue}
        />
      )}

      {kind === "text-contains" && (
        <Input
          className="h-8 text-xs"
          value={text}
          placeholder="要查找的文本"
          onChange={(event) => setText(event.target.value)}
        />
      )}

      {graphPredicateKinds.includes(
        kind as (typeof graphPredicateKinds)[number],
      ) && (
        <Select value={targetNodeId} onValueChange={setTargetNodeId}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="选择节点" />
          </SelectTrigger>
          <SelectContent>
            {Array.from(index.nodesById.values())
              .filter((candidate) => isTanaNodeActive(index, candidate.id))
              .map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.text || "未命名节点"}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex justify-end gap-1">
        <Button
          className="h-7 px-2 text-[11px]"
          size="sm"
          type="button"
          variant="ghost"
          onClick={onCancel}
        >
          取消
        </Button>
        <Button
          className="h-7 px-2 text-[11px]"
          disabled={!predicate}
          size="sm"
          type="button"
          onClick={() => predicate && onSubmit(predicate)}
        >
          保存条件
        </Button>
      </div>
    </div>
  );
}

function isFieldPredicateKind(kind: QueryPredicateKind): boolean {
  return (
    kind === "field-defined" ||
    kind === "field-equals" ||
    kind === "field-exists"
  );
}

function isFieldQueryPredicate(
  predicate: TanaQueryPredicate,
): predicate is FieldQueryPredicate {
  return isFieldPredicateKind(predicate.kind);
}

function isGraphQueryPredicate(
  predicate: TanaQueryPredicate,
): predicate is GraphQueryPredicate {
  return graphPredicateKinds.includes(
    predicate.kind as (typeof graphPredicateKinds)[number],
  );
}

function getPredicateFieldId(
  predicate: TanaQueryPredicate | undefined,
): string {
  return predicate && isFieldQueryPredicate(predicate) ? predicate.fieldId : "";
}

function getPredicateRawValue(
  predicate: TanaQueryPredicate | undefined,
): string {
  return predicate?.kind === "field-equals"
    ? String(predicate.value.value)
    : "";
}

function getGraphTargetNodeId(
  predicate: TanaQueryPredicate | undefined,
): string {
  return predicate && isGraphQueryPredicate(predicate) ? predicate.nodeId : "";
}

function getDraftPredicate({
  field,
  fieldId,
  kind,
  rawValue,
  supertagId,
  targetNodeId,
  text,
}: {
  field: FieldDefinition | undefined;
  fieldId: string;
  kind: QueryPredicateKind;
  rawValue: string;
  supertagId: string;
  targetNodeId: string;
  text: string;
}): TanaQueryPredicate | undefined {
  switch (kind) {
    case "has-supertag":
      return supertagId ? { kind, supertagId } : undefined;
    case "field-defined":
    case "field-exists":
      return fieldId ? { fieldId, kind } : undefined;
    case "field-equals": {
      if (!field || !fieldId) return;
      const value = getFieldValue(field, rawValue);
      return value ? { fieldId, kind, value } : undefined;
    }
    case "text-contains":
      return text.trim() ? { kind, text: text.trim() } : undefined;
    case "parent-is":
    case "child-of":
    case "descendant-of":
    case "references":
    case "referenced-by":
      return targetNodeId ? { kind, nodeId: targetNodeId } : undefined;
  }
}

function QueryValueInput({
  field,
  fieldId,
  index,
  onChange,
  value,
}: {
  field: FieldDefinition;
  fieldId: NodeId;
  index: TanaIndex;
  onChange: (value: string) => void;
  value: string;
}) {
  if (
    field.type === "checkbox" ||
    field.type === "options" ||
    field.type === "from-supertag"
  ) {
    const options =
      field.type === "checkbox"
        ? [
            { label: "是", value: "true" },
            { label: "否", value: "false" },
          ]
        : getFieldValueCandidates(index, fieldId).map((item) => ({
            label: item.text || item.id,
            value: item.id,
          }));
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder="选择值" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      className="h-8 text-xs"
      type={
        field.type === "number"
          ? "number"
          : field.type === "date"
            ? "date"
            : field.type === "email"
              ? "email"
              : field.type === "url"
                ? "url"
                : "text"
      }
      value={value}
      placeholder="值"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function getFieldValue(
  field: FieldDefinition,
  rawValue: string,
): FieldValue | undefined {
  if (!rawValue) return;
  switch (field.type) {
    case "checkbox":
      return { type: "checkbox", value: rawValue === "true" };
    case "date":
      return { type: "date", value: rawValue };
    case "email":
      return { type: "email", value: rawValue };
    case "from-supertag":
      return { type: "from-supertag", value: rawValue };
    case "number": {
      const value = Number(rawValue);
      return Number.isNaN(value) ? undefined : { type: "number", value };
    }
    case "options":
      return { type: "options", value: rawValue };
    case "plain":
      return { type: "plain", value: rawValue };
    case "url":
      return { type: "url", value: rawValue };
  }
}
