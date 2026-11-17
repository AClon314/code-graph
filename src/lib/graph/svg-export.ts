import { graphSvgStyle, SVG_THEME_VARIABLE_NAMES } from "./svg";

export function svgExportStyles(): string {
  const computed =
    typeof window === "undefined"
      ? null
      : getComputedStyle(document.documentElement);
  const variables = computed
    ? SVG_THEME_VARIABLE_NAMES.map(
        (name) => `${name}:${computed.getPropertyValue(name).trim()};`,
      ).join("")
    : "";
  return graphSvgStyle(variables);
}

/** Serialize and download an SVG with the current theme variables embedded. */
export function downloadSvg(svg: SVGSVGElement, filename: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = svgExportStyles();
  clone.insertBefore(style, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n`, xml], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export function svgFilename(ref: string): string {
  const slug =
    ref
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "call-graph";
  return `code-graph-${slug}.svg`;
}
