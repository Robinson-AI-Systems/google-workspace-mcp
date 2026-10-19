// P8-4: document the generic RTC doors, never expand every provider tool into
// an operation. Tool-specific input/output schemas come from scoped discovery.
import { RTC_AREAS } from './catalog.js';
import {PRODUCT_DISPLAY_NAME,PROVIDER_DISCLOSURE} from '../branding.js';

const ref = name => ({ $ref: '#/components/schemas/' + name });
const json = schema => ({ 'application/json': { schema } });
const object = (properties, required = Object.keys(properties), extra = false) => ({
  type: 'object', properties, required, additionalProperties: extra
});
const string = { type: 'string' };
const bool = { type: 'boolean' };
const integer = { type: 'integer', minimum: 0 };
const strings = { type: 'array', items: string };
const parameter = (name, schema, description, location = 'query') => ({
  name, in: location, required: location === 'path', description, schema
});
const envelope = result => object({
  ok: { const: true }, result, mode: { type:'string', enum: ['test','live'] },
  handle: string, count: integer, summary: string
}, ['ok', 'result', 'mode']);
const errorResponse = description => ({ description, content: json(ref('Error')) });
const responses = (schema, description) => ({
  '200': { description, content: json(schema) },
  '400': errorResponse('Malformed arguments or provider request refused. Inspect the RTC error code; do not blindly retry writes.'),
  '401': errorResponse('Missing, invalid, expired or revoked service-issued RTC pass.'),
  '403': errorResponse('Profile, area, read-only, domain or operation guard refused the request.'),
  '404': errorResponse('Unknown tool or inaccessible, expired or foreign result handle.'),
  '405': errorResponse('HTTP method is not supported by this door.'),
  '413': errorResponse('Serialized tool arguments exceed 65,536 UTF-8 bytes.'),
  '429': { ...errorResponse('The pass exhausted its shared fixed-minute request limit.'), headers: {
    'Retry-After': { description: 'Seconds before retrying the request.', schema: { type: 'integer', minimum: 1 } }
  } },
  '500': errorResponse('Service or provider outcome could not be established. Reconcile possible writes before retry.'),
  '503': errorResponse('Service authorization or persistence unavailable; retry only safe reads.')
});
const nameParameter = parameter('name', { type: 'string', pattern: '^workspace_[a-z0-9_]+$' },
  'Exact advertised external tool name. Use GET /api/tools to discover permitted names.', 'path');
const fieldsParameter = parameter('fields', string,
  'Comma-separated dotted paths. Uses the same projection syntax as tool arguments.');
const body = (schema, description) => ({ required: true, description, content: json(schema) });

