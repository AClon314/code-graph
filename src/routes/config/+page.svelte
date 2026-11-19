<script lang="ts">
  import { onMount } from "svelte";
  import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { html } from "@codemirror/lang-html";
  import { json } from "@codemirror/lang-json";
  import { EditorState } from "@codemirror/state";
  import {
    EditorView,
    highlightActiveLine,
    keymap,
    lineNumbers,
  } from "@codemirror/view";

  import { NODE_TEMPLATE_SLOT_PATHS } from "../../lib/node-template";

  let host = $state<HTMLDivElement | null>(null);
  let editor: EditorView | null = null;
  let filePath = $state("");
  let content = $state("");
  let status = $state("Loading…");
  let error = $state("");

  const isTemplate = $derived(filePath.endsWith(".html"));
  const fileName = $derived(filePath.split("/").at(-1) || filePath);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("path") || "code-graph.config.jsonc";
    filePath = requested;
    document.title = `${fileName} · Code Graph`;
    void load(requested);
    return () => {
      editor?.destroy();
      editor = null;
    };
  });

  async function load(path: string): Promise<void> {
    status = "Loading…";
    error = "";
    if (path.includes("..")) {
      error = "Path must stay inside the workspace.";
      status = "Error";
      return;
    }
    try {
      let response = await fetch(
        `/api/config-file?path=${encodeURIComponent(path)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        // Static hosting may not provide the dev/preview endpoint.
        response = await fetch(`/${path.replace(/^\/+/, "")}`, { cache: "no-store" });
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      content = text;
      status = `${fileName} · ${text.split("\n").length} lines`;
      queueMicrotask(createEditor);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      status = "Could not load file";
    }
  }

  function slotCompletion(context: CompletionContext) {
    const match = context.matchBefore(/<slot\s+name\s*=\s*["'][^"']*$/);
    if (!match) return null;
    const quote = Math.max(match.text.lastIndexOf('"'), match.text.lastIndexOf("'"));
    return {
      from: match.from + quote + 1,
      options: NODE_TEMPLATE_SLOT_PATHS.map((path) => ({ label: path, type: "property" })),
      validFor: /^[\w.]*$/,
    };
  }

  function createEditor(): void {
    if (!host) return;
    editor?.destroy();
    const language = isTemplate ? html() : filePath.endsWith(".json") ? json() : [];
    editor = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          ...(isTemplate ? [autocompletion({ override: [slotCompletion] })] : []),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": {
              height: "100%",
              backgroundColor: "transparent",
              color: "var(--cg-text)",
              fontFamily: "var(--cg-font-mono)",
              fontSize: "0.86rem",
            },
            ".cm-scroller": { overflow: "auto", lineHeight: "1.45" },
            ".cm-content": { padding: "1lh 0" },
            ".cm-line": { padding: "0 1ch" },
            ".cm-gutters": {
              backgroundColor: "var(--cg-panel)",
              color: "var(--cg-muted)",
              borderRight: "1px solid var(--cg-line)",
            },
            ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--cg-text) 5%, transparent)" },
            ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--cg-text) 7%, transparent)" },
          }),
          language,
        ],
      }),
      parent: host,
    });
    editor.focus();
  }

  async function copyContent(): Promise<void> {
    try {
      await navigator.clipboard.writeText(editor?.state.doc.toString() ?? content);
      status = "Copied to clipboard";
    } catch (cause) {
      status = `Copy failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }

  function downloadContent(): void {
    const blob = new Blob([editor?.state.doc.toString() ?? content], {
      type: isTemplate ? "text/html" : "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "code-graph.config.jsonc";
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status = `Downloaded ${link.download}`;
  }
</script>

<main class="config-page">
  <header class="config-head">
    <div>
      <h1>{fileName || "Config"}</h1>
      <p class="config-path">{filePath}</p>
    </div>
    <div class="config-actions">
      <button class="vscode-button secondary" type="button" onclick={() => void copyContent()}>Copy</button>
      <button class="vscode-button secondary" type="button" onclick={downloadContent}>Download</button>
      <a class="vscode-button secondary" href="/" target="_self">Back to graph</a>
    </div>
  </header>

  {#if error}
    <p class="error compact">{error}</p>
  {:else}
    <div class="config-workbench">
      <div class="config-editor" bind:this={host} aria-label={`Editor for ${fileName}`}></div>
      {#if isTemplate}
        <aside class="config-hints" aria-label="Slot names">
          <h2>Slot paths</h2>
          <p class="hint">Use these in <code>&lt;slot name="…"&gt;</code>.</p>
          <ul>
            {#each NODE_TEMPLATE_SLOT_PATHS as path}
              <li><code>{path}</code></li>
            {/each}
          </ul>
        </aside>
      {/if}
    </div>
  {/if}

  <footer class="config-status" role="status">{status}</footer>
</main>
