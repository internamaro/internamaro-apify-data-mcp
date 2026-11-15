# Internamaro Apify Data MCP

An MCP server with seven data post-processing tools: HTML to Markdown, bulk HTTP requests,
flatten JSON, filter rows, remove duplicates, Excel to JSON and domain availability.

Each tool is a thin wrapper around one public Apify Actor published by
[ucchiii](https://apify.com/ucchiii). A tool call starts one Actor run on **your own Apify
account** through the Apify API endpoint
[`run-sync-get-dataset-items`](https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post)
and returns the run's dataset items as JSON.

## Tools

| Tool | Returns | Apify Actor | Price at the time of writing (2026-11) |
| --- | --- | --- | --- |
| `html_to_markdown` | One item per page or HTML string: url, title, markdown, word and character counts, status | [ucchiii/html-to-markdown](https://apify.com/ucchiii/html-to-markdown) | $0.001 per converted page; failed pages free |
| `bulk_http_request` | One item per request: status, headers, JSON or text body, timing, error | [ucchiii/bulk-http-request](https://apify.com/ucchiii/bulk-http-request) | $0.001 per request that got a response |
| `flatten_json` | One flat item per input item (`address.city` style columns) | [ucchiii/flatten-json](https://apify.com/ucchiii/flatten-json) | $0.00015 per flattened row |
| `filter_rows` | The rows of a CSV/TSV/JSON/NDJSON file or dataset that match your conditions | [ucchiii/filter-rows](https://apify.com/ucchiii/filter-rows) | $0.00003 per row read |
| `remove_duplicates` | Merged Apify datasets without duplicate rows | [ucchiii/dataset-dedup-merge](https://apify.com/ucchiii/dataset-dedup-merge) | $0.0005 per output item |
| `excel_to_json` | One JSON item per spreadsheet row (or a link to an .xlsx made from JSON) | [ucchiii/excel-to-json](https://apify.com/ucchiii/excel-to-json) | $0.00002 per converted row |
| `check_domain_availability` | One item per domain: available true/false/null, status, TLD | [ucchiii/domain-availability-api](https://apify.com/ucchiii/domain-availability-api) | $0.0015 per domain with a definite answer; unknown and invalid names free |

The input fields of each tool mirror the Actor's input schema; see the Actor page for details.

Related (not a tool in this server): [ucchiii/domain-availability-checker](https://apify.com/ucchiii/domain-availability-checker), a bulk domain checker that returns the registrar and created / expiry dates for registered names. You can add it to Apify's hosted MCP server URL below.

## Pricing

- This MCP server is free and open source (MIT).
- Every tool call is an Actor run on the Apify account that owns `APIFY_TOKEN`. That account
  is billed the Actor's **pay-per-event** price shown on the Actor's Apify Store page (the
  table above is only a snapshot; the Store page is authoritative). Apify's own plan terms
  apply to your account as usual.
- Each run is capped with Apify's `maxTotalChargeUsd` (default **$1.00** per call, change it
  with `APIFY_MAX_TOTAL_CHARGE_USD`).
- A call with no data (for example no URLs at all) is refused locally and never starts a run.

## Setup

You need an [Apify account](https://console.apify.com/sign-up) and your API token from
Apify Console > Settings > API & Integrations. Use your own token; never share it.

### Run from source

```bash
git clone https://github.com/internamaro/internamaro-apify-data-mcp.git
cd internamaro-apify-data-mcp
npm ci
npm run build
```

Claude Desktop / Cursor / any MCP client (stdio):

```json
{
  "mcpServers": {
    "apify-data-tools": {
      "command": "node",
      "args": ["/absolute/path/to/internamaro-apify-data-mcp/dist/src/index.js"],
      "env": { "APIFY_TOKEN": "<your Apify API token>" }
    }
  }
}
```

### Docker

```bash
docker build -t internamaro-apify-data-mcp .
docker run -i --rm -e APIFY_TOKEN=<your Apify API token> internamaro-apify-data-mcp
```

### Without installing anything: Apify's hosted MCP server

The same Actors are also available through Apify's hosted MCP server. Add this URL to an MCP
client that supports remote servers and sign in with Apify (OAuth), or send the header
`Authorization: Bearer <your Apify API token>`:

```
https://mcp.apify.com?tools=ucchiii/html-to-markdown,ucchiii/bulk-http-request,ucchiii/flatten-json,ucchiii/filter-rows,ucchiii/dataset-dedup-merge,ucchiii/excel-to-json,ucchiii/domain-availability-api
```

## Environment variables

| Name | Required | Meaning |
| --- | --- | --- |
| `APIFY_TOKEN` | yes (for tool calls) | Your own Apify API token. Runs are billed to this account. The server starts and lists its tools without it. |
| `APIFY_MAX_TOTAL_CHARGE_USD` | no | Upper limit per tool call in USD (default `1`). |
| `APIFY_MCP_MAX_RESPONSE_CHARS` | no | Longer JSON results are cut to this many characters (default `200000`). The full result stays in the run's dataset in Apify Console. |

## Limits

- `run-sync-get-dataset-items` waits at most 300 seconds. Larger jobs return an error
  (HTTP 408); split the input or start the Actor from Apify Console.
- `bulk_http_request` can send POST, PUT, PATCH and DELETE requests with your headers. Only
  call APIs you are allowed to use.
- `check_domain_availability`: do not use it to register names that contain someone else's
  trademark (cybersquatting).

## Development

```bash
npm ci
npm test   # builds and runs the tests; HTTP is mocked, no token or network needed
```

## Support

Questions and bug reports: open a GitHub issue or write to support@internamaro.com.

## License

MIT
