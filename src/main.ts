import { mount } from "svelte";

import App from "./App.svelte";
import "./theme.css";
import "./styles/graph.css";
import "./app.css";
import { installFontFallback } from "./lib/fonts";
import { subscribeViewport } from "./lib/components/code-input-runtime";

// Keep `--code-graph-visual-height` live even when no CodeInput is mounted:
// native search/depth inputs can also open the software keyboard.
subscribeViewport(() => {});

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

const target = document.getElementById("app")!;
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const isDebugPage =
  path === "/debug" && (import.meta.env.DEV || import.meta.env.MODE === "web");
const isInputPage = path === "/input";
if (isDebugPage) document.title = "CodeInput · debug";
if (isInputPage) document.title = "Input · Code Graph";

const app = isDebugPage
  ? import("./routes/debug/+page.svelte").then(({ default: DebugPage }) =>
      mount(DebugPage, { target }),
    )
  : isInputPage
    ? import("./routes/input/+page.svelte").then(({ default: InputPage }) =>
        mount(InputPage, { target }),
      )
    : mount(App, { target });

export default app;
