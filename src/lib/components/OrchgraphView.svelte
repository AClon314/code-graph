<script lang="ts">
  import type { TerminalCanvas } from "orchgraph";

  import { buildTerminalCanvas } from "../graph/terminal";
  import { focusSubgraph } from "../graph/selection";
  import type { GraphViewData, GraphViewNode } from "../graph/types";

  interface Props {
    data: GraphViewData;
    selectedId?: string;
    searchHits?: Set<string>;
    focusOnly?: boolean;
    onselect: (node: GraphViewNode) => void;
    onjump?: (node: GraphViewNode) => void;
    onlayoutstatus?: (loading: boolean) => void;
    onclear?: () => void;
  }

  let {
    data,
    selectedId = "",
    searchHits = new Set<string>(),
    focusOnly = false,
    onselect,
    onjump,
    onlayoutstatus,
    onclear,
  }: Props = $props();

  let host = $state<HTMLDivElement | null>(null);
  let pre = $state<HTMLPreElement | null>(null);
  let canvas = $state<TerminalCanvas | null>(null);
  let layoutError = $state("");
  let scale = $state(1);
  let offsetX = $state(0);
  let offsetY = $state(0);

  const displayData = $derived.by(() =>
    focusOnly && selectedId ? focusSubgraph(data, selectedId) : data,
  );
  const nodeById = $derived(new Map(displayData.nodes.map((node) => [node.id, node])));
  const lineHeight = 1;

  $effect(() => {
    const current = displayData;
    let cancelled = false;
    canvas = null;
    layoutError = "";
    onlayoutstatus?.(true);

    void buildTerminalCanvas(current)
      .then((next) => {
        if (!cancelled) canvas = next;
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        canvas = null;
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
    if (!host || !pre || !canvas) return;
    const frame = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!host) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(host);
    if (pre) observer.observe(pre);
    void document.fonts?.ready.then(() => fit());
    return () => observer.disconnect();
  });

  function locate(node: TerminalCanvas["nodes"][number]): GraphViewNode | undefined {
    return nodeById.get(node.id);
  }

  function onNodeClick(event: Event, node: TerminalCanvas["nodes"][number]): void {
    event.stopPropagation();
    const target = locate(node);
    if (target) onselect(target);
  }

  function onNodeDoubleClick(event: MouseEvent, node: TerminalCanvas["nodes"][number]): void {
    event.preventDefault();
    event.stopPropagation();
    const target = locate(node);
    if (target) onjump?.(target);
  }

  function onNodeKeydown(event: KeyboardEvent, node: TerminalCanvas["nodes"][number]): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onNodeClick(event, node);
  }

  /** Scale the character canvas to fit the board. */
  export function fit(): void {
    if (!host || !pre) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;
    const artWidth = pre.offsetWidth;
    const artHeight = pre.offsetHeight;
    if (artWidth <= 0 || artHeight <= 0) return;
    scale = Math.max(0.1, Math.min(width / artWidth, height / artHeight, 1.8) * 0.96);
    offsetX = 0;
    offsetY = 0;
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * step * 0.0025);
      scale = Math.min(4, Math.max(0.1, scale * factor));
      return;
    }
    offsetX -= event.deltaX * step;
    offsetY -= event.deltaY * step;
  }

  /** Copy the character art, not an SVG. */
  export async function copy(): Promise<void> {
    const text = canvas?.lines.join("\n") ?? "";
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // Clipboard permission can be denied (embedded/headless browsers); use
      // the selection-based fallback below.
    }

    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    if (!copied) throw new Error("Clipboard copy was blocked");
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="graph-board terminal-board code-graph-view"
  class:is-focus-only={focusOnly}
  bind:this={host}
  onwheel={onWheel}
  onclick={(event) => {
    if ((event.target as Element).closest(".terminal-node-hit")) return;
    onclear?.();
  }}
>
  {#if canvas && canvas.lines.length > 0}
    <div class="terminal-art-shell">
      <div
        class="terminal-art"
        style={`transform: translate(${offsetX}px, ${offsetY}px) scale(${scale})`}
      >
        <pre class="terminal-art-text" bind:this={pre}>{canvas.lines.join("\n")}</pre>
        {#each canvas.nodes as node (node.id)}
          {@const target = locate(node)}
          <button
            type="button"
            class="terminal-node-hit code-graph-node"
            class:is-selected={selectedId === node.id}
            class:is-search-hit={searchHits.has(node.id)}
            style={`left:${node.x}ch; top:${node.y * lineHeight}em; width:${node.width}ch; height:${node.height * lineHeight}em`}
            aria-label={`${target?.name ?? node.label}${target?.filePath ? `, ${target.filePath}:${target.startLine ?? 1}` : ""}`}
            onclick={(event) => onNodeClick(event, node)}
            ondblclick={(event) => onNodeDoubleClick(event, node)}
            onkeydown={(event) => onNodeKeydown(event, node)}
          ></button>
        {/each}
      </div>
    </div>
  {:else if layoutError}
    <p class="graph-overlay error compact">Layout failed: {layoutError}</p>
  {:else}
    <p class="graph-overlay">Laying out graph…</p>
  {/if}
</div>
