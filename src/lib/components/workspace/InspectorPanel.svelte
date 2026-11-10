<script lang="ts">
  import type { GraphViewNode, SymbolBundle } from "../../graph/types";

  interface Props {
    symbol: SymbolBundle | null;
    focusNode: GraphViewNode | null;
    loading: boolean;
    error: string;
    jumpStatus: string;
    jumpError: string;
    onclose: () => void;
    onjump: () => void;
    onopen: (qualifiedName: string) => void;
  }

  let {
    symbol,
    focusNode,
    loading,
    error,
    jumpStatus,
    jumpError,
    onclose,
    onjump,
    onopen,
  }: Props = $props();

  function location(filePath?: string, line?: number): string {
    if (!filePath) return "unknown location";
    return line ? `${filePath}:${line}` : filePath;
  }
</script>

<aside class="edge-panel inspector-panel" aria-label="Symbol details">
  <div class="panel-head">
    <div>
      <h2>Details</h2>
      <span class="sub">{symbol?.node.name ?? focusNode?.name ?? "No selection"}</span>
    </div>
    <button class="icon-button" type="button" aria-label="Close details" onclick={onclose}>×</button>
  </div>

  <div class="inspector-body">
    {#if error}
      <p class="error compact">{error}</p>
    {/if}

    {#if symbol}
      <div class="inspector-title">
        <div>
          <span class="kind">{symbol.node.label}</span>
          <h3>{symbol.node.name}</h3>
          <div class="qn">{symbol.node.qualifiedName}</div>
          <div class="meta">{location(symbol.node.filePath, symbol.node.startLine)}</div>
        </div>
        <button class="vscode-button" type="button" onclick={onjump}>Jump</button>
      </div>

      {#if symbol.node.docstring}
        <p class="doc">{symbol.node.docstring}</p>
      {/if}

      <details class="inspector-section" open>
        <summary>
          <span>Callers</span>
          <span class="count">{symbol.callers.length}</span>
        </summary>
        <ul>
          {#each symbol.callers as caller (caller.qualifiedName)}
            <li>
              <button class="link" type="button" onclick={() => onopen(caller.qualifiedName)}>
                {caller.name}
              </button>
              <div class="qn">{caller.qualifiedName}</div>
              <div class="meta">{location(caller.filePath, caller.startLine)}</div>
            </li>
          {/each}
          {#if symbol.callers.length === 0}
            <li class="sub">none</li>
          {/if}
        </ul>
      </details>

      <details class="inspector-section" open>
        <summary>
          <span>Callees</span>
          <span class="count">{symbol.callees.length}</span>
        </summary>
        <ul>
          {#each symbol.callees as callee (callee.qualifiedName)}
            <li>
              <button class="link" type="button" onclick={() => onopen(callee.qualifiedName)}>
                {callee.name}
              </button>
              <div class="qn">{callee.qualifiedName}</div>
              <div class="meta">{location(callee.filePath, callee.startLine)}</div>
            </li>
          {/each}
          {#if symbol.callees.length === 0}
            <li class="sub">none</li>
          {/if}
        </ul>
      </details>
    {:else if focusNode}
      <div class="inspector-title">
        <div>
          <span class="kind">{focusNode.label}</span>
          <h3>{focusNode.name}</h3>
          <div class="qn">{focusNode.qualifiedName}</div>
          <div class="meta">{location(focusNode.filePath, focusNode.startLine)}</div>
        </div>
        <button class="vscode-button" type="button" onclick={onjump}>Jump</button>
      </div>
      <p class="sub">
        {loading ? "Loading symbol details…" : "Bundle details are unavailable for this graph node."}
      </p>
    {:else}
      <p class="inspector-empty">
        Select a node in the graph to inspect its callers and callees.
      </p>
    {/if}

    {#if jumpStatus}
      <p class="status">{jumpStatus}</p>
    {/if}
    {#if jumpError}
      <p class="error compact">{jumpError}</p>
    {/if}
  </div>
</aside>
