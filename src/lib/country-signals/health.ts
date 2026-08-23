import { DmcWrfConnector } from "./connectors/dmc";
import { LeyChileConnector } from "./connectors/leychile";
import { chileSignalSources } from "./registry";
import type { SourceHealth } from "./types";

export async function getChileSignalHealth(): Promise<SourceHealth[]> {
  const dmc = new DmcWrfConnector();
  const leychile = new LeyChileConnector();

  const activeChecks = new Map<string, Promise<SourceHealth>>([
    [dmc.source.id, dmc.healthCheck()],
    [leychile.source.id, leychile.healthCheck()],
  ]);

  return Promise.all(
    chileSignalSources.map(async (source) => {
      const check = activeChecks.get(source.id);
      if (check) return check;

      return {
        sourceId: source.id,
        state: "unconfigured" as const,
        checkedAt: new Date().toISOString(),
        message: "Connector is defined in the Chile Signal Pack roadmap but not enabled yet.",
      };
    }),
  );
}
