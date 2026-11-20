<script lang="ts">
  import type { GraphBackend } from "../../../extension/api";
  import type { SourceKind } from "../../graph/url-state";
  import CodeInput from "../CodeInput.svelte";

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
    onproject: (value: string) => void;
    onprojectcommit: (value: string) => void;
    onopenconfig: (path: string) => void;
    onopenindex: () => void;
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
    onproject,
    onprojectcommit,
    onopenconfig,
    onopenindex,
    onclose,
  }: Props = $props();

  function basename(path: string): string {
    return path.split(/[/\\]+/).at(-1) || path;
  }

  function projectValue(event: Event): string {
    return (event as CustomEvent<{ value: string }>).detail.value;
  }
</script>

<aside class="edge-panel setup-panel" aria-label="Setup">
  <div class="panel-head">
    <div>
      <h2>Setup</h2>
      <span class="sub">Source &amp; project</span>
    </div>
    <button class="icon-button" type="button" aria-label="Close setup" onclick={onclose}>×</button>
  </div>

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
      <label class="field-label" for="project-input">Project</label>
      <CodeInput
        id="project-input"
        value={project}
        options={projects}
        filterOptions={false}
        placeholder="Project name"
        aria-label="Project"
        spellcheck={false}
        debounce={350}
        oninput={(event) => onproject(projectValue(event))}
        oncommit={(event) => onprojectcommit(projectValue(event))}
      />
      {#if projectsLoading}
        <span class="hint">loading project names…</span>
      {:else if projects.length > 0}
        <span class="hint">
          {kind === "computed"
            ? "computed sample project"
            : `${projects.length} indexed project${projects.length === 1 ? "" : "s"}`}
        </span>
      {/if}
    </div>

    {#if kind === "cbm"}
      <div class="field">
        <span class="field-label">Index</span>
        <button class="link" type="button" onclick={onopenindex}>Index a folder…</button>
        <span class="hint">
          Rebuild a missing cbm project from a repository folder on the server.
        </span>
      </div>
    {/if}

    <div class="field">
      <span class="field-label">Node presentation</span>
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
      <span class="hint">
        Edit renderNodeHtml / renderNodeText in renderNode.config.mjs.
      </span>
    </div>

    <p class="setup-meta">{runtime} · {kind === "computed" ? "computed" : backend}</p>
    <p class="hint">
      Computed works offline. cbm reads a local Codebase Memory listener; the
      project name must already exist in it.
    </p>
  </div>
</aside>
