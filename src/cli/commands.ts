import EntriesCommand from "./commands/entries-command.ts";
import GraphCommand from "./commands/graph-command.ts";
import IndexCommand from "./commands/index-command.ts";
import RenderCommand from "./commands/render-command.ts";

export const commands = {
  entries: EntriesCommand,
  graph: GraphCommand,
  index: IndexCommand,
  render: RenderCommand,
};
