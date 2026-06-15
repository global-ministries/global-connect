CREATE TABLE IF NOT EXISTS public.support_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  available_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS support_event_outbox_pending_idx
  ON public.support_event_outbox (available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS support_event_outbox_ticket_idx
  ON public.support_event_outbox (ticket_id, created_at DESC);

ALTER TABLE public.support_event_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.support_event_outbox FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.support_event_outbox FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.support_event_outbox FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_event_outbox TO service_role;
