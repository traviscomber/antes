create table if not exists observation_evaluations (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  observation_id text not null references external_observations(id) on delete cascade,
  evaluator_version text not null,
  outcome text not null check (outcome in ('matched', 'no_match')),
  match_count integer not null default 0 check (match_count >= 0),
  evaluated_at timestamptz not null default now(),
  unique (organization_id, observation_id, evaluator_version),
  check (
    (outcome = 'matched' and match_count > 0)
    or (outcome = 'no_match' and match_count = 0)
  )
);

create index if not exists observation_evaluations_org_version_time_idx
  on observation_evaluations (organization_id, evaluator_version, evaluated_at desc);

create index if not exists observation_evaluations_observation_idx
  on observation_evaluations (observation_id);

comment on table observation_evaluations is
  'Deterministic ledger recording both positive and negative operational-graph evaluations so observations are not reprocessed indefinitely.';
