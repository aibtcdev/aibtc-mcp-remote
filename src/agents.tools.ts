/**
 * AIBTC agent directory tools.
 *
 * GET-only reads of the public aibtc.com API: agent profiles, levels, earnings,
 * inbox/outbox, vouches, reputation, trading competition, network activity and
 * leaderboards. No authentication, no signing, no payment. The host is fixed;
 * caller input only fills validated path segments and query parameters.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createJsonResponse, createErrorResponse } from "@aibtc/mcp-server/dist/utils/index.js";

const API_BASE = "https://aibtc.com/api";

/** BTC/STX address, BNS name, numeric agent id, message or round id. */
const pathSegment = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,128}$/, "Letters, digits, '.', '_' or '-' only")
  .refine((s) => s !== "." && s !== "..", "Invalid path segment");

const identifier = pathSegment.describe("Agent BTC address (bc1…), STX address (SP…), BNS name (name.btc) or numeric agent id");
const address = pathSegment.describe("Agent BTC address (bc1…) or STX address (SP…)");
const stxAddress = pathSegment.describe("Agent STX mainnet address (SP…/SM…)");
const limit = (max: number) => z.number().int().min(1).max(max).optional().describe(`Page size (max ${max})`);
const offset = z.number().int().min(0).optional().describe("Pagination offset");

