import { stableObservationId } from "@/lib/country-signals/provenance";
import type { SqlExecutor } from "@/lib/country-signals/neon-store";
import type {
  ObservationMatch,
  OperationalGraph,
} from "@/lib/operational-graph/types";
import type { EventCandidate } from "./types";

export class NeonExposureStore {
  constructor(private readonly db: SqlExecutor) {}

  async upsertOperationalGraph(input: {
    graph: OperationalGraph;
    organizationName: string;
    organizationSlug: string;
  }): Promise<void> {
    const { graph } = input;
    await this.db.query(
      `insert into organizations (id, name, slug)
       values ($1,$2,$3)
       on conflict (id) do update set
         name=excluded.name,
         slug=excluded.slug,
         updated_at=now()`,
      [graph.organizationId, input.organizationName, input.organizationSlug],
    );

    for (const node of graph.nodes) {
      await this.db.query(
        `insert into operational_nodes (
          id, organization_id, node_type, external_key, name,
          region, commune, latitude, longitude, canonical_attributes
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
        on conflict (id) do update set
          node_type=excluded.node_type,
          external_key=excluded.external_key,
          name=excluded.name,
          region=excluded.region,
          commune=excluded.commune,
          latitude=excluded.latitude,
          longitude=excluded.longitude,
          canonical_attributes=excluded.canonical_attributes,
          updated_at=now()`,
        [
          node.id,
          graph.organizationId,
          node.nodeType,
          node.externalKey ?? null,
          node.name,
          node.geography?.region ?? null,
          node.geography?.commune ?? null,
          node.geography?.latitude ?? null,
          node.geography?.longitude ?? null,
          JSON.stringify(node.attributes),
        ],
      );

      for (const binding of node.signalBindings ?? []) {
        const id = stableObservationId([
          "signal-binding",
          graph.organizationId,
          node.id,
          binding.sourceId,
          binding.signalType,
        ]);
        await this.db.query(
          `insert into operational_signal_bindings (
            id, organization_id, node_id, source_id, signal_type, reason
          ) values ($1,$2,$3,$4,$5,$6)
          on conflict (organization_id,node_id,source_id,signal_type) do update set
            reason=excluded.reason`,
          [id, graph.organizationId, node.id, binding.sourceId, binding.signalType, binding.reason],
        );
      }
    }

    for (const edge of graph.edges) {
      await this.db.query(
        `insert into operational_edges (
          id, organization_id, from_node_id, to_node_id, edge_type,
          propagates_risk, canonical_attributes
        ) values ($1,$2,$3,$4,$5,$6,$7::jsonb)
        on conflict (id) do update set
          edge_type=excluded.edge_type,
          propagates_risk=excluded.propagates_risk,
          canonical_attributes=excluded.canonical_attributes`,
        [
          edge.id,
          graph.organizationId,
          edge.fromNodeId,
          edge.toNodeId,
          edge.edgeType,
          edge.propagatesRisk,
          JSON.stringify(edge.attributes),
        ],
      );
    }
  }

  async recordEvaluation(input: {
    organizationId: string;
    observationId: string;
    evaluatorVersion: string;
    matchCount: number;
  }): Promise<void> {
    const outcome = input.matchCount > 0 ? "matched" : "no_match";
    const id = stableObservationId([
      "observation-evaluation",
      input.organizationId,
      input.observationId,
      input.evaluatorVersion,
    ]);

    await this.db.query(
      `insert into observation_evaluations (
         id, organization_id, observation_id, evaluator_version,
         outcome, match_count, evaluated_at
       ) values ($1,$2,$3,$4,$5,$6,now())
       on conflict (organization_id,observation_id,evaluator_version) do update set
         outcome=excluded.outcome,
         match_count=excluded.match_count,
         evaluated_at=now()`,
      [
        id,
        input.organizationId,
        input.observationId,
        input.evaluatorVersion,
        outcome,
        input.matchCount,
      ],
    );
  }

  async upsertMatches(matches: ObservationMatch[]): Promise<void> {
    for (const match of matches) {
      const id = stableObservationId([
        "observation-match",
        match.organizationId,
        match.observationId,
        match.nodeId,
        match.matchType,
        match.ruleId,
      ]);
      await this.db.query(
        `insert into observation_matches (
          id, organization_id, observation_id, node_id, match_type,
          rule_id, path_node_ids, evidence
        ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        on conflict (organization_id,observation_id,node_id,match_type,rule_id) do update set
          path_node_ids=excluded.path_node_ids,
          evidence=excluded.evidence`,
        [
          id,
          match.organizationId,
          match.observationId,
          match.nodeId,
          match.matchType,
          match.ruleId,
          match.pathNodeIds,
          JSON.stringify(match.evidence),
        ],
      );
    }
  }

  async upsertCandidate(candidate: EventCandidate): Promise<void> {
    await this.db.query(
      `insert into event_candidates (
        id, organization_id, event_type, state, generator_version,
        source_observation_id, source_id, signal_type, observed_at,
        valid_from, valid_until, direct_node_ids, affected_node_ids,
        propagation_paths, evidence_refs, rationale
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
      on conflict (id) do update set
        valid_from=excluded.valid_from,
        valid_until=excluded.valid_until,
        direct_node_ids=excluded.direct_node_ids,
        affected_node_ids=excluded.affected_node_ids,
        propagation_paths=excluded.propagation_paths,
        evidence_refs=excluded.evidence_refs,
        rationale=excluded.rationale,
        updated_at=now()`,
      [
        candidate.id,
        candidate.organizationId,
        candidate.type,
        candidate.state,
        candidate.generatorVersion,
        candidate.sourceObservationId,
        candidate.sourceId,
        candidate.signalType,
        candidate.observedAt,
        candidate.validFrom ?? null,
        candidate.validUntil ?? null,
        candidate.directNodeIds,
        candidate.affectedNodeIds,
        JSON.stringify(candidate.propagationPaths),
        candidate.evidenceRefs,
        candidate.rationale,
      ],
    );
  }
}
