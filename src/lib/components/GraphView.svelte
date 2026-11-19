<script lang="ts">
  import { onMount } from "svelte";
  import { pointer, select } from "d3-selection";
  import {
    zoom,
    zoomIdentity,
    zoomTransform,
    type ZoomBehavior,
    type ZoomTransform,
  } from "d3-zoom";

  import {
    layoutGraphView,
    type GraphLayout,
    type LayoutAlgorithm,
  } from "../graph/layout";
  import {
    edgeRelationshipClass,
    focusSubgraph,
    nodeRelationshipClass,
    relatedSelection,
  } from "../graph/selection";
  import {
    boundsForNodes,
    centerOnNode,
    edgeRevealTarget,
    fitRect,
    panBy,
    zoomAt,
  } from "../graph/camera";
  import { shortQualifiedName } from "../graph/node-label";
  import { kindClass, pointList } from "../graph/markup";
  import {
    buildNodeRenderContext,
    type NodeHtmlRenderer,
  } from "../node-renderer";
  import type { GraphViewData, GraphViewNode } from "../graph/types";

  interface Props {
    data: GraphViewData;
    selectedId?: string;
    layoutAlgorithm?: LayoutAlgorithm;
    searchHits?: Set<string>;
    focusOnly?: boolean;
    project?: string;
    nodeRender?: NodeHtmlRenderer;
    onselect: (node: GraphViewNode) => void;
    onjump?: (node: GraphViewNode) => void;
    onlayoutstatus?: (loading: boolean) => void;
    /** A background click (not a pan/drag) clears the selection. */
    onclear?: () => void;
  }

  let {
    data,
    selectedId = "",
    layoutAlgorithm = "layered",
    searchHits = new Set<string>(),
    focusOnly = false,
    project = "",
    nodeRender,
    onselect,
    onjump,
    onlayoutstatus,
    onclear,
  }: Props = $props();

  let svgEl = $state<SVGSVGElement | null>(null);
  let layout = $state<GraphLayout | null>(null);
  let layoutError = $state("");
  let transform = $state<ZoomTransform>(zoomIdentity);
  let zoomReady = $state(false);
  let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
  let userAdjusted = false;
  let resizeFrame = 0;
  let pointerStart: { x: number; y: number } | null = null;
  let dragged = false;
  let fitCycle = $state<{ id: string; stage: 1 | 2 }>({ id: "", stage: 1 });

  const markerId = "orchgraph-arrow";
  // Focus mode re-layouts only the selected connected component. Keeping this
  // as a derived snapshot means the full graph is still available for undo.
  const displayData = $derived.by(() =>
    focusOnly && selectedId ? focusSubgraph(data, selectedId) : data,
  );
  const nodeById = $derived(new Map(displayData.nodes.map((node) => [node.id, node])));
  const edgeById = $derived(new Map(displayData.edges.map((edge) => [edge.id, edge])));
  const related = $derived(
    selectedId ? relatedSelection(displayData, selectedId) : null,
  );
  const hasSelection = $derived(
    Boolean(selectedId && displayData.nodes.some((node) => node.id === selectedId)),
  );
  const projectName = $derived(project || displayData.root.split(".")[0] || "");
  const graphTitle = $derived(displayData.root || "all entries");

  $effect(() => {
    // A new selection starts the fit cycle over; changing the graph does not
    // move the camera by itself (layout fit handles that separately).
    if (fitCycle.id !== selectedId) fitCycle = { id: selectedId, stage: 1 };
  });

  $effect(() => {
    const current = displayData;
    let cancelled = false;
    layout = null;
    layoutError = "";
    onlayoutstatus?.(true);

    void layoutGraphView(current, "DOWN", layoutAlgorithm)
      .then((next) => {
        if (!cancelled) layout = next;
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        layout = null;
        layoutError = cause instanceof Error ? cause.message : String(cause);
      })
      .finally(() => {
        if (!cancelled) onlayoutstatus?.(false);
      });

    return () => {
      cancelled = true;
      onlayoutstatus?.(false);
    };
  });

  $effect(() => {
    if (!layout || !zoomReady) return;
    const frame = requestAnimationFrame(() => fitWhole());
    return () => cancelAnimationFrame(frame);
  });

  onMount(() => {
    if (!svgEl) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 4])
      .extent(() => {
        // clientWidth/Height are local CSS px; getBoundingClientRect would
        // include the host's DPI zoom and make fit() over-shrink the graph.
        return [
          [0, 0],
          [svgEl?.clientWidth || 800, svgEl?.clientHeight || 500],
        ];
      })
      .on("zoom", (event) => {
        transform = event.transform;
        if (event.sourceEvent) userAdjusted = true;
      });

    zoomBehavior = behavior;
    const selection = select(svgEl);
    selection.call(behavior);
    // Double-click on a node means "jump", not "zoom in".
    selection.on("dblclick.zoom", null);
    // A mouse wheel always zooms. Trackpads send the same wheel events for
    // two-finger gestures, so there is no separate pan branch; panning is
    // available through dragging and the keyboard.
    selection.on("wheel.zoom", (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!svgEl) return;
      const current = zoomTransform(svgEl);
      const step =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const deltaY = event.deltaY * step;
      const [x, y] = pointer(event, svgEl);
      const next = zoomAt(current, Math.exp(-deltaY * 0.0018), { x, y });
      userAdjusted = true;
      selection.call(
        behavior.transform,
        zoomIdentity.translate(next.x, next.y).scale(next.k),
      );
    });

    // Side panels change the canvas size. Keep an untouched graph fitted;
    // never override a viewport the user has already panned or zoomed.
    // A drag can end outside the SVG; clear the start point anyway.
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    const resizeObserver = new ResizeObserver(() => {
      if (!layout || !zoomBehavior || userAdjusted) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => fitWhole());
    });
    resizeObserver.observe(svgEl);
    zoomReady = true;

    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      selection.on(".zoom", null);
      zoomBehavior = null;
      zoomReady = false;
    };
  });

  /** Fit the whole graph, or cycle related/direct-neighbour views when selected. */
  export function fit(): void {
    if (!svgEl || !layout || !zoomBehavior) return;
    if (layout.nodes.length === 0) {
      select(svgEl).call(zoomBehavior.transform, zoomIdentity);
      return;
    }

    const width = svgEl.clientWidth || 800;
    const height = svgEl.clientHeight || 500;
    if (width <= 0 || height <= 0) return;

    const selected = selectedId && layout.nodes.some((node) => node.id === selectedId);
    if (!selected) {
      fitWhole();
      return;
    }

    if (fitCycle.id !== selectedId) fitCycle = { id: selectedId, stage: 1 };
    const ids = new Set<string>();
    if (fitCycle.stage === 1) {
      for (const id of related?.nodes ?? []) ids.add(id);
    } else {
      ids.add(selectedId);
      for (const edge of displayData.edges) {
        if (edge.source === selectedId) ids.add(edge.target);
        if (edge.target === selectedId) ids.add(edge.source);
      }
    }
    const nodes = layout.nodes.filter((node) => ids.has(node.id));
    fitNodes(nodes.length > 0 ? nodes : layout.nodes);
    fitCycle = { id: selectedId, stage: fitCycle.stage === 1 ? 2 : 1 };
  }

  /** Pan the camera by screen pixels without changing scale. */
  export function panScreen(dx: number, dy: number): void {
    if (!svgEl || !zoomBehavior) return;
    const current = zoomTransform(svgEl);
    userAdjusted = true;
    const next = panBy(current, dx, dy);
    select(svgEl).call(
      zoomBehavior.transform,
      zoomIdentity.translate(next.x, next.y).scale(next.k),
    );
  }

  /** Linear zoom around the viewport center. */
  export function zoomBy(factor: number): void {
    if (!svgEl || !zoomBehavior) return;
    const current = zoomTransform(svgEl);
    const anchor = {
      x: (svgEl.clientWidth || 800) / 2,
      y: (svgEl.clientHeight || 500) / 2,
    };
    userAdjusted = true;
    const next = zoomAt(current, factor, anchor);
    select(svgEl).call(
      zoomBehavior.transform,
      zoomIdentity.translate(next.x, next.y).scale(next.k),
    );
  }

  /** Center one node without changing scale. */
  export function focusNode(id: string): void {
    if (!svgEl || !layout || !zoomBehavior) return;
    const node = layout.nodes.find((candidate) => candidate.id === id);
    if (!node) return;
    const current = zoomTransform(svgEl);
    const next = centerOnNode(
      node,
      { width: svgEl.clientWidth || 800, height: svgEl.clientHeight || 500 },
      current.k,
    );
    userAdjusted = true;
    select(svgEl).call(
      zoomBehavior.transform,
      zoomIdentity.translate(next.x, next.y).scale(next.k),
    );
  }

  function fitWhole(): void {
    if (!layout) return;
    fitNodes(layout.nodes);
  }

  function fitNodes(nodes: Array<{ x: number; y: number; width: number; height: number }>): void {
    if (!svgEl || !zoomBehavior) return;
    const bounds = boundsForNodes(nodes);
    if (!bounds) return;
    const width = svgEl.clientWidth || 800;
    const height = svgEl.clientHeight || 500;
    const next = fitRect(bounds, { width, height });
    userAdjusted = false;
    select(svgEl).call(
      zoomBehavior.transform,
      zoomIdentity.translate(next.x, next.y).scale(next.k),
    );
  }

  function onEdgeClick(event: MouseEvent, edge: { source: string; target: string }): void {
    event.preventDefault();
    event.stopPropagation();
    if (!svgEl) return;
    if (dragged) {
      dragged = false;
      return;
    }
    const source = layout?.nodes.find((node) => node.id === edge.source);
    const target = layout?.nodes.find((node) => node.id === edge.target);
    if (!source || !target) return;
    const viewport = {
      width: svgEl.clientWidth || 800,
      height: svgEl.clientHeight || 500,
    };
    const reveal = edgeRevealTarget(source, target, zoomTransform(svgEl), viewport);
    if (!reveal) return;
    const focusId = reveal === "source" ? edge.source : edge.target;
    const focus = nodeById.get(focusId);
    if (!focus) return;
    focusNode(focusId);
    onselect(focus);
  }

  /** Return a full-graph, unzoomed SVG clone for copy or download. */
  export function snapshotSvg(): SVGSVGElement | null {
    if (!svgEl) return null;
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

    return clone;
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY };
    dragged = false;
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointerStart) return;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) {
      dragged = true;
    }
  }

  function onPointerUp(): void {
    pointerStart = null;
  }

  function onBackgroundClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest(".orchgraph-node")) return;
    if (dragged) {
      dragged = false;
      return;
    }
    onclear?.();
  }


