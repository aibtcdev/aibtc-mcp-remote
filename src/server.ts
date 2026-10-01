/**
 * Keyless remote MCP server: tool registration and the HTTP app.
 *
 * Each HTTP request is served by a fresh McpServer from createMcpHandler, so no
 * per-user state lives in the process. One deployment serves one network
 * (NETWORK env).
 */
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { registerAllTools } from "@aibtc/mcp-server/dist/tools/index.js";
import { ALL_TOOLS } from "@aibtc/mcp-server/dist/tools/profiles.js";
import { NETWORK } from "@aibtc/mcp-server/dist/config/index.js";
import { redactSensitive } from "@aibtc/mcp-server/dist/utils/redact.js";
import { REMOTE_TOOLS } from "./tools.js";
import { registerAgentTools } from "./agents.tools.js";

export const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 1024 * 1024;

const INSTRUCTIONS = [
  "This is the hosted, keyless aibtc server: AIBTC agent directory (aibtc_*:",
  "profiles, activity, inbox, earnings, reputation, leaderboards), Stacks and",
  "Bitcoin chain data, DeFi quotes, market data, bounty board and x402",
  "discovery. It holds no wallet, so pass addresses explicitly. It cannot sign,",
  "transfer or pay; for that the user runs the local server:",
  "npx @aibtc/mcp-server@latest --install",
  "",
  `Network: ${NETWORK}.`,
].join("\n");

/**
 * Registers the agent directory tools, then the @aibtc/mcp-server tools in
 * REMOTE_TOOLS. registerAllTools registers every tool, so the allowlist is
 * applied by wrapping registerTool on this instance.
 */
export function createRemoteServer(version: string): McpServer {
  const server = new McpServer(
    { name: "aibtc-mcp-server-remote", version },
    { instructions: INSTRUCTIONS }
  );
  registerAgentTools(server);
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((name: string, ...rest: unknown[]) =>
    REMOTE_TOOLS.has(name)
      ? (registerTool as (...args: unknown[]) => unknown)(name, ...rest)
      : undefined) as typeof server.registerTool;
  registerAllTools(server, ALL_TOOLS);
  return server;
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Fetch-style app: `/mcp` (MCP Streamable HTTP) and `/health`. */
export function createRemoteApp(version: string): {
  fetch: (request: Request) => Promise<Response>;
  close: () => Promise<void>;
} {
  const handler = createMcpHandler(() => createRemoteServer(version), {
    maxRequestBodySize: MAX_BODY_BYTES,
    onerror: (error) => console.error("MCP error:", redactSensitive(String(error))),
  });
  return {
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === "/health" && request.method === "GET") {
        return json(200, { ok: true, version, network: NETWORK });
      }
      if (pathname !== MCP_PATH) {
        return json(404, { error: "Not found. The MCP endpoint is /mcp." });
      }
      return handler.fetch(request);
    },
    close: () => handler.close(),
  };
}
