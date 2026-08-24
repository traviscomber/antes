import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QLIK_HOST = "qap-prd.coordinador.cl";
const CONTRACTS = [
  {
    name: "cmg-online",
    appId: "717f054b-b9a4-4749-85fa-57cbbb194770",
    objectId: "pmztXXW",
  },
  {
    name: "net-demand",
    appId: "7e08b9fd-5b83-4d9f-bc35-6e36ccedc8c3",
    objectId: "pgDTqP",
  },
  {
    name: "generation-tech",
    appId: "c280c4ac-d573-431e-985c-ee68a5233db6",
    objectId: "zFeMm",
  },
] as const;

type JsonObject = Record<string, unknown>;

export async function GET() {
  const results = [];
  for (const contract of CONTRACTS) {
    results.push(await inspectContract(contract));
  }
  return NextResponse.json({ generatedAt: new Date().toISOString(), results });
}

async function inspectContract(contract: (typeof CONTRACTS)[number]) {
  const url = `wss://${QLIK_HOST}/ext/app/${contract.appId}`;
  try {
    const client = await QlikRpcClient.connect(url);
    try {
      const doc = await client.call(-1, "OpenDoc", [contract.appId, "", "", "", false]);
      const docHandle = readHandle(doc);
      if (docHandle === undefined) throw new Error("OpenDoc did not return a document handle.");

      const object = await client.call(docHandle, "GetObject", [contract.objectId]);
      const objectHandle = readHandle(object);
      if (objectHandle === undefined) throw new Error("GetObject did not return an object handle.");

      const layout = await client.call(objectHandle, "GetLayout", []);
      const hyperCube = nested(layout, ["result", "qLayout", "qHyperCube"]);
      const cube = isObject(hyperCube) ? hyperCube : undefined;
      const size = isObject(cube?.qSize) ? cube.qSize : undefined;
      const pages = Array.isArray(cube?.qDataPages) ? cube.qDataPages : [];
      const firstPage = pages.find(isObject);
      const matrix = Array.isArray(firstPage?.qMatrix) ? firstPage.qMatrix : [];

      return {
        ...contract,
        url,
        connected: true,
        docHandle,
        objectHandle,
        layoutTitle: nestedText(layout, ["result", "qLayout", "title"]) ?? nestedText(layout, ["result", "qLayout", "qMeta", "title"]),
        cubeSize: size,
        dimensions: summarizeInfo(cube?.qDimensionInfo),
        measures: summarizeInfo(cube?.qMeasureInfo),
        firstRows: matrix.slice(0, 12).map((row) =>
          Array.isArray(row)
            ? row.map((cell) =>
                isObject(cell)
                  ? { qText: cell.qText, qNum: cell.qNum, qElemNumber: cell.qElemNumber }
                  : cell,
              )
            : row,
        ),
      };
    } finally {
      client.close();
    }
  } catch (error) {
    return {
      ...contract,
      url,
      connected: false,
      error: error instanceof Error ? error.message : "Qlik engine probe failed.",
    };
  }
}

class QlikRpcClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: JsonObject) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as JsonObject;
        const id = typeof message.id === "number" ? message.id : undefined;
        if (id === undefined) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (isObject(message.error)) {
          const errorMessage = typeof message.error.message === "string" ? message.error.message : JSON.stringify(message.error);
          pending.reject(new Error(errorMessage));
        } else {
          pending.resolve(message);
        }
      } catch {
        // Ignore unsolicited or non-JSON engine frames.
      }
    });
    socket.addEventListener("close", () => {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Qlik WebSocket closed before the RPC completed."));
        this.pending.delete(id);
      }
    });
  }

  static async connect(url: string): Promise<QlikRpcClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Qlik WebSocket open timed out.")), 12_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Qlik WebSocket connection failed."));
      }, { once: true });
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

  close() {
    this.socket.close();
  }
}

function readHandle(response: JsonObject): number | undefined {
  const value = nested(response, ["result", "qReturn", "qHandle"]);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizeInfo(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((item) => ({
    title: item.qFallbackTitle,
    min: item.qMin,
    max: item.qMax,
    cardinal: item.qCardinal,
  }));
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

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
