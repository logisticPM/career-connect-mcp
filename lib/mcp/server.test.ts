import type { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { registerCareerConnect } from "./server";

/** Records what registerCareerConnect asks the SDK to register. */
function capture() {
  const tools: { name: string; config: { inputSchema?: unknown } }[] = [];
  const server = {
    registerTool: (name: string, config: { inputSchema?: unknown }) => tools.push({ name, config }),
    registerPrompt: () => undefined,
  };
  registerCareerConnect(server as unknown as McpServer);
  return tools;
}

describe("tool registration", () => {
  it("gives every tool an input schema, so handlers always receive (args, ctx)", () => {
    const tools = capture();
    expect(tools).toHaveLength(10);
    expect(tools.filter((t) => !t.config.inputSchema).map((t) => t.name)).toEqual([]);
  });
});
