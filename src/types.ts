export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: boolean;
}

/** One MCP tool = one Apify Actor published by ucchiii. */
export interface ActorTool {
  /** MCP tool name (snake_case). */
  name: string;
  /** Human-readable title. */
  title: string;
  /** Apify Actor ID in "username/actor-name" form. */
  actorId: string;
  /** Apify Store page of the Actor (shows the current price). */
  storeUrl: string;
  /** Tool description. Starts with what the tool returns. */
  description: string;
  /** At least one of these input fields must be given. */
  anyOf: string[];
  /** JSON Schema mirroring the Actor's input schema. */
  inputSchema: JsonSchemaObject;
}
