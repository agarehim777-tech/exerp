// @vitest-environment node
import { expect, it } from 'vitest';
import { extractApplicationSchema } from '../../scripts/extract-application-schema.mjs';

const entry = (name, type, schema, sql) => `--\n-- Name: ${name}; Type: ${type}; Schema: ${schema}; Owner: -\n--\n${sql}\n`;
it('extracts application DDL without replacing managed Auth or the surviving archive', () => {
  const dump = entry('users', 'TABLE', 'auth', 'CREATE TABLE auth.users(id uuid);') +
    entry('tenants', 'TABLE', 'public', 'CREATE TABLE public.tenants(id uuid);') +
    entry('legacy_snapshot_archive', 'TABLE', 'private', 'CREATE TABLE private.legacy_snapshot_archive(id uuid);') +
    entry('member(uuid)', 'FUNCTION', 'private', 'CREATE FUNCTION private.member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;');
  const result = extractApplicationSchema(dump);
  expect(result.sql).toContain('CREATE TABLE public.tenants');
  expect(result.sql).toContain('CREATE OR REPLACE FUNCTION private.member');
  expect(result.sql).not.toContain('CREATE TABLE auth.users');
  expect(result.sql).not.toContain('legacy_snapshot_archive');
});
it('fails closed on non-archive inputs and missing application schema', () => {
  expect(() => extractApplicationSchema('select 1')).toThrow('Unsupported');
  expect(() => extractApplicationSchema(entry('users', 'TABLE', 'auth', 'CREATE TABLE auth.users(id uuid);'))).toThrow('Missing');
});
it('rejects archives containing application data rather than copying live records to staging', () => {
  expect(() => extractApplicationSchema(entry('tenants', 'TABLE', 'public', 'CREATE TABLE public.tenants(id uuid);') +
    entry('tenants', 'TABLE DATA', 'public', 'COPY public.tenants FROM stdin;'))).toThrow('business data');
});
