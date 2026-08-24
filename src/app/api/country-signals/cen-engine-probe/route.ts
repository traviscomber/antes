import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QLIK_HOST = "qap-prd.coordinador.cl";
const QLIK_ORIGIN = `https://${QLIK_HOST}`;
const CONTRACTS = [
  { name: "cmg-online", appId: "717f054b-b9a4-4749-85fa-57cbbb194770", objectId: "pmztXXW" },
  { name: "net-demand", appId: "7e08b9fd-5b83-4d9f-bc35-6e36ccedc8c3", objectId: "pgDTqP" },
  { name: "generation-tech", appId: "c280c4ac-d573-431e-985c-ee68a5233db6", objectId: "zFeMm" },
] as const;

type JsonObject = Record<string, unknown>;

export async function GET() {
  const session = await bootstrapQlikSession();
  const results = [];
  for (const contract of CONTRACTS) results.push(await inspectContract(contract, session.cookie));
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    session: { status: session.status, cookieNames: session.cookieNames },
    results,
  });
}

async function inspectContract(contract: (typeof CONTRACTS)[number], cookie: string) {
  const identity = randomUUID();
  const url = `wss://${QLIK_HOST}/ext/app/${contract.appId}/identity/${identity}`;
  try {
    const client = await QlikRpcClient.connect(url, cookie);
    try {
      const doc = await client.call(-1, "OpenDoc", [contract.appId, "", "", "", false]);
      const docHandle = readHandle(doc);
      if (docHandle === undefined) throw new Error("OpenDoc did not return a document handle.");
      const object = await client.call(docHandle, "GetObject", [contract.objectId]);
      const objectHandle = readHandle(object);
      if (objectHandle === undefined) throw new Error("GetObject did not return an object handle.");
      const layout = await client.call(objectHandle, "GetLayout", []);
      const cube = asObject(nested(layout, ["result", "qLayout", "qHyperCube"]));
      const pages = Array.isArray(cube?.qDataPages) ? cube.qDataPages : [];
      const firstPage = pages.find(isObject);
      const matrix = Array.isArray(firstPage?.qMatrix) ? firstPage.qMatrix : [];
      return {
        ...contract,
        connected: true,
        layoutTitle: nestedText(layout, ["result", "qLayout", "title"]),
        cubeSize: cube?.qSize,
        dimensions: summarizeInfo(cube?.qDimensionInfo),
        measures: summarizeInfo(cube?.qMeasureInfo),
        firstRows: summarizeMatrix(matrix, 20),
      };
    } finally {
      client.close();
    }
  } catch (error) {
    return { ...contract, connected: false, error: error instanceof Error ? error.message : "Qlik engine probe failed." };
  }
}

async function bootstrapQlikSession() {
  const response = await fetch(`${QLIK_ORIGIN}/ext/resources/assets/external/requirejs/require.js`, {
    headers: { Accept: "application/javascript", Referer: `${QLIK_ORIGIN}/` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Qlik session bootstrap HTTP ${response.status}.`);
  const raw = response.headers.get("set-cookie") ?? "";
  const cookies = raw
    .split(/,(?=\s*[^;,=]+=[^;,]+)/)
    .map((part) => part.trim().split(";")[0])
    .filter((value): value is string => Boolean(value));
  return {
    status: response.status,
    cookie: cookies.join("; "),
    cookieNames: cookies.map((cookie) => cookie.split("=")[0]),
  };
}

class QlikRpcClient {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: JsonObject) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(String(data)) as JsonObject;
        const id = typeof message.id === "number" ? message.id : undefined;
        if (id === undefined) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (isObject(message.error)) {
          pending.reject(new Error(typeof message.error.message === "string" ? message.error.message : JSON.stringify(message.error)));
        } else pending.resolve(message);
      } catch {
        // Ignore unsolicited frames.
      }
    });
    socket.on("close", () => {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Qlik WebSocket closed before the RPC completed."));
        this.pending.delete(id);
      }
    });
  }

  static async connect(url: string, cookie: string): Promise<QlikRpcClient> {
    const socket = new WebSocket(url, {
      origin: QLIK_ORIGIN,
      headers: cookie ? { Cookie: cookie, Referer: `${QLIK_ORIGIN}/` } : undefined,
      handshakeTimeout: 12_000,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("unexpected-response", (_request, response) => reject(new Error(`Qlik WebSocket handshake HTTP ${response.statusCode}.`)));
      socket.once("error", (error) => reject(error instanceof Error ? error : new Error("Qlik WebSocket connection failed.")));
    });
    return new QlikRpcClient(socket);
  }

  call(handle: number, method: string, params: unknown[]): Promise<JsonObject> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Qlik RPC ${method} timed out.`));
      }, 12_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params }));
    });
  }

  close() { this.socket.close(); }
}

function readHandle(response: JsonObject): number | undefined {
  const value = nested(response, ["result", "qReturn", "qHandle"]);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizeInfo(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((item) => ({ title: item.qFallbackTitle, min: item.qMin, max: item.qMax, cardinal: item.qCardinal }));
}

function summarizeMatrix(matrix: unknown[], limit: number) {
  return matrix.slice(0, limit).map((row) => Array.isArray(row) ? row.map((cell) => isObject(cell) ? { qText: cell.qText, qNum: cell.qNum, qElemNumber: cell.qElemNumber } : cell) : row);
}

function nested(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (!isObject(current)) return undefined;
      current = current[key];
    }
  }
  return current;
}

function nestedText(value: unknown, path: Array<string | number>): string | undefined {
  const result = nested(value, path);
  return typeof result === "string" && result.trim() ? result.trim() : undefined;
}

function asObject(value: unknown): JsonObject | undefined { return isObject(value) ? value : undefined; }
function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