</script>

<div class="graph-board">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svgEl}
    class:has-search-hits={searchHits.size > 0}
    class:has-selection={hasSelection}
    class="graph-svg code-graph-view"
    class:is-focus-only={focusOnly}
    role="group"
    aria-label={`Call graph for ${graphTitle}: ${displayData.nodes.length} nodes, ${displayData.edges.length} edges`}
    preserveAspectRatio="xMidYMid meet"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onclick={onBackgroundClick}
  >
    <title>Call graph for {graphTitle}</title>
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
        <g class="orchgraph-edges code-graph-edges">
          {#each layout.edges as edge (edge.id)}
            {@const edgeData = edgeById.get(edge.id)}
            <polyline
              class={`orchgraph-edge code-graph-edge${edgeData && related ? ` ${edgeRelationshipClass(edgeData, related)}` : ""}`}
              data-edge-id={edge.id}
              data-source={edge.source}
              data-target={edge.target}
              data-related={related ? related.edges.has(edge.id) : undefined}
              points={pointList(edge.points)}
              marker-end={`url(#${markerId})`}
            />
            <polyline
              class="code-graph-edge-hit"
              data-edge-id={edge.id}
              points={pointList(edge.points)}
              aria-hidden="true"
              onclick={(event) => onEdgeClick(event, edge)}
            />
          {/each}
        </g>

        <g class="orchgraph-nodes code-graph-nodes">
          {#each layout.nodes as positioned, index (positioned.id)}
            {@const node = nodeById.get(positioned.id)}
            {#if node}
              {@const selected = selectedId === node.id}
              {@const hit = searchHits.has(node.id)}
              {@const subtitle = shortQualifiedName(node.qualifiedName, projectName)}
              <g
                class={`orchgraph-node code-graph-node kind-${kindClass(node.label)}${selected ? " is-selected" : ""}${hit ? " is-search-hit" : ""}${related ? ` ${nodeRelationshipClass(node, related)}` : ""}`}
                data-node-id={node.id}
                data-kind={node.label}
                data-related={related ? related.nodes.has(node.id) : undefined}
                role="button"
                tabindex="0"
                aria-pressed={selected}
                aria-label={`${node.name}, ${node.label}, ${node.qualifiedName}`}
                onclick={(event) => {
                  event.stopPropagation();
                  if (dragged) {
                    dragged = false;
                    return;
                  }
                  onselect(node);
                }}
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
                {#if selected}
                  <rect
                    class="orchgraph-node-glow code-graph-node-glow"
                    x={positioned.x}
                    y={positioned.y}
                    width={positioned.width}
                    height={positioned.height}
                    rx="10"
                    aria-hidden="true"
                  />
                {/if}
                <rect
                  class="code-graph-node-card"
                  x={positioned.x}
                  y={positioned.y}
                  width={positioned.width}
                  height={positioned.height}
                  rx="10"
                />
                {#if nodeRender}
                  <foreignObject
                    class="code-graph-node-foreign"
                    x={positioned.x}
                    y={positioned.y}
                    width={positioned.width}
                    height={positioned.height}
                  >
                    <div xmlns="http://www.w3.org/1999/xhtml" class="code-graph-node-html">
                      {@html nodeRender(buildNodeRenderContext(node, displayData, projectName))}
                    </div>
                  </foreignObject>
                {:else}
                  <text
                    class="orchgraph-node-kind code-graph-node-kind"
                    x={positioned.x + positioned.width - 10}
                    y={positioned.y + 17}
                    text-anchor="end"
                  >{node.label}</text>
                  <g clip-path={`url(#orchgraph-clip-${index})`}>
                    <text
                      class="orchgraph-node-label code-graph-node-label"
                      x={positioned.x + 12}
                      y={positioned.y + 33}
                    >{node.name}</text>
                    <text
                      class="orchgraph-node-detail code-graph-node-detail"
                      x={positioned.x + 12}
                      y={positioned.y + 51}
                    >{subtitle}</text>
                  </g>
                {/if}
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
