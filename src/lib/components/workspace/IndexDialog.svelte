<script lang="ts">
  import { onMount } from "svelte";

  import {
    browseCbmFolders,
    fetchCbmIndexJobs,
    startCbmIndex,
    type CbmBrowseLevel,
  } from "../../cbm-index";
  import type { CbmFetch } from "../../cbm-projects";
  import { errorMessage } from "../../errors";

  interface Props {
    fetchCbm: CbmFetch;
    initialRoot?: string;
    onclose: () => void;
    onindexed: (project: string) => void;
  }

  let {
    fetchCbm,
    initialRoot = "",
    onclose,
    onindexed,
  }: Props = $props();

  let pathInput = $state<HTMLInputElement | null>(null);
  let rootPath = $state("");
  let projectName = $state("");
  let browseOpen = $state(false);
  let browseLevel = $state<CbmBrowseLevel | null>(null);
  let browseBusy = $state(false);
  let busy = $state(false);
  let status = $state("");
  let error = $state("");
  let timer: ReturnType<typeof setTimeout> | undefined;

  function suggestProject(path: string): string {
    const trimmed = path.replace(/[/\\]+$/, "");
    return trimmed.split(/[/\\]+/).at(-1) ?? "";
  }

  function useFolder(path: string): void {
    const previous = suggestProject(rootPath);
    rootPath = path;
    if (!projectName.trim() || projectName === previous) projectName = suggestProject(path);
  }

  async function browse(path = rootPath): Promise<void> {
    browseBusy = true;
    error = "";
    try {
      browseLevel = await browseCbmFolders(fetchCbm, path);
      browseOpen = true;
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      browseBusy = false;
    }
  }

  async function start(): Promise<void> {
    if (busy) return;
    busy = true;
    status = "Starting index…";
    error = "";
    try {
      const job = await startCbmIndex(fetchCbm, rootPath, projectName);
      status = `Indexing ${job.path} — this runs in the background.`;
      poll(job.slot, job.path);
    } catch (cause) {
      busy = false;
      status = "";
      error = errorMessage(cause);
    }
  }

  function poll(slot: number, path: string): void {
    clearTimeout(timer);
    timer = setTimeout(() => void check(slot, path), 900);
  }

  async function check(slot: number, path: string): Promise<void> {
    try {
      const jobs = await fetchCbmIndexJobs(fetchCbm);
      const job = jobs.find((candidate) => (slot >= 0 ? candidate.slot === slot : candidate.path === path));
      if (!job || job.status === "indexing" || job.status === "unknown") {
        poll(slot, path);
        return;
      }
      busy = false;
      if (job.status === "error") {
        status = "";
        error = job.error || "Index failed";
        return;
      }
      status = "Index complete.";
      onindexed(projectName.trim());
    } catch (cause) {
      busy = false;
      status = "";
      error = `Could not read index status: ${errorMessage(cause)}`;
    }
  }

  onMount(() => {
    rootPath = initialRoot;
    projectName = suggestProject(initialRoot);
    pathInput?.focus();
    pathInput?.select();
    return () => clearTimeout(timer);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="modal-backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
  onkeydown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onclose();
    }
  }}
>
  <dialog open class="index-dialog" aria-labelledby="index-title">
    <header class="panel-head">
      <div>
        <h2 id="index-title">Index a cbm folder</h2>
        <span class="sub">Rebuild a deleted project without leaving the graph</span>
      </div>
      <button class="icon-button" type="button" aria-label="Close index dialog" onclick={onclose}>×</button>
    </header>

    <div class="index-body">
      <div class="field">
        <label class="field-label" for="index-path">Repository folder</label>
        <div class="index-path-row">
          <input
            bind:this={pathInput}
            id="index-path"
            class="search-input"
            type="text"
            bind:value={rootPath}
            placeholder="/absolute/path/to/repository"
            spellcheck="false"
            autocomplete="off"
            aria-describedby="index-path-hint"
          />
          <button
            class="vscode-button secondary tool-button"
            type="button"
            disabled={browseBusy}
            onclick={() => void browse()}
          >{browseBusy ? "…" : "Browse"}</button>
        </div>
        <span class="hint" id="index-path-hint">
          The folder is read by the cbm server; its workspace boundary still applies.
        </span>
      </div>

      {#if browseOpen}
        <div class="folder-browser" aria-label="Folder browser">
          <div class="folder-browser-head">
            <code>{browseLevel?.path || "roots"}</code>
            <button
              class="link"
              type="button"
              disabled={!browseLevel?.parent}
              onclick={() => browseLevel && void browse(browseLevel.parent)}
            >up</button>
          </div>
          <div class="folder-list">
            {#each browseLevel?.roots ?? [] as root (root)}
              <button class="folder-button" type="button" onclick={() => void browse(root)}>{root}</button>
            {/each}
            {#each browseLevel?.dirs ?? [] as dir (dir)}
              <button class="folder-button" type="button" onclick={() => void browse(`${browseLevel?.path.replace(/[/\\]+$/, "")}/${dir}`)}>
                {dir}/
              </button>
            {/each}
            {#if browseLevel && browseLevel.dirs.length === 0 && browseLevel.roots.length === 0}
              <span class="hint">No folders here.</span>
            {/if}
          </div>
          <button
            class="vscode-button secondary tool-button"
            type="button"
            disabled={!browseLevel?.path}
            onclick={() => {
              if (browseLevel?.path) useFolder(browseLevel.path);
              browseOpen = false;
            }}
          >Use this folder</button>
        </div>
      {/if}

      <div class="field">
        <label class="field-label" for="index-project">Project name</label>
        <input
          id="index-project"
          class="search-input"
          type="text"
          bind:value={projectName}
          placeholder="cbm project name"
          spellcheck="false"
          autocomplete="off"
        />
      </div>

      {#if status}<p class="index-status" role="status" aria-live="polite">{status}</p>{/if}
      {#if error}<p class="error compact" role="alert">{error}</p>{/if}

      <div class="index-actions">
        <button class="vscode-button secondary" type="button" onclick={onclose}>Cancel</button>
        <button
          class="vscode-button"
          type="button"
          disabled={busy || !rootPath.trim() || !projectName.trim()}
          onclick={() => void start()}
        >{busy ? "Indexing…" : "Index folder"}</button>
      </div>
    </div>
  </dialog>
</div>
