<script lang="ts">
  import { onMount } from "svelte";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { javascript } from "@codemirror/lang-javascript";
  import { json } from "@codemirror/lang-json";
  import { EditorState } from "@codemirror/state";
  import {
    EditorView,
    highlightActiveLine,
    keymap,
    lineNumbers,
  } from "@codemirror/view";

  let host = $state<HTMLDivElement | null>(null);
  let editor: EditorView | null = null;
  let filePath = $state("");
  let isGlobal = $state(false);
  let content = $state("");
  let status = $state("Loading…");
  let error = $state("");

  const isScript = $derived(/\.m?js$/i.test(filePath));
  const fileName = $derived(filePath.split("/").at(-1) || filePath);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("path") || "code-graph.config.jsonc";
    isGlobal = params.get("global") === "1";
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
      const globalQuery = isGlobal ? "global=1&" : "";
      let response = await fetch(
        `/api/config-file?${globalQuery}path=${encodeURIComponent(path)}`,
        { cache: "no-store" },
      );
      if (!response.ok && !isGlobal) {
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

  function createEditor(): void {
    if (!host) return;
    editor?.destroy();
    const language = isScript
      ? javascript({ jsx: false, typescript: false })
      : filePath.endsWith(".json") || filePath.endsWith(".jsonc")
        ? json()
        : [];
    editor = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            { key: "Mod-s", run: () => { void saveContent(); return true; } },
          ]),
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
            ".cm-content": {
              padding: "1lh 0",
              caretColor: "var(--cg-text)",
            },
            ".cm-cursor": { borderLeftColor: "var(--cg-text)" },
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

  async function saveContent(): Promise<void> {
    if (!editor) return;
    status = "Saving…";
    error = "";
    const next = editor.state.doc.toString();
    try {
      const globalQuery = isGlobal ? "?global=1" : "";
      const response = await fetch(`/api/config-file${globalQuery}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: filePath, global: isGlobal, content: next }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `HTTP ${response.status}`);
      }
      content = next;
      status = `Saved ${fileName} on the code-graph host`;
    } catch (cause) {
      error = `Save failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      status = "Could not save file";
    }
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
      type: isScript ? "text/javascript" : "text/plain",
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
      <button class="vscode-button secondary" type="button" onclick={() => void saveContent()}>Save</button>
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
    </div>
  {/if}

  <footer class="config-status" role="status">{status}</footer>
</main>
