<script lang="ts">
  import type { GraphBackend } from "../../../extension/api";
  import type { SourceKind } from "../../graph/url-state";

  interface Props {
    kind: SourceKind;
    project: string;
    projects?: string[];
    projectsLoading?: boolean;
    runtime: string;
    backend: GraphBackend;
    configPath: string;
    nodeRendererPath: string;
    onsource: (kind: SourceKind) => void;
    onbackend: (backend: GraphBackend) => void;
    onopenconfig: (path: string) => void;
    onopensettings: () => void;
    ondeleteolder: (days: number) => Promise<void>;
    onclose: () => void;
  }

  let {
    kind,
    project,
    projects = [],
    projectsLoading = false,
    runtime,
    backend,
    configPath,
    nodeRendererPath,
    onsource,
    onbackend,
    onopenconfig,
    onopensettings,
    ondeleteolder,
    onclose,
  }: Props = $props();

  let staleOpen = $state(false);
  let staleDays = $state(30);
  let staleBusy = $state(false);
  let staleError = $state("");
  const canOpenSettings = $derived(runtime === "vscode" || runtime === "webview");

  function basename(path: string): string {
    return path.split(/[/\\]+/).at(-1) || path;
  }

  async function deleteOlder(): Promise<void> {
    if (!Number.isInteger(staleDays) || staleDays < 1 || staleBusy) return;
    staleBusy = true;
    staleError = "";
    try {
      await ondeleteolder(staleDays);
      staleOpen = false;
    } catch (cause) {
      staleError = cause instanceof Error ? cause.message : String(cause);
    } finally {
      staleBusy = false;
    }
  }
</script>

<aside class="edge-panel setup-panel" aria-label="Setup">
  <div class="setup-body">
    <div class="field">
      <span class="field-label">Source</span>
      <div class="segmented" role="group" aria-label="Graph source">
        <button
          class="segmented-button"
          class:active={kind === "computed"}
          type="button"
          aria-pressed={kind === "computed"}
          onclick={() => onsource("computed")}
        >Computed</button>
        <button
          class="segmented-button"
          class:active={kind === "cbm"}
          type="button"
          aria-pressed={kind === "cbm"}
          onclick={() => onsource("cbm")}
        >cbm</button>
      </div>
    </div>

    {#if kind === "cbm"}
      <div class="field">
        <span class="field-label">Backend</span>
        <div class="segmented" role="group" aria-label="Graph backend">
          <button
            class="segmented-button"
            class:active={backend === "cbm"}
            type="button"
            aria-pressed={backend === "cbm"}
            onclick={() => onbackend("cbm")}
          >cbm</button>
          <button
            class="segmented-button"
            class:active={backend === "scip"}
            type="button"
            aria-pressed={backend === "scip"}
            onclick={() => onbackend("scip")}
          >SCIP</button>
        </div>
      </div>
    {/if}

    <div class="field">
      <span class="field-label">Project</span>
      <span class="setup-meta">{project || "auto from cwd"}</span>
      {#if projectsLoading}
        <span class="hint">loading project names…</span>
      {:else if projects.length > 0}
        <span class="hint">
          {kind === "computed"
            ? "computed sample project"
            : `${projects.length} indexed project${projects.length === 1 ? "" : "s"} · auto-selected from cwd`}
        </span>
      {/if}
    </div>

    <section class="setup-section" aria-labelledby="setup-config-title">
      <h3 id="setup-config-title" class="setup-section-title">Config</h3>
      <div class="config-links">
        <button
          class="link"
          type="button"
          disabled={!configPath}
          title={configPath || "Config file unavailable"}
          onclick={() => onopenconfig(configPath)}
        >{basename(configPath) || "config"}</button>
        <button
          class="link"
          type="button"
          disabled={!nodeRendererPath}
          title={nodeRendererPath || "Node renderer unavailable"}
          onclick={() => onopenconfig(nodeRendererPath)}
        >{basename(nodeRendererPath) || "renderNode.config.mjs"}</button>
      </div>
      {#if canOpenSettings}
        <button class="link" type="button" onclick={onopensettings}>
          Open extension settings…
        </button>
      {/if}
      <span class="hint">
        Web opens these in a new tab; VS Code and Fresh open the workspace file.
      </span>
    </section>

    {#if kind === "cbm"}
      <section class="setup-section" aria-labelledby="setup-actions-title">
        <h3 id="setup-actions-title" class="setup-section-title">Actions</h3>
        <button
          class="link"
          type="button"
          aria-expanded={staleOpen}
          onclick={() => {
            staleOpen = !staleOpen;
            staleError = "";
          }}
        >Delete stale projects…</button>
        {#if staleOpen}
          <div class="stale-form">
            <label class="field-label" for="stale-days">Older than (days)</label>
            <div class="stale-row">
              <input
                id="stale-days"
                class="search-input stale-days"
                type="number"
                min="1"
                step="1"
                bind:value={staleDays}
                aria-label="Delete projects older than days"
              />
              <button
                class="vscode-button"
                type="button"
                disabled={staleBusy || !Number.isInteger(staleDays) || staleDays < 1}
                onclick={() => void deleteOlder()}
              >{staleBusy ? "Deleting…" : "Delete"}</button>
              <button
                class="vscode-button secondary"
                type="button"
                disabled={staleBusy}
                onclick={() => (staleOpen = false)}
              >Cancel</button>
            </div>
            <span class="hint">Deletes cbm projects whose last index is older than this.</span>
          </div>
        {/if}
        {#if staleError}<p class="error compact" role="alert">{staleError}</p>{/if}
      </section>
    {/if}

    <p class="setup-meta">{runtime} · {kind === "computed" ? "computed" : backend}</p>
    <p class="hint">
      Computed works offline. cbm reads a local Codebase Memory listener; type
      <code>project//</code> or a folder path in the path bar to switch/index.
    </p>
  </div>

  <div class="panel-head">
    <div>
      <h2>Setup</h2>
      <span class="sub">Source, config &amp; actions</span>
    </div>
    <button class="icon-button" type="button" aria-label="Close setup" onclick={onclose}>×</button>
  </div>
</aside>
