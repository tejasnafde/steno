-- Transactional data owned by the chat app.
create table users (
  id          text primary key,                  -- Firebase Auth uid
  email       text not null,
  name        text,
  picture     text,
  created_at  timestamptz not null default now()
);

create table admin_allowlist (
  email       text primary key,                  -- who may open /admin; seeded from ADMIN_EMAILS, edited in the UI
  added_by    text,
  created_at  timestamptz not null default now()
);

create table conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,                    -- Firebase uid, or the anonymous uid cookie before sign-in
  title        text,
  archived_at  timestamptz,
  share_token  text unique,                      -- set when the owner shares a read-only link
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index conversations_user_idx on conversations (user_id, updated_at desc);

create table messages (
  id               bigserial primary key,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  model            text,                          -- which model produced an assistant turn
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, id);

create table quota_hits (
  id          bigserial primary key,
  user_id     text not null,
  kind        text not null,                     -- burst, messages, tokens
  created_at  timestamptz not null default now()
);

-- Observability data written only by the ingestion worker. One row per LLM HTTP call.
-- Typed columns for everything we query or chart; jsonb for the long tail.
create table inference_logs (
  id              bigserial primary key,
  event_id        uuid not null unique,          -- idempotency key: SDK retries never double-insert
  session_id      uuid,                          -- = conversations.id, deliberately NOT a foreign key (logs may outlive or precede the row)
  provider        text not null,
  model           text,
  status          text not null check (status in ('ok', 'error', 'cancelled')),
  http_status     int,
  latency_ms      int not null,
  ttft_ms         int,                           -- time to first byte, null for non-streaming
  input_tokens    int,
  output_tokens   int,
  started_at      timestamptz not null,
  input_preview   text,                          -- PII-redacted, truncated
  output_preview  text,
  error           text,
  metadata        jsonb not null default '{}',
  received_at     timestamptz not null default now()
);
create index inference_logs_started_idx on inference_logs (started_at desc);
create index inference_logs_session_idx on inference_logs (session_id);
create index inference_logs_provider_model_idx on inference_logs (provider, model, started_at desc);
