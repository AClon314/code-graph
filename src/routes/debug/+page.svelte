<script lang="ts">
  import type { CompletionSource } from "@codemirror/autocomplete";
  import { EditorState } from "@codemirror/state";

  import CodeInput from "../../lib/components/CodeInput.svelte";

  const fruits = [
    "apple",
    "appoint",
    "apply",
    "application",
    "apricot",
    "banana",
  ];

  const statusOptions = [
    { value: "active", label: "active", description: "visible in the graph" },
    { value: "stale", label: "stale", description: "indexed previously" },
    { value: "hidden", label: "hidden", description: "filtered out" },
  ];

  const injectedSource: CompletionSource = (context) => {
    const word = context.matchBefore(/@[\w-]*/);
    if (!word || word.from === word.to) return null;
    return {
      from: word.from,
      options: [
        {
          label: "@plugin",
          detail: "injected by a language extension",
          type: "keyword",
        },
      ],
    };
  };
  const injectedLanguageData = EditorState.languageData.of(() => [
    { autocomplete: injectedSource },
  ]);

  let fruit = $state("ap");
  let status = $state("");
  let injected = $state("");
  let inputCount = $state(0);
  let changeCount = $state(0);
  let lastInput = $state("");
  let lastChange = $state("");
  let disabled = $state(false);
  let readonly = $state(false);
  let submitted = $state("");
  let inputRef = $state<{ focus(): void }>();

  function onSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    submitted = String(data.get("fruit") ?? "");
  }
</script>

<main class="debug-page">
  <header class="debug-head">
    <p class="eyebrow">experimental · CodeMirror 6 autocomplete</p>
    <h1>CodeInput</h1>
    <p class="lede">
      An editable select with a completion list. <kbd>Tab</kbd> opens or
      accepts, <kbd>↑</kbd>/<kbd>↓</kbd> navigate, <kbd>Enter</kbd> accepts,
      <kbd>Esc</kbd> closes. The chevron does the same; after the field is
      focused, clicking/tapping the field toggles the list.
    </p>
  </header>

  <form class="demo" onsubmit={onSubmit}>
    <div class="demo-row">
      <div class="demo-label">
        <label for="fruit-input">Fruit</label>
        <span class="hint">lazy options provider: type “ap”, then Tab</span>
      </div>
      <CodeInput
        id="fruit-input"
        name="fruit"
        bind:value={fruit}
        options={() => fruits}
        placeholder="Start typing…"
        aria-label="Fruit"
        aria-describedby="fruit-hint"
        oninput={(event) => {
          inputCount += 1;
          lastInput = (event as CustomEvent<{ value: string }>).detail.value;
        }}
        onchange={(event) => {
          changeCount += 1;
          lastChange = (event as CustomEvent<{ value: string }>).detail.value;
        }}
      />
      <p id="fruit-hint" class="hint">
        value: <code>{fruit}</code> · input events: {inputCount} · change events:
        {changeCount}
      </p>
    </div>

    <div class="demo-row">
      <div class="demo-label">
        <label for="status-input">Status</label>
        <span class="hint">object options may carry a description</span>
      </div>
      <CodeInput
        id="status-input"
        bind:value={status}
        options={statusOptions}
        placeholder="all statuses"
        aria-label="Status"
      />
    </div>

    <div class="demo-row">
      <div class="demo-label">
        <label for="injected-input">Injected source</label>
        <span class="hint">type “@”, then Tab; supplied through extensions</span>
      </div>
      <CodeInput
        id="injected-input"
        bind:value={injected}
        extensions={injectedLanguageData}
        placeholder="type @"
        aria-label="Injected completion source"
      />
    </div>

    <div class="demo-row controls">
      <label><input type="checkbox" bind:checked={disabled} /> disabled</label>
      <label><input type="checkbox" bind:checked={readonly} /> readonly</label>
      <button type="button" onclick={() => inputRef?.focus()}>focus()</button>
      <button type="submit">submit form</button>
    </div>

    <CodeInput
      bind:this={inputRef}
      bind:value={fruit}
      options={fruits}
      disabled={disabled}
      readonly={readonly}
      aria-label="Controlled fruit input"
    />

    <p class="hint">
      FormData: <code>{submitted || "(not submitted)"}</code> ·
      last input: <code>{lastInput || "—"}</code> · last change:
      <code>{lastChange || "—"}</code>
    </p>
  </form>
</main>

<style>
  .debug-page {
    height: 100%;
    overflow: auto;
    padding: 4lh clamp(1rem, 5vw, 4rem);
    background:
      linear-gradient(180deg, var(--cg-bg), var(--cg-panel) 140%);
    color: var(--cg-text);
  }

  .debug-head,
  .demo {
    max-width: 760px;
    margin: 0 auto;
  }

  .debug-head {
    padding-bottom: 2lh;
  }

  .eyebrow {
    margin: 0 0 0.5lh;
    color: var(--cg-muted);
    font-family: var(--cg-font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    font-family: var(--cg-font-mono);
    font-size: 1.6rem;
  }

  .lede {
    max-width: 62ch;
    margin: 0.75lh 0 0;
    color: var(--cg-muted);
    line-height: 1.5;
  }

  kbd,
  code {
    padding: 0.05lh 0.45ch;
    border: 1px solid var(--cg-line);
    border-radius: 0.2rem;
    background: var(--cg-panel);
    font-family: var(--cg-font-mono);
    font-size: 0.85em;
  }

  .demo {
    display: grid;
    gap: 2lh;
    padding: 2lh;
    border: 1px solid var(--cg-line);
    background: color-mix(in srgb, var(--cg-panel) 70%, transparent);
  }

  .demo-row {
    display: grid;
    gap: 0.6lh;
  }

  .demo-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 2ch;
  }

  label {
    font-weight: 600;
  }

  .hint {
    margin: 0;
    color: var(--cg-muted);
    font-size: 0.8rem;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.5ch;
  }

  .controls label {
    display: inline-flex;
    align-items: center;
    gap: 0.5ch;
    font-weight: 400;
  }

  button {
    padding: 0.3lh 1ch;
    border: 1px solid var(--cg-line);
    border-radius: 0.25rem;
    background: var(--cg-panel);
    color: var(--cg-text);
    font: inherit;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--cg-accent);
  }

  button[type="submit"] {
    border-color: var(--cg-accent);
    background: var(--cg-accent);
    color: var(--cg-accent-fg);
  }

  @media (max-width: 600px) {
    .debug-page {
      padding: 2lh 1rem;
    }

    .demo {
      padding: 1.5lh 1rem;
    }

    .demo-label {
      display: grid;
      gap: 0.2lh;
    }
  }
</style>
