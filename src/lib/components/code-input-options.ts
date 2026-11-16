/** One completion candidate for CodeInput. */
export type CodeInputOption =
  | string
  | {
      value: string;
      label?: string;
      description?: string;
    };

/** A static list, or a provider evaluated when completion is requested. */
export type CodeInputOptions =
  | readonly CodeInputOption[]
  | (() =>
      | readonly CodeInputOption[]
      | Promise<readonly CodeInputOption[]>);

export interface NormalizedCodeInputOption {
  value: string;
  label: string;
  description?: string;
}

export function normalizeCodeInputOptions(
  options: readonly CodeInputOption[] | null | undefined,
): NormalizedCodeInputOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : {
          value: option.value,
          label: option.label ?? option.value,
          description: option.description,
        },
  );
}

/**
 * Resolve the `options` prop. Providers are called lazily, once per
 * completion request, so they can read current component state without
 * recreating the editor. Both sync and async providers are supported.
 */
export async function resolveCodeInputOptions(
  options: CodeInputOptions | null | undefined,
): Promise<NormalizedCodeInputOption[]> {
  const resolved =
    typeof options === "function" ? await options() : options;
  return normalizeCodeInputOptions(resolved);
}
