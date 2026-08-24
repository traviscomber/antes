-- ANTEMANO Personal Alert Grouping v2
-- Stable user-facing alert identities are category/group based rather than one
-- notification per raw observation.

alter table personal_alerts
  add column if not exists alert_key text;

update personal_alerts
   set alert_key = id
 where alert_key is null;

alter table personal_alerts
  alter column alert_key set not null;

alter table personal_alerts
  drop constraint if exists personal_alerts_user_id_observation_id_rule_version_key;

create unique index if not exists personal_alerts_user_key_rule_unique
  on personal_alerts (user_id, alert_key, rule_version);

create index if not exists personal_alerts_user_key_idx
  on personal_alerts (user_id, alert_key, state, updated_at desc);

comment on column personal_alerts.alert_key is
  'Stable deterministic category/incident key used to consolidate multiple canonical observations into one actionable user alert.';
