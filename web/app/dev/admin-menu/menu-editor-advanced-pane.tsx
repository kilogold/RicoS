"use client";

import { useMenuEditor } from "./menu-editor-context";
import {
  DeferredNumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "./menu-editor-fields";
import { MenuEditorModifierGroup } from "./menu-editor-modifier-group";
import {
  DOLLAR_STEP,
  formatDollars,
  formatPercent,
  makeModifierGroup,
  parseDollars,
  parsePercent,
} from "./menu-editor-utils";
import type { PrintStation } from "@ricos/shared";

const STATIONS: PrintStation[] = ["default", "A", "B"];

export function MenuEditorAdvancedPane() {
  const {
    theme,
    selected,
    fieldChanged,
    updateSelectedItemLocalized,
    updateSelectedItem,
    setSelectedItemId,
  } = useMenuEditor();

  const item = selected.item;
  if (!item) return null;

  return (
    <>
      <div className={`rounded-lg border p-5 ${theme.panel}`}>
        <h3 className={`text-base font-medium ${theme.strongText}`}>Item details</h3>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <TextField
            label="English name"
            value={item.name.en}
            onChange={(value) => updateSelectedItemLocalized("name", "en", value)}
            theme={theme}
            changed={fieldChanged("name.en", item.name.en)}
          />
          <TextField
            label="Spanish name"
            value={item.name.es}
            onChange={(value) => updateSelectedItemLocalized("name", "es", value)}
            theme={theme}
            changed={fieldChanged("name.es", item.name.es)}
          />
          <TextAreaField
            label="English description"
            value={item.description.en}
            onChange={(value) => updateSelectedItemLocalized("description", "en", value)}
            theme={theme}
            changed={fieldChanged("description.en", item.description.en)}
          />
          <TextAreaField
            label="Spanish description"
            value={item.description.es}
            onChange={(value) => updateSelectedItemLocalized("description", "es", value)}
            theme={theme}
            changed={fieldChanged("description.es", item.description.es)}
          />
          <TextField
            label="Item ID (internal)"
            value={item.id}
            onChange={(value) => {
              setSelectedItemId(value);
              updateSelectedItem((current) => ({ ...current, id: value }));
            }}
            theme={theme}
            changed={fieldChanged("id", item.id)}
          />
          <SelectField
            label="Kitchen station"
            value={item.station}
            options={STATIONS}
            onChange={(value) => updateSelectedItem((current) => ({ ...current, station: value }))}
            theme={theme}
            changed={fieldChanged("station", item.station)}
          />
          <DeferredNumberField
            label="Price"
            numericValue={item.priceCents}
            format={formatDollars}
            parse={parseDollars}
            step={DOLLAR_STEP}
            onChange={(priceCents) => updateSelectedItem((current) => ({ ...current, priceCents }))}
            theme={theme}
            changed={fieldChanged("priceCents", item.priceCents)}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <DeferredNumberField
              label="Sales tax %"
              numericValue={item.salesTaxRate}
              format={formatPercent}
              parse={parsePercent}
              step="0.001"
              onChange={(salesTaxRate) =>
                updateSelectedItem((current) => ({ ...current, salesTaxRate }))
              }
              theme={theme}
              changed={fieldChanged("salesTaxRate", item.salesTaxRate)}
            />
            <DeferredNumberField
              label="Municipal tax %"
              numericValue={item.municipalTaxRate}
              format={formatPercent}
              parse={parsePercent}
              step="0.001"
              onChange={(municipalTaxRate) =>
                updateSelectedItem((current) => ({ ...current, municipalTaxRate }))
              }
              theme={theme}
              changed={fieldChanged("municipalTaxRate", item.municipalTaxRate)}
            />
          </div>
        </div>
      </div>

      <div className={`rounded-lg border p-5 ${theme.panel}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className={`text-base font-medium ${theme.strongText}`}>Choices and add-ons</h3>
            <p className={`mt-1 text-sm ${theme.mutedText}`}>
              Sizes, sides, toppings, and extra charges.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateSelectedItem((current) => ({
                ...current,
                modifierGroups: [
                  ...(current.modifierGroups ?? []),
                  makeModifierGroup(current.modifierGroups),
                ],
              }))
            }
            className={`min-h-10 rounded-md border px-3 text-sm font-medium ${theme.softButton}`}
          >
            Add choice group
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {(item.modifierGroups ?? []).map((group, groupIndex) => (
            <MenuEditorModifierGroup
              key={`${group.id}-${groupIndex}`}
              group={group}
              groupIndex={groupIndex}
            />
          ))}
        </div>
      </div>
    </>
  );
}
