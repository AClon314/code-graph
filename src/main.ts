import "@vscode-elements/elements/dist/vscode-option/index.js";
import "@vscode-elements/elements/dist/vscode-single-select/index.js";
import "@vscode-elements/elements/dist/vscode-textfield/index.js";
import { mount } from "svelte";

import App from "./App.svelte";
import "./theme.css";
import "./styles/graph.css";
import "./app.css";
import { installFontFallback } from "./lib/fonts";

// Client-side choice: the installed family wins with zero network requests,
// otherwise the CDN stylesheet is appended in the background. Starting it
// before mount means the first paint never waits for the font.
installFontFallback();

// Convenience for iframe/third-party embeds that cannot write the inner
// document's CSS variables directly. The CSS variable remains the API.
if (import.meta.env.MODE === "development" || import.meta.env.MODE === "web") {
  document.documentElement.dataset.codeGraphStandalone = "";
}

const params = new URLSearchParams(window.location.search);
const requestedScale = params.get("scale");
if (requestedScale && Number.isFinite(Number(requestedScale)) && Number(requestedScale) > 0) {
  document.documentElement.style.setProperty("--code-graph-scale", requestedScale);
}
const requestedTheme = params.get("theme");
if (requestedTheme === "light" || requestedTheme === "dark") {
  document.documentElement.dataset.codeGraphTheme = requestedTheme;
}

const app = mount(App, { target: document.getElementById("app")! });

export default app;
