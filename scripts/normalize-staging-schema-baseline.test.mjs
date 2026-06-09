import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeBaseline } from './normalize-staging-schema-baseline.mjs'

test('normalizeBaseline removes public schema creation and storage managed sections', () => {
  const { normalizedSql, summary } = normalizeBaseline(`--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (id text NOT NULL);


--
-- Name: app_table; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_table (id uuid NOT NULL);
`)

  assert.match(normalizedSql, /CREATE TABLE public\.app_table/)
  assert.doesNotMatch(normalizedSql, /CREATE SCHEMA public;/)
  assert.doesNotMatch(normalizedSql, /CREATE SCHEMA storage;/)
  assert.doesNotMatch(normalizedSql, /CREATE TABLE storage\.buckets/)
  assert.equal(summary.removedPublicSchemaSections, 1)
  assert.equal(summary.removedStorageSections, 2)
})

test('normalizeBaseline isolates top-level ACL statements from normalized SQL', () => {
  const { normalizedSql, platformAclSql, summary } = normalizeBaseline(`--
  -- Name: TABLE app_table; Type: ACL; Schema: public; Owner: -
  --

REVOKE ALL ON FUNCTION public.do_work() FROM PUBLIC;
GRANT SELECT ON TABLE public.app_table TO authenticated;
GRANT SELECT ON TABLE public.app_table TO app_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
`)

  assert.doesNotMatch(normalizedSql, /REVOKE ALL/)
  assert.doesNotMatch(normalizedSql, /TO authenticated;/)
  assert.doesNotMatch(normalizedSql, /TO app_reader;/)
  assert.doesNotMatch(normalizedSql, /ALTER DEFAULT PRIVILEGES/)
  assert.match(platformAclSql, /REVOKE ALL ON FUNCTION public\.do_work\(\) FROM PUBLIC;/)
  assert.match(platformAclSql, /TO authenticated;/)
  assert.match(platformAclSql, /TO app_reader;/)
  assert.match(platformAclSql, /ALTER DEFAULT PRIVILEGES/)
  assert.equal(summary.isolatedPlatformAclSections, 1)
})

test('normalizeBaseline strips pg_dump psql metacommands outside function bodies', () => {
  const { normalizedSql, summary } = normalizeBaseline(`\\restrict abc123
--
-- Name: app_table; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_table (id uuid NOT NULL);

\\unrestrict abc123
`)

  assert.match(normalizedSql, /CREATE TABLE public\.app_table/)
  assert.doesNotMatch(normalizedSql, /\\restrict/)
  assert.doesNotMatch(normalizedSql, /\\unrestrict/)
  assert.equal(summary.removedPsqlMetaCommands, 2)
})

test('normalizeBaseline strips unsupported pg_dump transaction_timeout setting', () => {
  const { normalizedSql } = normalizeBaseline(`SET statement_timeout = 0;
SET transaction_timeout = 0;
--
-- Name: app_table; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_table (id uuid NOT NULL);
`)

  assert.match(normalizedSql, /SET statement_timeout = 0;/)
  assert.match(normalizedSql, /CREATE TABLE public\.app_table/)
  assert.doesNotMatch(normalizedSql, /SET transaction_timeout = 0;/)
})

test('normalizeBaseline preserves INSERT statements inside function bodies', () => {
  const { normalizedSql } = normalizeBaseline(`--
-- Name: create_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_event() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.audit_log(action) VALUES ('created');
END;
$$;
`)

  assert.match(normalizedSql, /INSERT INTO public\.audit_log/)
})
