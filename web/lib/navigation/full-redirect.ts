/** Full document navigation — tears down the current page (e.g. checkout) immediately. */
export function fullRedirect(path: string): void {
  const url = path.startsWith("http")
    ? path
    : `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
  window.location.replace(url);
}
