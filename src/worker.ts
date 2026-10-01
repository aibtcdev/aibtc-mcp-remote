/**
 * Cloudflare Worker entry for the keyless remote MCP server (mcp.aibtc.com).
 *
 *
 * The server is loaded on the first request, not at startup: @aibtc/mcp-server
 * pulls in dependencies (Spark SDK) that generate random values at module load,
 * which Workers only allows inside a handler.
 */
import axios from "axios";
import packageJson from "../package.json" with { type: "json" };

// axios's fetch adapter sends cache: "default", which Workers rejects
// ("Unsupported cache mode"); only "no-store" and "no-cache" are supported.
// This is the same axios instance @aibtc/mcp-server imports (deduped).
axios.defaults.fetchOptions = { cache: "no-store" };

type App = { fetch: (request: Request) => Promise<Response> };

let app: Promise<App> | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    app ??= import("./server.js").then(
      ({ createRemoteApp }) => createRemoteApp(packageJson.version),
      (error) => {
        app = undefined; // retry the load on the next request
        throw error;
      }
    );
    return (await app).fetch(request);
  },
};
