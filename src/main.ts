import "@vscode-elements/elements/dist/vscode-button/index.js";
import "@vscode-elements/elements/dist/vscode-option/index.js";
import "@vscode-elements/elements/dist/vscode-single-select/index.js";
import "@vscode-elements/elements/dist/vscode-textfield/index.js";
import { mount } from "svelte";

import App from "./App.svelte";
import "./app.css";
import { installFontFallback } from "./lib/fonts";

// Client-side choice: the installed family wins with zero network requests,
// otherwise the CDN stylesheet is appended in the background. Starting it
// before mount means the first paint never waits for the font.
installFontFallback();

const app = mount(App, { target: document.getElementById("app")! });

export default app;
