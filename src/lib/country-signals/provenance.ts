import { createHash } from "node:crypto";

export function stableObservationId(parts: Array<string | number | undefined>): string {
  const material = parts.filter((part) => part !== undefined).join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export function redactUrlSecrets(url: URL, secretParams: string[]): string {
  const safe = new URL(url);
  for (const param of secretParams) {
    if (safe.searchParams.has(param)) {
      safe.searchParams.set(param, "REDACTED");
    }
  }
  return safe.toString();
}
