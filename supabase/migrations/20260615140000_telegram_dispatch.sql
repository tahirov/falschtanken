-- Telegram dispatch: operator chats that receive new orders.
-- A chat registers itself by sending /start to the bot (handled by the
-- telegram-webhook edge function). Only edge functions (service role) touch
-- this table, so RLS is enabled with no anon/public policies.
create table if not exists public.telegram_subscribers (
  chat_id text primary key,
  title text,
  registered_at timestamptz not null default now()
);

alter table public.telegram_subscribers enable row level security;
