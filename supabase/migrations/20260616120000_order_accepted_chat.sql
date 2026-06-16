-- Remember which Telegram operator chat accepted an order, so customer
-- messages from the dispatch screen are routed to that technician (Ihsan).
alter table public.orders
  add column if not exists accepted_chat_id text;
