import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { registerAllTools } from "@aibtc/mcp-server/dist/tools/index.js";
import { ALL_TOOLS } from "@aibtc/mcp-server/dist/tools/profiles.js";
import { SPEND_TOOLS } from "@aibtc/mcp-server/dist/tools/bounty-hint.js";
import { REMOTE_TOOLS } from "../src/tools.js";
import { createRemoteServer } from "../src/server.js";
import { registerAgentTools } from "../src/agents.tools.js";

function namesRegisteredBy(register: (server: McpServer) => void): Set<string> {
  const names = new Set<string>();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  server.registerTool = ((name: string) => {
    names.add(name);
  }) as unknown as typeof server.registerTool;
  register(server);
  return names;
}

const allToolNames = () => namesRegisteredBy((s) => registerAllTools(s, ALL_TOOLS));

describe("remote tool allowlist", () => {
  it("names only tools that exist", () => {
    const all = allToolNames();
    expect([...REMOTE_TOOLS].filter((n) => !all.has(n))).toEqual([]);
  });

  it("excludes wallet, signing, spending and local-state tools", () => {
    const forbidden = /^(wallet_|lightning_|credentials_|yield_hunter_|nonce_|scaffold_)|_sign($|_)|^(set|delete|get)_(hiro_api_key|stacks_api_url)$|^probe_x402_endpoint$|^execute_x402_endpoint$/;
    expect([...REMOTE_TOOLS].filter((n) => forbidden.test(n) || SPEND_TOOLS.has(n))).toEqual([]);
  });

  it("registers exactly the allowlist plus the agent directory tools", () => {
    const agentTools = namesRegisteredBy(registerAgentTools);
    const all = allToolNames();
    expect([...agentTools].filter((n) => all.has(n))).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registered = Object.keys((createRemoteServer("0.0.0") as any)._registeredTools ?? {});
    expect(new Set(registered)).toEqual(new Set([...REMOTE_TOOLS, ...agentTools]));
  });
});
