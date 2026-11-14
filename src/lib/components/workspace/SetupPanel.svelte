<script lang="ts">
  import type { GraphBackend } from "../../../extension/api";
  import type { SourceKind } from "../../graph/url-state";

  interface Props {
    kind: SourceKind;
    project: string;
    runtime: string;
    backend: GraphBackend;
    onsource: (kind: SourceKind) => void;
    onproject: (value: string) => void;
    onclose: () => void;
  }

  let { kind, project, runtime, backend, onsource, onproject, onclose }: Props = $props();

  function textValue(event: Event): string {
    return (event.currentTarget as HTMLElement & { value: string }).value;
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

    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="field">
      <span class="field-label">Project</span>
      <vscode-textfield
        value={project}
        spellcheck="false"
        oninput={(event: Event) => onproject(textValue(event))}
      ></vscode-textfield>
    </label>

    <p class="setup-meta">{runtime} · {kind === "computed" ? "computed" : backend}</p>
    <p class="hint">
      Computed works offline. cbm reads a local Codebase Memory listener; the
      project name must already exist in it.
    </p>
  </div>
</aside>
