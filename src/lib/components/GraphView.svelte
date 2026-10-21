<script lang="ts">
  import { onMount } from "svelte";
  import { select } from "d3-selection";
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";

  import { layoutGraphView, type GraphLayout } from "../graph/layout";
  import type { GraphViewData, GraphViewNode } from "../graph/types";

  interface Props {
    data: GraphViewData;
    selectedId?: string;
    searchHits?: Set<string>;
    onselect: (node: GraphViewNode) => void;
    onexport?: (svg: SVGSVGElement) => void;
    onjump?: (node: GraphViewNode) => void;
  }

  let {
    data,
    selectedId = "",
    searchHits = new Set<string>(),
    onselect,
    onexport,
    onjump,
  }: Props = $props();

  let svgEl = $state<SVGSVGElement | null>(null);
  let layout = $state<GraphLayout | null>(null);
  let layoutError = $state("");
  let transform = $state<ZoomTransform>(zoomIdentity);
  let zoomReady = $state(false);
  let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;

  const markerId = "orchgraph-arrow";
  const nodeById = $derived(new Map(data.nodes.map((node) => [node.id, node])));

  $effect(() => {
    const current = data;
    let cancelled = false;
    layout = null;
    layoutError = "";

    void layoutGraphView(current)
      .then((next) => {
        if (!cancelled) layout = next;
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        layout = null;
        layoutError = cause instanceof Error ? cause.message : String(cause);
      });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!layout || !zoomReady) return;
    const frame = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(frame);
  });

  onMount(() => {
    if (!svgEl) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 4])
      .extent(() => {
        const rect = svgEl?.getBoundingClientRect();
        return [
          [0, 0],
          [rect?.width || 800, rect?.height || 500],
        ];
      })
      .on("zoom", (event) => {
        transform = event.transform;
      });

    zoomBehavior = behavior;
    const selection = select(svgEl);
    selection.call(behavior);
    // Double-click on a node means "jump", not "zoom in".
    selection.on("dblclick.zoom", null);
    zoomReady = true;

    return () => {
      selection.on(".zoom", null);
      zoomBehavior = null;
      zoomReady = false;
    };
  });

  /** Fit the whole graph into the available viewport. */
  export function fit(): void {
    if (!svgEl || !layout || !zoomBehavior) return;
    if (layout.nodes.length === 0) {
      select(svgEl).call(zoomBehavior.transform, zoomIdentity);
      return;
    }

    const rect = svgEl.getBoundingClientRect();
    const width = rect.width || svgEl.clientWidth || 800;
    const height = rect.height || svgEl.clientHeight || 500;
    if (width <= 0 || height <= 0) return;

    const graphWidth = Math.max(layout.width, 1);
    const graphHeight = Math.max(layout.height, 1);
    const scale = Math.min((width / graphWidth) * 0.94, (height / graphHeight) * 0.94, 2);
    const clamped = Math.max(0.08, scale);
    const x = (width - graphWidth * clamped) / 2;
    const y = (height - graphHeight * clamped) / 2;
    select(svgEl).call(
      zoomBehavior.transform,
      zoomIdentity.translate(x, y).scale(clamped),
    );
  }

  /** Hand a full-graph, unzoomed SVG to the host for download. */
  export function triggerExport(): void {
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone.querySelector(".graph-viewport")?.removeAttribute("transform");

    if (layout) {
      const width = Math.max(Math.ceil(layout.width), 1);
      const height = Math.max(Math.ceil(layout.height), 1);
      clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));
      clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }

    onexport?.(clone);
  }

  function kindClass(label: string): string {
    return label.normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  }

  function pointList(points: Array<{ x: number; y: number }>): string {
    return points.map((point) => `${point.x},${point.y}`).join(" ");
  }
</script>

<div class="graph-board">
  <svg
    bind:this={svgEl}
    class:has-search-hits={searchHits.size > 0}
    class="graph-svg"
    role="group"
    aria-label={`Call graph for ${data.root}: ${data.nodes.length} nodes, ${data.edges.length} edges`}
    preserveAspectRatio="xMidYMid meet"
  >
    <title>Call graph for {data.root}</title>
    <defs>
      <marker
        id={markerId}
        markerWidth="11"
        markerHeight="11"
        refX="10"
        refY="5.5"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path class="orchgraph-arrow" d="M0,0 L11,5.5 L0,11 z" />
      </marker>
      {#if layout}
        {#each layout.nodes as positioned, index (positioned.id)}
          <clipPath id={`orchgraph-clip-${index}`}>
            <rect
              x={positioned.x + 9}
              y={positioned.y}
              width={Math.max(positioned.width - 18, 1)}
              height={positioned.height}
            />
          </clipPath>
        {/each}
      {/if}
    </defs>

    {#if layout}
      <g class="graph-viewport" transform={transform.toString()}>
        <g class="orchgraph-edges">
          {#each layout.edges as edge (edge.id)}
            <polyline
              class="orchgraph-edge"
              data-edge-id={edge.id}
              data-source={edge.source}
              data-target={edge.target}
              points={pointList(edge.points)}
              marker-end={`url(#${markerId})`}
            />
          {/each}
        </g>

        <g class="orchgraph-nodes">
          {#each layout.nodes as positioned, index (positioned.id)}
            {@const node = nodeById.get(positioned.id)}
            {#if node}
              {@const selected = selectedId === node.id}
              {@const hit = searchHits.has(node.id)}
              <g
                class={`orchgraph-node kind-${kindClass(node.label)}${selected ? " is-selected" : ""}${hit ? " is-search-hit" : ""}`}
                data-node-id={node.id}
                data-kind={node.label}
                role="button"
                tabindex="0"
                aria-pressed={selected}
                aria-label={`${node.name}, ${node.label}, ${node.qualifiedName}`}
                onclick={() => onselect(node)}
                ondblclick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onjump?.(node);
                }}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onselect(node);
                  }
                }}
              >
                <title>{node.name} — {node.qualifiedName}</title>
                <rect
                  x={positioned.x}
                  y={positioned.y}
                  width={positioned.width}
                  height={positioned.height}
                  rx="10"
                />
                <text
                  class="orchgraph-node-kind"
                  x={positioned.x + positioned.width - 10}
                  y={positioned.y + 17}
                  text-anchor="end"
                >{node.label}</text>
                <g clip-path={`url(#orchgraph-clip-${index})`}>
                  <text
                    class="orchgraph-node-label"
                    x={positioned.x + 12}
                    y={positioned.y + 33}
                  >{node.name}</text>
                  <text
                    class="orchgraph-node-detail"
                    x={positioned.x + 12}
                    y={positioned.y + 51}
                  >{node.qualifiedName}</text>
                </g>
              </g>
            {/if}
          {/each}
        </g>
      </g>
    {/if}
  </svg>

  {#if layoutError}
    <p class="graph-overlay error compact">Layout failed: {layoutError}</p>
  {:else if !layout}
    <p class="graph-overlay">Laying out graph…</p>
  {:else if layout.nodes.length === 0}
    <p class="graph-overlay">No nodes in this neighborhood.</p>
  {/if}
</div>
