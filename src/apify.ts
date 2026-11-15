/**
 * Minimal Apify API client: runs an Actor synchronously and returns its dataset items.
 * https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface RunOptions {
  /** The caller's own Apify API token. */
  token: string;
  /** Upper limit for what one run may charge, in USD (Apify `maxTotalChargeUsd`). */
  maxTotalChargeUsd?: number;
  /** Override for tests. */
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApifyError';
  }
}

export const DEFAULT_BASE_URL = 'https://api.apify.com';

/** "user/name" -> "user~name" as the API path expects. */
export function actorPathId(actorId: string): string {
  return actorId.replace('/', '~');
}

export function buildRunUrl(
  actorId: string,
  opts: Pick<RunOptions, 'maxTotalChargeUsd' | 'baseUrl'>,
): string {
  const url = new URL(
    `/v2/acts/${actorPathId(actorId)}/run-sync-get-dataset-items`,
    opts.baseUrl ?? DEFAULT_BASE_URL,
  );
  url.searchParams.set('format', 'json');
  url.searchParams.set('clean', 'true');
  if (opts.maxTotalChargeUsd !== undefined && Number.isFinite(opts.maxTotalChargeUsd)) {
    url.searchParams.set('maxTotalChargeUsd', String(opts.maxTotalChargeUsd));
  }
  return url.toString();
}

export async function runActorSync(
  actorId: string,
  input: Record<string, unknown>,
  opts: RunOptions,
): Promise<unknown[]> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const res = await fetchImpl(buildRunUrl(actorId, opts), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'internamaro-apify-data-mcp',
    },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ApifyError(explain(res.status, text), res.status);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApifyError('Apify returned a response that is not JSON.', res.status);
  }
  if (!Array.isArray(data)) {
    throw new ApifyError(
      'Apify returned an unexpected response (expected a list of items).',
      res.status,
    );
  }
  return data;
}

function explain(status: number, body: string): string {
  let apiMessage = '';
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    apiMessage = parsed.error?.message ?? '';
  } catch {
    apiMessage = body.slice(0, 300);
  }
  const hints: Record<number, string> = {
    401: 'Check that APIFY_TOKEN is a valid Apify API token (Apify Console > Settings > API & Integrations).',
    402: 'Your Apify account has no credit left or reached a usage limit.',
    408: 'The run took longer than 300 seconds. Send a smaller input, or start the Actor from Apify Console instead.',
  };
  return [`Apify API error ${status}.`, apiMessage, hints[status] ?? ''].filter(Boolean).join(' ');
}
