import { ACTOR_TOOLS } from './actors.js';
import { ApifyError, type FetchLike, runActorSync } from './apify.js';
import type { ActorTool } from './types.js';

export { ACTOR_TOOLS };

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface CallEnv {
  APIFY_TOKEN?: string;
  APIFY_MAX_TOTAL_CHARGE_USD?: string;
  APIFY_MCP_MAX_RESPONSE_CHARS?: string;
}

export const DEFAULT_MAX_TOTAL_CHARGE_USD = 1;
export const DEFAULT_MAX_RESPONSE_CHARS = 200_000;

export function listTools() {
  return ACTOR_TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      title: t.title,
      // bulk_http_request can send POST/PUT/PATCH/DELETE requests, so it is not read-only.
      readOnlyHint: t.name !== 'bulk_http_request',
      openWorldHint: true,
    },
  }));
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/** Returns an error message, or null when the input is usable. */
export function validateInput(tool: ActorTool, args: Record<string, unknown>): string | null {
  const known = tool.inputSchema.properties;
  const unknown = Object.keys(args).filter((k) => !(k in known));
  if (unknown.length) {
    return `Unknown field(s) for ${tool.name}: ${unknown.join(', ')}.`;
  }
  for (const r of tool.inputSchema.required) {
    if (isEmpty(args[r])) return `Field "${r}" is required for ${tool.name}.`;
  }
  if (tool.anyOf.every((k) => isEmpty(args[k]))) {
    return `Give at least one of: ${tool.anyOf.join(', ')}. (An empty input would only run the Actor's built-in sample.)`;
  }
  return null;
}

function error(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function callTool(
  name: string,
  args: Record<string, unknown> | undefined,
  env: CallEnv,
  fetchImpl?: FetchLike,
): Promise<ToolResult> {
  const tool = ACTOR_TOOLS.find((t) => t.name === name);
  if (!tool) return error(`Unknown tool: ${name}.`);
  const input = Object.fromEntries(
    Object.entries(args ?? {}).filter(([, v]) => v !== undefined && v !== null),
  );
  const problem = validateInput(tool, input);
  if (problem) return error(problem);

  const token = env.APIFY_TOKEN?.trim();
  if (!token) {
    return error(
      'APIFY_TOKEN is not set. Put your own Apify API token in the APIFY_TOKEN environment variable of this MCP server (Apify Console > Settings > API & Integrations). Runs are billed to that Apify account.',
    );
  }
  const maxTotalChargeUsd = num(env.APIFY_MAX_TOTAL_CHARGE_USD, DEFAULT_MAX_TOTAL_CHARGE_USD);
  const maxChars = num(env.APIFY_MCP_MAX_RESPONSE_CHARS, DEFAULT_MAX_RESPONSE_CHARS);

  try {
    const items = await runActorSync(tool.actorId, input, { token, maxTotalChargeUsd, fetchImpl });
    let text = JSON.stringify(items, null, 2);
    if (text.length > maxChars) {
      text =
        text.slice(0, maxChars) +
        `\n... [cut at ${maxChars} of ${text.length} characters; ${items.length} items in total. The full result is in the run's dataset in your Apify Console.]`;
    }
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    if (e instanceof ApifyError) return error(e.message);
    return error(`Could not reach the Apify API: ${(e as Error).message}`);
  }
}