export function rtcOpenapi(origin = '') {
  // Relative URLs remain usable on the serving origin. Never advertise an
  // attacker-controlled scheme or URL credentials from a bad configuration.
  let servers = [{ url: '/' }];
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' && !url.username && !url.password &&
        url.pathname === '/' && !url.search && !url.hash) servers = [{ url: url.origin }];
  } catch { /* Serving origin is the safe default. */ }
  return {
    openapi: '3.1.0',
    info: { title: PRODUCT_DISPLAY_NAME, version: '1.0.0',
      description: PROVIDER_DISCLOSURE+' Independent Workspace RTC 1 API. All provider operations use the same guarded registry as MCP. Service-issued TEST and user-authorized live passes authenticate these doors; native connector OAuth tokens do not. Live capabilities still require user-selected permission and provider entitlement.' },
    servers,
    security: [{ rtcPass: [] }],
    paths: {
      '/api/contract': { get: {
        operationId: 'contract', summary: 'Read public RTC identity and capabilities', security: [],
        responses: { '200': { description: 'Raw manifest, without the RTC success envelope.', content: json(ref('Manifest')) } }
      } },
      '/api/openapi.json': { get: {
        operationId: 'openapi', summary: 'Read this generic API description', security: [],
        responses: { '200': { description: 'Raw OpenAPI 3.1 document, no authentication required.', content: json({ type: 'object', required: ['openapi','info','paths'] }) } }
      } },
      '/api/whoami': { get: {
        operationId: 'whoami', summary: 'Identify the current service-issued pass',
        responses: responses(envelope(ref('Identity')), 'Pass account, areas and selected test/live policy. No bearer secret is returned.')
      } },
      '/api/tools': { get: {
        operationId: 'searchTools', summary: 'Page the permitted tool catalog',
        parameters: [
          parameter('q', string, 'Case-insensitive substring of tool name or description.'),
          parameter('area', { type: 'string', enum: RTC_AREAS }, 'Filter to one existing tool area.'),
          parameter('audience', { type: 'string', enum: ['owner','operator','builder'] }, 'Filter by intended audience.'),
          parameter('listing', { type: 'string', enum: ['catalog','compact'] }, 'Defaults to the pass listing setting; does not widen authority.'),
          parameter('showUnavailable', bool, 'When true, include supported but unauthorized tools as available:false and needsReconnect:true; never grants access.'),
          parameter('limit', { type: 'integer', minimum: 1, maximum: 100, default: 10 }, 'Tools per page.'),
          parameter('page', { type: 'integer', minimum: 1, maximum: 100000, default: 1 }, 'One-based catalog page.')
        ],
        responses: responses(envelope(object({ tools: { type: 'array', items: ref('Tool') }, next: { type: ['string','null'] } })),
          'Authorized catalog page. next is the next page number as a string, or null.')
      } },
      '/api/tools/{name}': {
        parameters: [nameParameter],
        get: {
          operationId: 'describeTool', summary: 'Read an authorized tool schema',
          parameters: [parameter('showUnavailable',bool,'When true, return metadata for an unavailable capability with available:false; invocation remains forbidden.')],
          responses: responses(envelope(ref('Tool')), 'Exact registry input schema, optional output schema, and safety metadata.')
        },
        post: {
          operationId: 'callTool', summary: 'Invoke one guarded tool',
          description: 'Send the object described by the selected tool inputSchema, including its dryRun and confirm fields where applicable. A success HTTP status is not proof of a completed provider change: inspect done, confirmed, logged, refusals and readback. No automatic write retry is safe.',
          requestBody: body({ type: 'object', additionalProperties: true }, 'Tool-specific arguments, at most 65,536 serialized UTF-8 bytes. Read tools accept detail: summary|full and fields as comma-separated dotted paths.'),
          responses: responses(envelope({}), 'Tool result, guarded confirmation/preview, or connection-owned result handle.')
        }
      },
      '/api/tools/_batch': { post: {
        operationId: 'batchReads', summary: 'Run one to ten authorized reads',
        description: 'Entire batch must contain only permitted read tools. All calls share the same pass and provider identity; no changing tool is accepted even in dryRun. The batch response may itself use an owned result handle.',
        requestBody: body(object({ calls: { type: 'array', minItems: 1, maxItems: 10,
          items: object({ name: { type: 'string', pattern: '^workspace_[a-z0-9_]+$' }, args: { type: 'object', additionalProperties: true } }, ['name'], true) } }, ['calls'], true),
          'At most ten named read calls and 65,536 serialized UTF-8 bytes.'),
        responses: responses(envelope({}), 'Read results or an owned handle. Inspect individual encoded errors as well as the outer result.')
      } },
      '/api/results/{handle}': { get: {
        operationId: 'getResult', summary: 'Read a page of an owned stored result',
        parameters: [
          parameter('handle', string, 'Exact returned handle, accessible only to its issuing connection for 24 hours.', 'path'),
          parameter('page', { type: 'integer', minimum: 1, maximum: 100000, default: 1 }, 'One-based UTF-8 page. Omission returns the first page, never an unbounded payload.'),
          fieldsParameter
        ],
        responses: responses(envelope(ref('StoredResult')), 'Numbered bounded content with next, or a small projected payload. Concatenate content pages before parsing JSON; do not treat an individual page as a full provider object.')
      } }
    },
    components: {
      securitySchemes: { rtcPass: { type: 'http', scheme: 'bearer', bearerFormat: 'RTC service-issued test/live pass',
        description: 'Short-lived service-owned pass. Authorization: Bearer <pass>. Never place credentials in query parameters, tool arguments, reports or logs.' } },
      schemas: {
        Error: object({ ok: { const: false }, error: object({ what: string, cause: string, todo: string, technical: string, code: string }) }),
        Identity: object({ connection: string, account: string, profile: { type: 'string', enum: ['read_only','everyday','full'] },
          areas: { type: ['array','null'], items: string }, listing: { type: 'string', enum: ['catalog','compact'] },
          mode: { type:'string', enum:['test','live'] }, allow_writes: bool }),
        Tool: object({ name: string, description: { type: 'string', maxLength: 160 }, modes: strings, inputSchema: { type: 'object' },
          outputSchema: { type: 'object' }, area: string, profiles: strings, audience: strings,
          writes: bool, money: bool, billingRisk: bool, available:bool, needsReconnect:bool, reason:string, destructive: bool,
          annotations: object({ readOnlyHint: bool, destructiveHint: bool, idempotentHint: bool, openWorldHint: bool })
        }, ['name','description','inputSchema','area','profiles','audience','writes','money','destructive','annotations'], true),
        StoredResult: { oneOf: [
          object({ handle: string, page: { type: 'integer', minimum: 1 }, pages: { type: 'integer', minimum: 1 },
            bytes: integer, content: string, next: { type: ['integer','null'], minimum: 1 } },
            ['handle','page','pages','bytes','content','next']),
          object({ handle: string, bytes: integer, payload: string })
        ] },
        Manifest: object({ rtc: { const: 1 }, server: { const: 'google-workspace-mcp' }, prefix: { const: 'workspace' }, version: string,
          areas: strings, counts: object({ tools: integer, writes: integer, money: integer, billingRisk:integer }),
          profiles: strings, listingModes: strings, modes: { type: 'array', items: { type:'string', enum:['test','live'] } }, devTools: bool,
          deployment: object({ sourceRevision: { type: ['string','null'], pattern: '^[a-f0-9]{40}$' } })
        })
      }
    }
  };
}
