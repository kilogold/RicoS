"use client";

import { useMenuEditor } from "./menu-editor-context";
import {
  DeferredNumberField,
  SelectField,
  TextField,
} from "./menu-editor-fields";
import { VisibilityRuleBuilder } from "./menu-editor-panels";
import {
  buildFieldPath,
  DOLLAR_STEP,
  formatDollars,
  makeModifierOption,
  parseDollars,
} from "./menu-editor-utils";
import type { ModifierGroup, ModifierOption, SelectionType } from "@ricos/shared";

const SELECTION_TYPES: SelectionType[] = ["single", "multiple"];

export function MenuEditorModifierGroup({
  group,
  groupIndex,
}: {
  group: ModifierGroup;
  groupIndex: number;
}) {
  const {
    theme,
    selected,
    fieldChanged,
    updateModifierGroup,
    updateModifierOption,
    updateSelectedItem,
  } = useMenuEditor();

  const groupPath = buildFieldPath("modifierGroups", groupIndex);
  const groupChanged = fieldChanged(groupPath, group);
  const allGroups = selected.item?.modifierGroups ?? [];

  return (
    <section
      className={`rounded-lg border p-4 ${groupChanged ? theme.changedPanel : theme.cardBorder}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid flex-1 gap-4 md:grid-cols-2">
          <TextField
            label="Group title (English)"
            value={group.title.en}
            onChange={(value) =>
              updateModifierGroup(groupIndex, (current) => ({
                ...current,
                title: { ...current.title, en: value },
              }))
            }
            theme={theme}
            changed={fieldChanged(buildFieldPath(groupPath, "title", "en"), group.title.en)}
          />
          <TextField
            label="Group title (Spanish)"
            value={group.title.es}
            onChange={(value) =>
              updateModifierGroup(groupIndex, (current) => ({
                ...current,
                title: { ...current.title, es: value },
              }))
            }
            theme={theme}
            changed={fieldChanged(buildFieldPath(groupPath, "title", "es"), group.title.es)}
          />
          <TextField
            label="Group ID (internal)"
            value={group.id}
            onChange={(value) =>
              updateModifierGroup(groupIndex, (current) => ({ ...current, id: value }))
            }
            theme={theme}
            changed={fieldChanged(buildFieldPath(groupPath, "id"), group.id)}
          />
          <SelectField
            label="Pick one or many"
            value={group.selectionType}
            options={SELECTION_TYPES}
            optionLabels={{ single: "Pick one", multiple: "Pick many" }}
            onChange={(value) =>
              updateModifierGroup(groupIndex, (current) => ({
                ...current,
                selectionType: value,
              }))
            }
            theme={theme}
            changed={fieldChanged(buildFieldPath(groupPath, "selectionType"), group.selectionType)}
          />
          <DeferredNumberField
            label="Minimum picks"
            numericValue={group.minSelections}
            format={(value) => String(value)}
            parse={(value) => Number.parseInt(value, 10) || 0}
            step="1"
            onChange={(minSelections) =>
              updateModifierGroup(groupIndex, (current) => ({ ...current, minSelections }))
            }
            theme={theme}
            changed={fieldChanged(buildFieldPath(groupPath, "minSelections"), group.minSelections)}
          />
          <DeferredNumberField
            label="Maximum picks"
            numericValue={group.maxSelections}
            format={(value) => String(value)}
            parse={(value) => Number.parseInt(value, 10) || 0}
            step="1"
            onChange={(maxSelections) =>
              updateModifierGroup(groupIndex, (current) => ({ ...current, maxSelections }))
            }
            theme={theme}
            changed={fieldChanged(buildFieldPath(groupPath, "maxSelections"), group.maxSelections)}
          />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <label
            className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm ${
              fieldChanged(buildFieldPath(groupPath, "required"), group.required)
                ? `${theme.changedPanel} ${theme.changedText}`
                : theme.checkboxShell
            }`}
          >
            <input
              type="checkbox"
              checked={group.required}
              onChange={(event) =>
                updateModifierGroup(groupIndex, (current) => ({
                  ...current,
                  required: event.target.checked,
                }))
              }
              className="h-4 w-4 accent-violet-600"
            />
            Required
          </label>
          <button
            type="button"
            onClick={() =>
              updateSelectedItem((item) => ({
                ...item,
                modifierGroups: (item.modifierGroups ?? []).filter(
                  (_, index) => index !== groupIndex,
                ),
              }))
            }
            className={`min-h-10 rounded-md border px-3 text-sm font-medium ${theme.dangerButton}`}
          >
            Remove group
          </button>
        </div>
      </div>

      <VisibilityRuleBuilder
        group={group}
        groupIndex={groupIndex}
        allGroups={allGroups}
        theme={theme}
        changed={Boolean(
          group.visibleWhen &&
            fieldChanged(buildFieldPath(groupPath, "visibleWhen"), group.visibleWhen),
        )}
        onUpdate={(updater) => updateModifierGroup(groupIndex, updater)}
      />

      <div className="mt-5 space-y-3">
        {group.options.map((option, optionIndex) => (
          <ModifierOptionRow
            key={`${option.id}-${optionIndex}`}
            groupIndex={groupIndex}
            optionIndex={optionIndex}
            option={option}
            groupPath={groupPath}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          updateModifierGroup(groupIndex, (current) => ({
            ...current,
            options: [...current.options, makeModifierOption(current.options)],
          }))
        }
        className={`mt-4 min-h-10 rounded-md border px-3 text-sm font-medium ${theme.softButton}`}
      >
        Add option
      </button>
    </section>
  );
}

function ModifierOptionRow({
  groupIndex,
  optionIndex,
  option,
  groupPath,
}: {
  groupIndex: number;
  optionIndex: number;
  option: ModifierOption;
  groupPath: string;
}) {
  const { theme, fieldChanged, updateModifierOption, updateModifierGroup } = useMenuEditor();
  const optionPath = buildFieldPath(groupPath, "options", optionIndex);
  const optionChanged = fieldChanged(optionPath, option);

  return (
    <div
      className={`grid gap-3 rounded-md border p-3 lg:grid-cols-[1fr_1fr_1fr_150px_auto] ${
        optionChanged ? theme.changedPanel : theme.nestedPanel
      }`}
    >
      <TextField
        label="Option (English)"
        value={option.label.en}
        onChange={(value) =>
          updateModifierOption(groupIndex, optionIndex, (current) => ({
            ...current,
            label: { ...current.label, en: value },
          }))
        }
        theme={theme}
        changed={fieldChanged(buildFieldPath(optionPath, "label", "en"), option.label.en)}
      />
      <TextField
        label="Option (Spanish)"
        value={option.label.es}
        onChange={(value) =>
          updateModifierOption(groupIndex, optionIndex, (current) => ({
            ...current,
            label: { ...current.label, es: value },
          }))
        }
        theme={theme}
        changed={fieldChanged(buildFieldPath(optionPath, "label", "es"), option.label.es)}
      />
      <TextField
        label="Option ID (internal)"
        value={option.id}
        onChange={(value) =>
          updateModifierOption(groupIndex, optionIndex, (current) => ({ ...current, id: value }))
        }
        theme={theme}
        changed={fieldChanged(buildFieldPath(optionPath, "id"), option.id)}
      />
      <DeferredNumberField
        label="Extra price"
        numericValue={option.priceDeltaCents ?? 0}
        format={formatDollars}
        parse={parseDollars}
        step={DOLLAR_STEP}
        onChange={(priceDeltaCents) =>
          updateModifierOption(groupIndex, optionIndex, (current) => {
            if (priceDeltaCents === 0) {
              return { id: current.id, label: current.label };
            }
            return { ...current, priceDeltaCents };
          })
        }
        theme={theme}
        changed={fieldChanged(buildFieldPath(optionPath, "priceDeltaCents"), option.priceDeltaCents)}
      />
      <div className="flex items-end">
        <button
          type="button"
          onClick={() =>
            updateModifierGroup(groupIndex, (current) => ({
              ...current,
              options: current.options.filter((_, index) => index !== optionIndex),
            }))
          }
          className={`min-h-10 w-full rounded-md border px-3 text-sm font-medium ${theme.dangerButton}`}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
