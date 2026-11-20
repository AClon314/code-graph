<script lang="ts">
  import type { GraphViewData, GraphViewNode } from "../../graph/types";
  import type { LoadProgress } from "../../graph/loading";
  import type { NeighborhoodDirection } from "../../graph/neighborhood";
  import type { Depth, GraphRenderer, LayoutAlgorithm } from "../../graph/url-state";
  import type { SettingsFix } from "../../settings-fix";
  import GraphViewControls from "./GraphViewControls.svelte";

  interface Props {
    error: string;
    errorFix: SettingsFix | null;
    graphError: string;
    graphFix: SettingsFix | null;
    progress: LoadProgress | null;
    loadStatus: string;
    layoutStatus: string;
    graph: GraphViewData | null;
    selectedNode: GraphViewNode | null;
    exportStatus: string;
    runtime: string;
    sourceLabel: string;
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
    onopenfix: (fix: SettingsFix | null) => void;
    ondismisserror: () => void;
    ondismissgraph: () => void;
  }

  let {
    error,
    errorFix,
    graphError,
    graphFix,
    progress,
    loadStatus,
    layoutStatus,
    graph,
    selectedNode,
    exportStatus,
    runtime,
    sourceLabel,
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
    onopenfix,
    ondismisserror,
    ondismissgraph,
  }: Props = $props();
</script>

{#if error || graphError}
  <div class="canvas-alerts">
    {#if error}
      <div class="canvas-alert" role="alert">
        <p class="error compact">{error}</p>
        {#if errorFix}
          <button
            class="vscode-button secondary fix-button"
            type="button"
            onclick={() => onopenfix(errorFix)}
          >{errorFix.label}</button>
        {/if}
        <button
          class="alert-close"
          type="button"
          aria-label="Dismiss error"
          title="Dismiss (the raw error stays in the browser console)"
          onclick={ondismisserror}
        >×</button>
      </div>
    {/if}
    {#if graphError}
      <div class="canvas-alert" role="alert">
        <p class="error compact">Neighborhood failed: {graphError}</p>
        {#if graphFix}
          <button
            class="vscode-button secondary fix-button"
            type="button"
            onclick={() => onopenfix(graphFix)}
          >{graphFix.label}</button>
        {/if}
        <button
          class="alert-close"
          type="button"
          aria-label="Dismiss graph error"
          title="Dismiss (the raw error stays in the browser console)"
          onclick={ondismissgraph}
        >×</button>
      </div>
    {/if}
  </div>
{/if}

<footer class="statusbar">
  <div class="status-left">
    {#if progress}
      <span class="status-load" role="status" aria-live="polite" title={loadStatus}>
        <progress
          class="load-progress"
          aria-label={progress.label}
          max={progress.total ?? 1}
          value={progress.total === null ? undefined : progress.completed}
        ></progress>
        <span class="status-load-label">{loadStatus}</span>
      </span>
    {:else if layoutStatus}
      <span class="status-load" role="status" title={layoutStatus}>
        <progress class="load-progress" aria-label="Laying out graph"></progress>
        <span class="status-load-label">{layoutStatus}</span>
      </span>
    {/if}
    {#if graph}
      <span>{graph.nodes.length} nodes · {graph.edges.length} edges</span>
      {#if graph.truncated}<span class="badge">truncated</span>{/if}
      {#if selectedNode}
        <span class="status-selection" title={selectedNode.qualifiedName}>{selectedNode.name}</span>
      {/if}
    {:else}
      <span>No graph</span>
    {/if}
  </div>

  <GraphViewControls
    {depth}
    {direction}
    {layout}
    {renderer}
    {focusOnly}
    {focusAvailable}
    {ondepth}
    {ondirection}
    {onlayout}
    {onrenderer}
    {onfocusonly}
  />

  <div class="status-right">
    {#if exportStatus}<span class="status-message" title={exportStatus}>{exportStatus}</span>{/if}
    <span class="runtime">{runtime} · {sourceLabel}</span>
  </div>
</footer>
