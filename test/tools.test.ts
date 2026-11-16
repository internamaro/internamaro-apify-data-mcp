import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildRunUrl } from '../src/apify.js';
import { createServer } from '../src/server.js';
import { ACTOR_TOOLS, callTool, listTools } from '../src/tools.js';

interface Recorded {
  url: string;
  init: RequestInit;
}

function mockFetch(status: number, body: unknown) {
  const calls: Recorded[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

const ENV = { APIFY_TOKEN: 'test-user-token' };

test('every tool mirrors an Actor and describes what it returns', () => {
  assert.equal(ACTOR_TOOLS.length, 9);
  const names = new Set<string>();
  for (const t of ACTOR_TOOLS) {
    assert.match(t.actorId, /^ucchiii\/[a-z0-9-]+$/);
    assert.match(t.description, /^Returns /);
    assert.ok(t.description.includes('YOUR Apify account'));
    assert.ok(t.anyOf.length > 0);
    for (const k of [...t.anyOf, ...t.inputSchema.required]) {
      assert.ok(k in t.inputSchema.properties, `${t.name}: ${k} missing from schema`);
    }
    assert.ok(!names.has(t.name));
    names.add(t.name);
  }
  assert.ok(!JSON.stringify(ACTOR_TOOLS).includes('demo'), 'demo sentences are stripped');
});

test('listTools marks only bulk_http_request as not read-only', () => {
  const tools = listTools();
  const notReadOnly = tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
  assert.deepEqual(notReadOnly, ['bulk_http_request']);
});

test('buildRunUrl uses run-sync-get-dataset-items with a charge cap', () => {
  const url = new URL(buildRunUrl('ucchiii/html-to-markdown', { maxTotalChargeUsd: 0.5 }));
  assert.equal(url.origin, 'https://api.apify.com');
  assert.equal(url.pathname, '/v2/acts/ucchiii~html-to-markdown/run-sync-get-dataset-items');
  assert.equal(url.searchParams.get('maxTotalChargeUsd'), '0.5');
  assert.equal(url.searchParams.get('clean'), 'true');
});

test('callTool sends the user token and input, returns the items', async () => {
  const items = [{ url: 'https://example.com', markdown: '# Example', status: 'ok' }];
  const { fetchImpl, calls } = mockFetch(201, items);
  const res = await callTool('html_to_markdown', { urls: ['https://example.com'] }, ENV, fetchImpl);
  assert.equal(res.isError, undefined);
  assert.deepEqual(JSON.parse(res.content[0].text), items);
  assert.equal(calls.length, 1);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer test-user-token');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { urls: ['https://example.com'] });
  assert.ok(calls[0].url.includes('maxTotalChargeUsd=1'));
});

test('APIFY_MAX_TOTAL_CHARGE_USD overrides the default cap', async () => {
  const { fetchImpl, calls } = mockFetch(201, []);
  await callTool(
    'check_domain_availability',
    { domains: ['example.com'] },
    { ...ENV, APIFY_MAX_TOTAL_CHARGE_USD: '0.25' },
    fetchImpl,
  );
  assert.ok(calls[0].url.includes('maxTotalChargeUsd=0.25'));
  assert.ok(calls[0].url.includes('ucchiii~domain-availability-api'));
});

test('missing token: no HTTP call, clear error', async () => {
  const { fetchImpl, calls } = mockFetch(201, []);
  const res = await callTool('flatten_json', { items: [{ a: { b: 1 } }] }, {}, fetchImpl);
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /APIFY_TOKEN is not set/);
  assert.equal(calls.length, 0);
});

test('empty source input is refused (no demo run)', async () => {
  const { fetchImpl, calls } = mockFetch(201, []);
  const res = await callTool('flatten_json', { separator: '_' }, ENV, fetchImpl);
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /at least one of: datasetId, jsonUrl, items|at least one of/);
  assert.equal(calls.length, 0);
});

test('required field and unknown field are checked', async () => {
  const { fetchImpl, calls } = mockFetch(201, []);
  const a = await callTool('filter_rows', { fileUrl: 'https://x.test/a.csv' }, ENV, fetchImpl);
  assert.match(a.content[0].text, /"conditions" is required/);
  const b = await callTool('excel_to_json', { fileUrl: 'https://x.test/a.xlsx', nope: 1 }, ENV, fetchImpl);
  assert.match(b.content[0].text, /Unknown field/);
  const c = await callTool('no_such_tool', {}, ENV, fetchImpl);
  assert.match(c.content[0].text, /Unknown tool/);
  assert.equal(calls.length, 0);
});

test('API errors are explained', async () => {
  const unauthorized = mockFetch(401, { error: { type: 'token-not-valid', message: 'Token is not valid.' } });
  const a = await callTool('excel_to_json', { fileUrl: 'https://x.test/a.xlsx' }, ENV, unauthorized.fetchImpl);
  assert.equal(a.isError, true);
  assert.match(a.content[0].text, /401.*Token is not valid.*APIFY_TOKEN/);

  const timeout = mockFetch(408, { error: { message: 'Run timed out' } });
  const b = await callTool('remove_duplicates', { datasetIds: ['abc'] }, ENV, timeout.fetchImpl);
  assert.match(b.content[0].text, /300 seconds/);

  const notJson = mockFetch(201, 'oops');
  const c = await callTool('remove_duplicates', { datasetIds: ['abc'] }, ENV, notJson.fetchImpl);
  assert.match(c.content[0].text, /not JSON/);
});

test('network failure is reported, not thrown', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  const res = await callTool('bulk_http_request', { urls: ['https://example.com'] }, ENV, fetchImpl);
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /ECONNREFUSED/);
});

test('long results are cut to APIFY_MCP_MAX_RESPONSE_CHARS', async () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ i, text: 'x'.repeat(100) }));
  const { fetchImpl } = mockFetch(201, items);
  const res = await callTool(
    'html_to_markdown',
    { htmlStrings: ['<p>a</p>'] },
    { ...ENV, APIFY_MCP_MAX_RESPONSE_CHARS: '500' },
    fetchImpl,
  );
  assert.match(res.content[0].text, /cut at 500 of \d+ characters; 50 items/);
});

test('MCP protocol: list and call tools through a client', async () => {
  const { fetchImpl } = mockFetch(201, [{ domain: 'example.com', available: false }]);
  const server = createServer(ENV, fetchImpl);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientT);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 9);
  const res = await client.callTool({ name: 'check_domain_availability', arguments: { domains: ['example.com'] } });
  const content = res.content as { type: string; text: string }[];
  assert.equal(JSON.parse(content[0].text)[0].available, false);
  await client.close();
});
