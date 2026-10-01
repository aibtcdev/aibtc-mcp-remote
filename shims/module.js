// Build alias for Node's "module" (see wrangler.jsonc). @aibtc/mcp-server
// modules call createRequire(import.meta.url)("../../package.json") at load
// time to read their version; a bundled Worker has no file URL, so serve that
// package.json from the bundle and refuse anything else.
import packageJson from "@aibtc/mcp-server/package.json" with { type: "json" };

export function createRequire() {
  return (id) => {
    if (id.endsWith("/package.json")) return packageJson;
    throw new Error(`require("${id}") is not available in the Worker build`);
  };
}
