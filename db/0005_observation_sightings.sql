-- ANTEMANO Observation Sightings v1
-- Public observations are immutable versions, but current-snapshot sources need a
-- separate last-seen timestamp so personal alerts can distinguish a still-present
-- record from stale historical evidence.

alter table external_observations
  add column if not exists last_seen_at timestamptz;

update external_observations
   set last_seen_at = ingested_at
 where last_seen_at is null;

alter table external_observations
  alter column last_seen_at set default now();

alter table external_observations
  alter column last_seen_at set not null;

-- source_record_id identifies the authority's logical record, not an immutable
-- observation version. A record can legitimately change state over time.
drop index if exists external_observations_source_record_unique;

create index if not exists external_observations_source_record_idx
  on external_observations (source_id, source_record_id, observed_at desc)
  where source_record_id is not null;

create index if not exists external_observations_last_seen_idx
  on external_observations (source_id, last_seen_at desc);

comment on column external_observations.last_seen_at is
  'Most recent ingestion run in which this exact immutable observation version was observed again at its authority source.';
