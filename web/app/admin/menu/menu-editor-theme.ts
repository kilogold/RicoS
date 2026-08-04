/** Dark-only editor styling tokens. */
export type EditorTheme = {
  page: string;
  panel: string;
  nestedPanel: string;
  fieldLabel: string;
  fieldControl: string;
  mutedText: string;
  strongText: string;
  regularText: string;
  cardBorder: string;
  softButton: string;
  neutralButton: string;
  dangerButton: string;
  itemButton: string;
  itemButtonActive: string;
  categoryButton: string;
  categoryButtonActive: string;
  divider: string;
  checkboxShell: string;
  changedField: string;
  changedPanel: string;
  changedText: string;
  tabActive: string;
  tabInactive: string;
  accentText: string;
};

export const EDITOR_THEME: EditorTheme = {
  page: "bg-slate-950 text-slate-100",
  panel: "border-slate-700 bg-slate-900 shadow-sm shadow-black/20",
  nestedPanel: "border-slate-700 bg-slate-950/60",
  fieldLabel: "text-slate-200",
  fieldControl:
    "border-slate-600 bg-slate-950 text-slate-100 focus:border-violet-400 focus:ring-violet-500/20",
  mutedText: "text-slate-400",
  strongText: "text-slate-50",
  regularText: "text-slate-300",
  cardBorder: "border-slate-700",
  softButton: "border-violet-500/50 text-violet-200 hover:bg-violet-500/10 disabled:text-slate-500",
  neutralButton: "border-slate-600 text-slate-200 hover:bg-slate-800",
  dangerButton: "border-red-500/50 text-red-200 hover:bg-red-500/10",
  itemButton: "text-slate-300 hover:bg-slate-800",
  itemButtonActive: "bg-slate-800 text-slate-50",
  categoryButton: "text-slate-300 hover:bg-slate-800",
  categoryButtonActive: "border-l-4 border-violet-400 bg-violet-500/15 text-violet-100",
  divider: "border-slate-700",
  checkboxShell: "border-slate-600 text-slate-200",
  changedField:
    "border-amber-400 bg-amber-950/40 text-amber-50 focus:border-amber-300 focus:ring-amber-400/20",
  changedPanel: "border-amber-400/70 bg-amber-950/20",
  changedText: "text-amber-200",
  tabActive: "bg-violet-600 text-white shadow-sm",
  tabInactive: "text-slate-300 hover:bg-slate-800",
  accentText: "text-violet-300",
};

export const STATUS_BANNER = {
  error: "border-red-500/40 bg-red-950/40 text-red-100",
  success: "border-emerald-500/40 bg-emerald-950/40 text-emerald-100",
  neutral: "border-blue-500/40 bg-blue-950/40 text-blue-100",
} as const;
