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
    onsource: (kind: SourceKind) => void;
    onbackend: (backend: GraphBackend) => void;
    onproject: (value: string) => void;
    onclose: () => void;
  }

  let {
    kind,
    project,
    projects = [],
    projectsLoading = false,
    runtime,
    backend,
    onsource,
    onbackend,
    onproject,
    onclose,
  }: Props = $props();

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
        oninput={(event) => onproject(projectValue(event))}
      />
      {#if projectsLoading}
        <span class="hint">loading project names…</span>
      {:else if projects.length > 0}
        <span class="hint">{projects.length} indexed project{projects.length === 1 ? "" : "s"}</span>
      {/if}
    </div>

    <p class="setup-meta">{runtime} · {kind === "computed" ? "computed" : backend}</p>
    <p class="hint">
      Computed works offline. cbm reads a local Codebase Memory listener; the
      project name must already exist in it.
    </p>
  </div>
</aside>
