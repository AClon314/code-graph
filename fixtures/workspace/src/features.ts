import { UserRepo } from "./lib/user-repo";

export function useAlias(): string {
  const repo = new UserRepo();
  return repo.get("id");
}
