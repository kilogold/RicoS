"use client";

import type { EditorTheme } from "./menu-editor-theme";
import { useState } from "react";

export function StatusBanner({
  tone,
  children,
}: {
  tone: "error" | "success" | "neutral";
  children: React.ReactNode;
}) {
  const className = {
    error: "border-red-500/40 bg-red-950/40 text-red-100",
    success: "border-emerald-500/40 bg-emerald-950/40 text-emerald-100",
    neutral: "border-blue-500/40 bg-blue-950/40 text-blue-100",
  }[tone];
  return (
    <p
      className={`rounded-md border px-4 py-3 text-sm ${className}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  theme,
  changed = false,
  type = "text",
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  theme: EditorTheme;
  changed?: boolean;
  type?: "text" | "number";
  id?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}>
        {label}
        {changed ? <span className="ml-2 text-xs font-semibold">Edited</span> : null}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 h-12 w-full rounded-md border px-3 text-[15px] outline-none transition focus:ring-2 ${
          changed ? theme.changedField : theme.fieldControl
        }`}
      />
    </label>
  );
}

export function DeferredNumberField({
  label,
  numericValue,
  format,
  parse,
  onChange,
  placeholder,
  theme,
  changed = false,
  step,
  id,
}: {
  label: string;
  numericValue: number;
  format: (value: number) => string;
  parse: (value: string) => number;
  onChange: (value: number) => void;
  placeholder?: string;
  theme: EditorTheme;
  changed?: boolean;
  step?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState(() => format(numericValue));
  const [isEditing, setIsEditing] = useState(false);

  function commitDraft() {
    const parsed = parse(draft);
    onChange(parsed);
    setDraft(format(parsed));
  }

  return (
    <label className="block" htmlFor={id}>
      <span className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}>
        {label}
        {changed ? <span className="ml-2 text-xs font-semibold">Edited</span> : null}
      </span>
      <input
        id={id}
        type="number"
        step={step}
        value={isEditing ? draft : format(numericValue)}
        placeholder={placeholder}
        onFocus={() => {
          setIsEditing(true);
          setDraft(format(numericValue));
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setIsEditing(false);
          commitDraft();
        }}
        className={`mt-2 h-12 w-full rounded-md border px-3 text-[15px] outline-none transition focus:ring-2 ${
          changed ? theme.changedField : theme.fieldControl
        }`}
      />
    </label>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  theme,
  changed = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: EditorTheme;
  changed?: boolean;
}) {
  return (
    <label className="block">
      <span className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}>
        {label}
        {changed ? <span className="ml-2 text-xs font-semibold">Edited</span> : null}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className={`mt-2 w-full resize-y rounded-md border px-3 py-3 text-[15px] leading-6 outline-none transition focus:ring-2 ${
          changed ? theme.changedField : theme.fieldControl
        }`}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  optionLabels,
  onChange,
  theme,
  changed = false,
}: {
  label: string;
  value: T;
  options: T[];
  optionLabels?: Record<T, string>;
  onChange: (value: T) => void;
  theme: EditorTheme;
  changed?: boolean;
}) {
  return (
    <label className="block">
      <span className={`text-sm font-medium ${changed ? theme.changedText : theme.fieldLabel}`}>
        {label}
        {changed ? <span className="ml-2 text-xs font-semibold">Edited</span> : null}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={`mt-2 h-12 w-full rounded-md border px-3 text-[15px] outline-none transition focus:ring-2 ${
          changed ? theme.changedField : theme.fieldControl
        }`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
