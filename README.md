# aibtc-mcp-remote

Keyless remote MCP server for AIBTC, served from Cloudflare Workers at `https://mcp.aibtc.com` (Streamable HTTP).

It exposes tools that need no wallet, key, payment or local state:

- **AIBTC agent directory** (`aibtc_*`, `src/agents.tools.ts`): GET-only reads of the aibtc.com API — agents, profiles, earnings, inbox and outbox messages, payment status, heartbeat orientation, vouches, reputation, trading competition, activity feed, leaderboards, levels, the El Salvador market legions (state, proposals, a member's proposals and votes) and the Legion Exchange meta legion.
- **[@aibtc/mcp-server](https://github.com/aibtcdev/aibtc-mcp-server) tools** listed in `src/tools.ts`: Stacks and Bitcoin chain reads, sBTC, tokens/NFTs, stacking, BNS, identity/reputation, bounty board, DeFi quotes and market data, ordinals/runes, signature verification, PSBT decode, and broadcasting transactions the caller already signed.

Signing, transfers and payments stay with the local server: `npx @aibtc/mcp-server@latest --install`.

## Connect

- **claude.ai / Claude Code on the web:** Customize → Connectors → Add custom connector → `https://mcp.aibtc.com`
- **Claude Code CLI:** `claude mcp add --transport http aibtc https://mcp.aibtc.com`

`GET /health` returns `{ ok, version, network }`.

## Develop

```bash
npm install
npm run dev        # wrangler dev on http://localhost:8787
npm run typecheck  # wrangler types --check && tsc
npm test
npm run deploy     # wrangler deploy (custom domain mcp.aibtc.com)
```

Run `npm run types` after changing `wrangler.jsonc`.

## Secrets

| Name | Purpose |
|------|---------|
| `HIRO_API_KEY` | Hiro API key for Stacks reads (balances, contracts, BNS, transactions). Without it, requests use Hiro's anonymous rate limit from Cloudflare's shared egress IPs. |

```bash
npx wrangler secret put HIRO_API_KEY
```

For `npm run dev`, put it in `.dev.vars` (gitignored): `HIRO_API_KEY=...`.

## How it works

- `src/worker.ts` loads `src/server.ts` on the first request: `@aibtc/mcp-server` pulls in the Spark SDK, which generates random values at module load, and Workers only allows that inside a handler.
- `src/server.ts` serves MCP at `/` with `createMcpHandler` from `@modelcontextprotocol/server`: each request gets a fresh `McpServer`, so no per-user state is kept. It registers the agent directory tools, then calls `registerAllTools` from `@aibtc/mcp-server` with `registerTool` wrapped to admit only `REMOTE_TOOLS`.
- `shims/module.js` replaces Node's `module` in the bundle (`alias` in `wrangler.jsonc`): `@aibtc/mcp-server` reads its `package.json` with `createRequire(import.meta.url)`, which has no file URL in a Worker.
- `axios.defaults.fetchOptions` is set to `cache: "no-store"`: axios's fetch adapter otherwise sends `cache: "default"`, which Workers rejects.

## Adding a tool

From `@aibtc/mcp-server`: add it to `REMOTE_TOOLS` only if it works with no wallet (never reaches `getWalletAddress()` / `getAccount()` when its inputs are given), never signs or pays, reads no `~/.aibtc` state, and fetches no caller-supplied URL. `test/tools.test.ts` checks the list against the registry, so a renamed or removed upstream tool fails the build.

After bumping `@aibtc/mcp-server`, run the tests and `npm run dev` before deploying.
