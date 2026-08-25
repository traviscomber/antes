-- Bound public login-attempt writes by opaque client identity and age.

alter table auth_login_attempts
  add column if not exists client_key text;

create index if not exists auth_login_attempts_client_time_idx
  on auth_login_attempts (client_key, attempted_at desc)
  where client_key is not null;

create index if not exists auth_login_attempts_time_idx
  on auth_login_attempts (attempted_at desc);

comment on column auth_login_attempts.client_key is
  'SHA-256 pseudonymous network client key used for abuse throttling; raw addresses are not persisted.';