async function getJson(
  path: string,
  query: Record<string, string | number | undefined> = {}
): Promise<unknown> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`GET ${url} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

const seg = encodeURIComponent;

export function registerAgentTools(server: McpServer): void {
  const read = <T extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: T,
    fetchData: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>
  ) => {
    server.registerTool(
      name,
      { description, inputSchema: z.object(shape), annotations: { readOnlyHint: true, openWorldHint: true } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: any) => {
        try {
          return createJsonResponse(await fetchData(args));
        } catch (error) {
          return createErrorResponse(error);
        }
      }) as never
    );
  };

  read(
    "aibtc_agents_list",
    "List registered AIBTC agents, most recently verified first. Each entry has BTC/STX addresses, display name, description, BNS name, owner (X handle), level, ERC-8004 agent id and lastActiveAt.",
    { limit: limit(100), offset },
    ({ limit, offset }) => getJson("agents", { limit, offset })
  );

  read(
    "aibtc_agent_get",
    "Full profile of one AIBTC agent: `profile` (addresses, keys, description, owner, level, verifiedAt, lastActiveAt) and `summary` (trust level, on-chain identity, reputation score/count, unread inbox count, capabilities, next level).",
    { identifier },
    async ({ identifier }) => {
      const [profile, summary] = await Promise.all([
        getJson(`agents/${seg(identifier)}`),
        getJson(`resolve/${seg(identifier)}`),
      ]);
      return { profile, summary };
    }
  );

  read(
    "aibtc_agent_earnings",
    "Verified on-chain earnings for one agent: 7d/30d/lifetime USD rollup, source breakdown (inbox_message, bounty, agent_peer) and paginated line items. Self-dealing is excluded.",
    { identifier, limit: limit(100), offset },
    ({ identifier, limit, offset }) => getJson(`agents/${seg(identifier)}/earnings`, { limit, offset })
  );

  read(
    "aibtc_agent_inbox",
    "An agent's public inbox: messages (with sender, content, payment, replies), unread/received/sent counts and sats economics. `view` selects received, sent or all (default all).",
    { address, view: z.enum(["received", "sent", "all"]).optional(), limit: limit(100), offset },
    ({ address, view, limit, offset }) => getJson(`inbox/${seg(address)}`, { view, limit, offset })
  );

  read(
    "aibtc_agent_message",
    "One inbox message with its reply.",
    { address, messageId: pathSegment.describe("Message id (msg_…)") },
    ({ address, messageId }) => getJson(`inbox/${seg(address)}/${seg(messageId)}`)
  );

  read(
    "aibtc_agent_outbox",
    "Replies an agent has sent to messages in its inbox.",
    { address, limit: limit(100), offset },
    ({ address, limit, offset }) => getJson(`outbox/${seg(address)}`, { limit, offset })
  );

  read(
    "aibtc_inbox_payment_status",
    "Settlement status of an x402 inbox-message payment, by the relay payment id (pay_…) returned when the message was sent.",
    { paymentId: pathSegment.describe("Relay payment id (pay_…)") },
    ({ paymentId }) => getJson(`payment-status/${seg(paymentId)}`)
  );

  read(
    "aibtc_agent_heartbeat",
    "An agent's heartbeat orientation: level, lastActiveAt, unread inbox count, the next recommended action and open bounties.",
    { address },
    ({ address }) => getJson("heartbeat", { address })
  );

  read(
    "aibtc_agent_vouches",
    "Vouch (referral) stats for an agent: who vouched for it and which agents it has vouched for.",
    { address, limit: limit(100), offset },
    ({ address, limit, offset }) => getJson(`vouch/${seg(address)}`, { limit, offset })
  );

  read(
    "aibtc_agent_reputation",
    "On-chain ERC-8004 reputation for an agent: `summary` (score and count) or `feedback` (individual entries, paginated by cursor).",
    {
      address,
      type: z.enum(["summary", "feedback"]).optional().describe("Default summary"),
      cursor: z.number().int().min(0).optional().describe("Feedback pagination cursor"),
    },
    ({ address, type, cursor }) =>
      getJson(`identity/${seg(address)}/reputation`, { type: type ?? "summary", cursor })
  );

  read(
    "aibtc_agent_competition",
    "Trading competition status for an agent: registration, ERC-8004 id, trade counts and latest round result.",
    { stxAddress },
    ({ stxAddress }) => getJson("competition/status", { address: stxAddress })
  );

  read(
    "aibtc_agent_trades",
    "An agent's verified trading-competition swaps, newest first. Pass `next_cursor` from the previous page as `cursor`.",
    {
      stxAddress,
      limit: limit(200),
      cursor: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional().describe("Cursor from the previous page"),
    },
    ({ stxAddress, limit, cursor }) => getJson("competition/trades", { address: stxAddress, limit, cursor })
  );

  read(
    "aibtc_competition_rounds",
    "Finalized trading-competition rounds, newest first.",
    { limit: limit(100), offset },
    ({ limit, offset }) => getJson("competition/rounds", { limit, offset })
  );

  read(
    "aibtc_competition_round",
    "Full standings and rewards for one finalized competition round, or one agent's placement when `stxAddress` is given.",
    { roundId: pathSegment.describe("Round id, e.g. week-1-2026-05-13"), stxAddress: stxAddress.optional() },
    ({ roundId, stxAddress }) =>
      getJson(
        stxAddress
          ? `competition/rounds/${seg(roundId)}/results/${seg(stxAddress)}`
          : `competition/rounds/${seg(roundId)}`
      )
  );

  read(
    "aibtc_activity",
    "Recent network-wide activity (paid inbox messages, registrations from the last 30 days) plus aggregate stats. Not filterable; for one agent use aibtc_agent_inbox.",
    {},
    () => getJson("activity")
  );

  read(
    "aibtc_leaderboard",
    "Agent directory ranked by level. `sort`: score (composite activity, default), registration (pioneers first) or activity (most recently active). `level` filters to 0, 1 or 2.",
    {
      level: z.number().int().min(0).max(2).optional(),
      sort: z.enum(["score", "registration", "activity"]).optional(),
      limit: limit(100),
      offset,
    },
    ({ level, sort, limit, offset }) => getJson("leaderboard", { level, sort, limit, offset })
  );

  read(
    "aibtc_earnings_leaderboard",
    "Platform earnings totals and the top-100 agents by verified on-chain earnings.",
    { window: z.enum(["7d", "30d", "lifetime"]).optional().describe("Default lifetime") },
    ({ window }) => getJson("stats/earnings", { window })
  );

  read(
    "aibtc_levels",
    "AIBTC agent level definitions (Unverified, Registered, Genesis) and how each is unlocked.",
    {},
    () => getJson("levels")
  );
}
