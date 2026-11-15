import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FetchLike } from './apify.js';
import { type CallEnv, callTool, listTools } from './tools.js';

export const SERVER_NAME = 'internamaro-apify-data';
export const SERVER_VERSION = '0.1.0';

export function createServer(env: CallEnv = process.env, fetchImpl?: FetchLike): Server {
  // The low-level Server is used on purpose: the tool input schemas are plain JSON Schema
  // generated from each Actor's input schema, not zod objects.
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'Data tools backed by Apify Actors published by ucchiii. Each tool call starts one Actor run on the Apify account that owns APIFY_TOKEN and is billed there at the Actor pay-per-event price.',
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callTool(
      req.params.name,
      req.params.arguments as Record<string, unknown> | undefined,
      env,
      fetchImpl,
    ),
  );
  return server;
}
