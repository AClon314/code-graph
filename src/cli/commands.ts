import GraphCommand from "./commands/graph-command.ts";
import IndexCommand from "./commands/index-command.ts";
import RenderCommand from "./commands/render-command.ts";

export const commands = {
  graph: GraphCommand,
  index: IndexCommand,
  render: RenderCommand,
};
