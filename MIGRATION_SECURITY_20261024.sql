-- Apply after all legacy migrations, before the other 20261024 migrations.
-- Re-runnable; no production seed data.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  auth_version INTEGER NOT NULL,
  device TEXT NOT NULL DEFAULT 'Browser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON public.app_sessions(user_id,expires_at);
CREATE OR REPLACE FUNCTION public.revoke_changed_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.auth_version := OLD.auth_version + 1;
    UPDATE app_sessions SET revoked_at=now() WHERE user_id=OLD.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS users_revoke_identity ON public.users;
CREATE TRIGGER users_revoke_identity BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.revoke_changed_identity();

-- Browser writes go through authenticated application handlers. Financial payloads
-- are not exposed through PostgREST, including historic provider signatures.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['wallets','wallet_transactions','wallet_topups','withdrawal_requests','order_feedback','payments','push_subscriptions','app_sessions','stores','categories','menu_items','tables','store_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
  END LOOP;
END; $$;
DROP POLICY IF EXISTS "Customer can create orders" ON public.orders;
REVOKE ALL ON public.orders,public.order_items FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.orders,public.order_items TO service_role;
UPDATE public.payments SET snap_data=snap_data-'signature_key' WHERE snap_data ? 'signature_key';

-- Avoid recursive policies and column escalation through self-profile mutation.
DROP POLICY IF EXISTS users_select_staff ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
DROP POLICY IF EXISTS users_insert_self ON public.users;
REVOKE ALL ON public.users FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,email,name,role,store_id,is_active,avatar_url,created_at,updated_at) ON public.users TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.users TO service_role;
-- users_select_own is intentionally retained; all management uses server APIs.

CREATE TABLE IF NOT EXISTS public.request_buckets (
  key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.request_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_buckets FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.consume_request_budget(p_key TEXT,p_limit INTEGER,p_seconds INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INTEGER; BEGIN
  IF p_limit<1 OR p_seconds<1 OR length(p_key)>200 THEN RAISE EXCEPTION 'Invalid budget'; END IF;
  INSERT INTO request_buckets(key,hits,reset_at) VALUES(p_key,1,now()+make_interval(secs=>p_seconds))
  ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN request_buckets.reset_at<=now() THEN 1 ELSE request_buckets.hits+1 END,
    reset_at=CASE WHEN request_buckets.reset_at<=now() THEN now()+make_interval(secs=>p_seconds) ELSE request_buckets.reset_at END
  RETURNING hits INTO n;
  DELETE FROM request_buckets WHERE reset_at<now()-interval '1 day';
  RETURN n<=p_limit;
END; $$;
REVOKE ALL ON FUNCTION public.consume_request_budget(TEXT,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_request_budget(TEXT,INTEGER,INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_changed_identity() FROM PUBLIC,anon,authenticated;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint TEXT,p_key TEXT,p_auth TEXT,p_user UUID,p_guest TEXT,p_store UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s RECORD; n INTEGER; BEGIN
  DELETE FROM push_subscriptions WHERE endpoint=p_endpoint AND verified_at IS NULL;
  IF p_user IS NULL AND p_guest IS NULL THEN RAISE EXCEPTION 'Session required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(p_user::text,p_guest),0));
  SELECT * INTO s FROM push_subscriptions WHERE endpoint=p_endpoint FOR UPDATE;
  IF FOUND AND NOT (COALESCE(s.user_id=p_user,false) OR (s.user_id IS NULL AND s.anonymous_session_id=p_guest)) THEN RAISE EXCEPTION 'Subscription belongs to another session'; END IF;
  SELECT count(*) INTO n FROM push_subscriptions WHERE (p_user IS NOT NULL AND user_id=p_user) OR (p_user IS NULL AND anonymous_session_id=p_guest);
  IF n>=10 AND s.id IS NULL THEN RAISE EXCEPTION 'Subscription limit'; END IF;
  INSERT INTO push_subscriptions(endpoint,p256dh,auth,user_id,anonymous_session_id,store_id,verified_at)
  VALUES(p_endpoint,p_key,p_auth,p_user,CASE WHEN p_user IS NULL THEN p_guest ELSE NULL END,p_store,now())
  ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,user_id=excluded.user_id,anonymous_session_id=excluded.anonymous_session_id,store_id=excluded.store_id,verified_at=now(),updated_at=now()
  WHERE push_subscriptions.user_id=p_user OR (push_subscriptions.user_id IS NULL AND push_subscriptions.anonymous_session_id=p_guest);
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription ownership changed'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.save_push_subscription(TEXT,TEXT,TEXT,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT,TEXT,TEXT,UUID,TEXT,UUID) TO service_role;
COMMIT;
