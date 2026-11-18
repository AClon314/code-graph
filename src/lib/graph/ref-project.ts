/** Re-target a project-qualified symbol entry when the project changes. */
export function refForProject(value: string, fromProject: string, toProject: string): string {
  const prefix = `${fromProject}.`;
  return value.startsWith(prefix) ? `${toProject}.${value.slice(prefix.length)}` : value;
}
