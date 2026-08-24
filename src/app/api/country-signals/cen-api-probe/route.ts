import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SPEC_URL = "https://portal.api.coordinador.cl/swagger/spec/sip.json";
const PATHS = [
  "/costo-marginal-online/v4/findByDate",
  "/demanda-neta/v4/findByDate",
  "/generacion-real/v3/getDailySum",
  "/embalse-real/v3/findLast",
  "/limitaciones-transmision/v4/findByDate",
  "/stock-combustible/v4/findByDate",
] as const;

type JsonObject = Record<string, unknown>;

export async function GET() {
  try {
    const response = await fetch(SPEC_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Coordinador OpenAPI HTTP ${response.status}.`);
    const spec = (await response.json()) as unknown;
    if (!isObject(spec)) throw new Error("Coordinador OpenAPI returned an invalid document.");

    const paths = isObject(spec.paths) ? spec.paths : {};
    const components = isObject(spec.components) ? spec.components : {};
    const schemas = isObject(components.schemas) ? components.schemas : {};
    const securitySchemes = isObject(components.securitySchemes) ? components.securitySchemes : {};

    const selected = Object.fromEntries(
      PATHS.map((path) => {
        const pathItem = isObject(paths[path]) ? paths[path] : undefined;
        const get = isObject(pathItem?.get) ? pathItem.get : undefined;
        return [
          path,
          {
            parameters: summarizeParameters(get?.parameters, schemas),
            security: get?.security,
            responses: summarizeResponses(get?.responses, schemas),
          },
        ];
      }),
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      specUrl: SPEC_URL,
      servers: spec.servers,
      securitySchemes,
      selected,
      schemas: Object.fromEntries(
        [
          "CMGOnlineResponse",
          "CMGOnlineData",
          "DemandaNetaResponse",
          "DemandaNetaData",
          "GeneracionRealSumResponse",
          "EmbalseRealLastResponse",
          "LimitacionesTransmisionResponse",
          "LimitacionesTransmisionData",
          "StockCombustibleResponse",
          "StockCombustibleData",
        ].map((name) => [name, summarizeSchema(schemas[name], schemas, 2)]),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CEN API probe failed." },
      { status: 502 },
    );
  }
}

function summarizeParameters(value: unknown, schemas: JsonObject) {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((parameter) => ({
    name: parameter.name,
    in: parameter.in,
    required: parameter.required,
    schema: summarizeSchema(parameter.schema, schemas, 1),
    example: parameter.example,
  }));
}

function summarizeResponses(value: unknown, schemas: JsonObject) {
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([status, raw]) => {
      if (!isObject(raw)) return [status, raw];
      const schema = nested(raw, ["content", "application/json", "schema"]);
      return [status, { description: raw.description, schema: summarizeSchema(schema, schemas, 3) }];
    }),
  );
}

function summarizeSchema(value: unknown, schemas: JsonObject, depth: number): unknown {
  if (!isObject(value)) return value;
  if (typeof value.$ref === "string") {
    const name = value.$ref.split("/").pop();
    if (!name) return { $ref: value.$ref };
    return {
      $ref: name,
      ...(depth > 0 ? { resolved: summarizeSchema(schemas[name], schemas, depth - 1) } : {}),
    };
  }
  const output: JsonObject = {};
  for (const key of ["type", "format", "description", "example", "nullable", "minimum", "maximum"]) {
    if (value[key] !== undefined) output[key] = value[key];
  }
  if (isObject(value.properties)) {
    output.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, schema]) => [
        key,
        depth > 0 ? summarizeSchema(schema, schemas, depth - 1) : compactSchema(schema),
      ]),
    );
  }
  if (value.items !== undefined) {
    output.items = depth > 0 ? summarizeSchema(value.items, schemas, depth - 1) : compactSchema(value.items);
  }
  return output;
}

function compactSchema(value: unknown) {
  if (!isObject(value)) return value;
  return {
    ...(typeof value.$ref === "string" ? { $ref: value.$ref.split("/").pop() } : {}),
    ...(value.type !== undefined ? { type: value.type } : {}),
    ...(value.format !== undefined ? { format: value.format } : {}),
  };
}

function nested(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
