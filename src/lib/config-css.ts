/** Replace config stylesheet links in cascade order (global, project, hidden). */
export function applyConfigStyles(urls: readonly string[]): void {
  if (typeof document === "undefined") return;
  const links = document.querySelectorAll<HTMLLinkElement>("link[data-code-graph-config]");
  for (let index = 0; index < urls.length; index++) {
    const link = links[index] ?? document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.codeGraphConfig = "";
    link.href = urls[index] ?? "";
    if (!link.isConnected) document.head.append(link);
  }
  for (let index = urls.length; index < links.length; index++) links[index]?.remove();
}
