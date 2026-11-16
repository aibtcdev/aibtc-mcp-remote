import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createRemoteServer } from "../src/server.js";

/**
 * tools.test.ts checks tool names only. These tests drive the server through a
 * real MCP client, so a dependency bump that breaks how a registered tool runs
 * (not just whether it is registered) fails CI instead of reaching production.
 * Only tools that need no network are called, so CI stays deterministic.
 */
describe("remote server over MCP", () => {
  let client: Client;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createRemoteServer("0.0.0").connect(serverTransport);
    client = new Client({ name: "smoke-test", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it("lists tools without wallet or signing tools", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    expect(names.has("sip018_hash")).toBe(true);
    expect(names.has("wallet_unlock")).toBe(false);
  });

  it("runs a read-only tool end to end", async () => {
    const result = await client.callTool({
      name: "sip018_hash",
      arguments: { message: { amount: { type: "uint", value: 100 } }, domain: { name: "smoke", version: "1", chainId: 1 } },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const body = JSON.parse(text) as { success: boolean; hashes: { encoded: string; verification: string } };
    expect(body.success).toBe(true);
    // verification is sha256 over the encoded bytes; recompute it independently.
    const expected = createHash("sha256").update(Buffer.from(body.hashes.encoded, "hex")).digest("hex");
    expect(body.hashes.verification).toBe(expected);
  });

  it("refuses a tool that is not on the allowlist", async () => {
    const result = await client
      .callTool({ name: "wallet_unlock", arguments: { password: "x" } })
      .catch((e: unknown) => ({ isError: true, thrown: e }));
    expect(result.isError).toBe(true);
  });
});
