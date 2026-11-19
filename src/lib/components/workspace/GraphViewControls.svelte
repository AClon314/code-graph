<script lang="ts">
  import { LAYOUT_ALGORITHMS, type Depth, type GraphRenderer, type LayoutAlgorithm } from "../../graph/url-state";
  import type { NeighborhoodDirection } from "../../graph/neighborhood";

  interface Props {
    depth: Depth;
    direction: NeighborhoodDirection;
    layout: LayoutAlgorithm;
    renderer: GraphRenderer;
    focusOnly: boolean;
    focusAvailable: boolean;
    ondepth: (event: Event) => void;
    ondirection: (value: string) => void;
    onlayout: (value: string) => void;
    onrenderer: (value: string) => void;
    onfocusonly: (value: boolean) => void;
  }

  let {
    depth,
    direction,
    layout,
    renderer,
    focusOnly,
    focusAvailable,
    ondepth,
    ondirection,
    onlayout,
    onrenderer,
    onfocusonly,
  }: Props = $props();
</script>

<div class="view-controls" aria-label="View options">
  <!-- svelte-ignore a11y_label_has_associated_control -->
  <label class="view-control" title="Neighborhood depth">
    <span>depth</span>
    <input
      class="depth-input"
      type="number"
      min="1"
      step="1"
      placeholder="∞"
      value={depth ?? ""}
      aria-label="Neighborhood depth"
      title="Neighborhood depth (empty = full graph)"
      onchange={ondepth}
      onkeydown={(event: KeyboardEvent) => {
        if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
      }}
    />
  </label>
  <!-- svelte-ignore a11y_label_has_associated_control -->
  <label class="view-control" title="Edge direction">
    <span>edges</span>
    <select
      class="direction-select"
      value={direction}
      aria-label="Edge direction"
      onchange={(event: Event) => ondirection((event.currentTarget as HTMLSelectElement).value)}
    >
      <option value="both">both</option>
      <option value="callers">callers</option>
      <option value="callees">callees</option>
    </select>
  </label>
  {#if renderer === "d3"}
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="view-control" title="ELK layout algorithm">
      <span>layout</span>
      <select
        class="layout-select"
        value={layout}
        aria-label="Layout algorithm"
        onchange={(event: Event) => onlayout((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each LAYOUT_ALGORITHMS as algorithm}
          <option value={algorithm}>{algorithm}</option>
        {/each}
      </select>
    </label>
  {/if}
  <!-- svelte-ignore a11y_label_has_associated_control -->
  <label class="view-control toggle-control" title="Hide nodes outside the selected node's component">
    <input
      type="checkbox"
      checked={focusOnly}
      disabled={!focusAvailable}
      aria-label="Focus on related nodes"
      onchange={(event: Event) => onfocusonly((event.currentTarget as HTMLInputElement).checked)}
    />
    <span>focus</span>
  </label>
  <!-- svelte-ignore a11y_label_has_associated_control -->
  <label class="view-control" title="Graph renderer">
    <span>view</span>
    <select
      class="renderer-select"
      value={renderer}
      aria-label="Graph renderer"
      onchange={(event: Event) => onrenderer((event.currentTarget as HTMLSelectElement).value)}
    >
      <option value="d3">D3</option>
      <option value="orchgraph">orchgraph</option>
    </select>
  </label>
</div>
