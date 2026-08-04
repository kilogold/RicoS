"use client";

import { useMenuEditor } from "./menu-editor-context";
import {
  DeferredNumberField,
  SelectField,
  TextField,
} from "./menu-editor-fields";
import {
  DOLLAR_STEP,
  formatDollars,
  formatPercent,
  parseDollars,
  parsePercent,
} from "./menu-editor-utils";
import type { PrintStation } from "@ricos/shared";

const STATIONS: PrintStation[] = ["default", "A", "B"];

export function MenuEditorBasicEditPane() {
  const {
    theme,
    selected,
    fieldChanged,
    updateSelectedItemLocalized,
    updateSelectedItem,
    setEditorTab,
  } = useMenuEditor();

  const item = selected.item;
  if (!item) return null;

  return (
    <div className={`rounded-lg border p-5 ${theme.panel}`}>
      <h3 className={`text-base font-medium ${theme.strongText}`}>Pricing</h3>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <TextField
          label="Name (English)"
          value={item.name.en}
          onChange={(value) => updateSelectedItemLocalized("name", "en", value)}
          theme={theme}
          changed={fieldChanged("name.en", item.name.en)}
        />
        <TextField
          label="Name (Spanish)"
          value={item.name.es}
          onChange={(value) => updateSelectedItemLocalized("name", "es", value)}
          theme={theme}
          changed={fieldChanged("name.es", item.name.es)}
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
        <SelectField
          label="Kitchen station"
          value={item.station}
          options={STATIONS}
          onChange={(value) => updateSelectedItem((current) => ({ ...current, station: value }))}
          theme={theme}
          changed={fieldChanged("station", item.station)}
        />
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
      <p className={`mt-4 text-sm ${theme.mutedText}`}>
        Need choices, descriptions, or conditional sides? Switch to{" "}
        <button
          type="button"
          onClick={() => setEditorTab("advanced-setup")}
          className="font-medium text-violet-300 underline-offset-2 hover:underline"
        >
          Advanced setup
        </button>
        .
      </p>
    </div>
  );
}
