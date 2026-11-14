<script lang="ts">
  import type { GraphViewNode, SymbolBundle } from "../../graph/types";

  interface Props {
    symbol: SymbolBundle | null;
    focusNode: GraphViewNode | null;
    loading: boolean;
    error: string;
    jumpStatus: string;
    jumpError: string;
    copyStatus: string;
    copyError: string;
    workspaceRoot: string;
    onclose: () => void;
    onjump: () => void;
    oncopy: (kind: "relative" | "absolute" | "both") => void;
    onopen: (qualifiedName: string) => void;
  }

  let {
    symbol,
    focusNode,
    loading,
    error,
    jumpStatus,
    jumpError,
    copyStatus,
    copyError,
    workspaceRoot,
    onclose,
    onjump,
    oncopy,
    onopen,
  }: Props = $props();

  function location(filePath?: string, line?: number, column?: number): string {
    if (!filePath) return "unknown location";
    return `${filePath}:${line ?? 1}:${column ?? 1}`;
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
          <div class="meta">{location(symbol.node.filePath, symbol.node.startLine, symbol.node.startColumn)}</div>
        </div>
      </div>
      <div class="inspector-actions">
        <button class="vscode-button" type="button" onclick={onjump}>Jump</button>
        <button
          class="vscode-button secondary"
          type="button"
          title="Copy relative path with line and column"
          onclick={() => oncopy("relative")}
        >Copy rel</button>
        <button
          class="vscode-button secondary"
          type="button"
          title="Copy absolute path with line and column"
          onclick={() => oncopy("absolute")}
        >Copy abs</button>
        <button
          class="vscode-button secondary"
          type="button"
          title="Copy relative and absolute paths with line and column"
          onclick={() => oncopy("both")}
        >Copy both</button>
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
              <div class="meta">{location(caller.filePath, caller.startLine, caller.startColumn)}</div>
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
              <div class="meta">{location(callee.filePath, callee.startLine, callee.startColumn)}</div>
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
          <div class="meta">{location(focusNode.filePath, focusNode.startLine, focusNode.startColumn)}</div>
        </div>
      </div>
      <div class="inspector-actions">
        <button class="vscode-button" type="button" onclick={onjump}>Jump</button>
        <button
          class="vscode-button secondary"
          type="button"
          title="Copy relative path with line and column"
          onclick={() => oncopy("relative")}
        >Copy rel</button>
        <button
          class="vscode-button secondary"
          type="button"
          title="Copy absolute path with line and column"
          onclick={() => oncopy("absolute")}
        >Copy abs</button>
        <button
          class="vscode-button secondary"
          type="button"
          title="Copy relative and absolute paths with line and column"
          onclick={() => oncopy("both")}
        >Copy both</button>
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
    {#if copyStatus}
      <p class="status">{copyStatus}</p>
    {/if}
    {#if copyError}
      <p class="error compact">{copyError}</p>
    {/if}
    <p
      class="path-hint"
      title={workspaceRoot ? `Workspace root: ${workspaceRoot}` : "Workspace root unavailable"}
    >Copied paths use <code>path:line:column</code>; absolute paths are resolved from the workspace root.</p>
  </div>
</aside>

<style>
  .inspector-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4ch;
  }

  .inspector-actions :global(.vscode-button) {
    padding: 0.2lh 0.7ch;
    font-size: 0.72rem;
  }

  .path-hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.68rem;
    line-height: 1.4;
  }
</style>
