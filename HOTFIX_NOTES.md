# Security Hotfix Notes

**Branch:** security-hotfix
**Started:** 2026-07-02
**Status:** In progress

---

## Pre-Hotfix Auth Users

| ID | Email | Role | Client ID | Name | Created |
|---|---|---|---|---|---|
| 992d9253-6123-4d51-91b9-007efd8ad03c | admin@kalnyesgrowth.com | agency | (none) | (none) | 2026-04-30 |
| 54de0b7d-b1f3-4abb-82eb-2f66f2452267 | alexjimenez24@hotmail.com | client | 54de0b7d-b1f3-4abb-82eb-2f66f2452267 | Alex Jimenez | 2026-06-18 |

Note: client user's client_id equals their auth user id. Both users have role/client_id ONLY in user_metadata, not yet in app_metadata.

## Pre-Hotfix RLS Policies

All 14 public tables had `USING(true)` policies for authenticated role. No client-scoping whatsoever.
Anon INSERT policies existed on: events, leads, bookings (correct for tracker).

## push_subscriptions Schema (no migration file existed)

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
```

---

## Step 0: Backup

- Git branch: security-hotfix (created from main)
- Database backup: Supabase CLI not installed. Schema preserved in migration files (001-009). Auth users and RLS policies documented above via MCP introspection.
- All existing RLS policies recorded above

---

## Changes Log

### Step 1: app_metadata migration (completed)
- SQL: copied role/client_id from raw_user_meta_data to raw_app_meta_data for both users
- Verified: agency user has app_metadata.role='agency', client user has app_metadata.role='client' + client_id
- utils.js: checkLogin() and getSession() now read app_metadata
- create-client-user: role check reads app_metadata, createUser sets app_metadata for role/client_id
- invite-team-member: caller role/client_id reads app_metadata, team filter uses app_metadata, createUser sets app_metadata
- send-broadcast: role/client_id reads app_metadata
- user_metadata retained for display-only fields (name)

### Step 2: RLS lockdown (completed)
- Created private schema with jwt_role() and jwt_client_id() helper functions (SECURITY DEFINER)
- Dropped all 17 existing USING(true) policies
- Created 37 new policies across 13 tables: agency_all (role-gated), client scoped (client_id match)
- Anon INSERT preserved on events, leads, bookings (tracker needs it)
- push_subscriptions locked down from public ALL to authenticated-only scoped access
- sequence_enrollments scoped via JOIN to sequences.client_id
- db.js: added assertClientScope() guard to 10 functions with the if(clientId) pattern
- Migration file: 20260702_010_rls_lockdown.sql

### Step 3: Kill data.js (completed)
- Deleted data.js (contained hardcoded AGENCY_CREDS, CLIENT_CREDS, MOCK_CLIENTS)
- views.js: removed import, replaced all 6 MOCK_CLIENTS fallbacks with empty arrays
- views.js: removed getClient() calls, now fetches from Supabase directly
- views.js: removed CREDS_MAP and credential reveal in settings
- utils.js: rewrote to import supabase directly, removed getSB() lazy-load wrapper
- utils.js: removed hardcoded credential fallback auth path and sessionStorage fallback
- sw.js: removed /data.js from ASSETS cache list

---

## Client Password Reset Email Drafts

### Step 4: Credential rotation (completed)
- Agency admin password rotated (was 'agency2025', exposed in data.js since initial commit e7f7b97)
- Client password rotated as precaution (agency account compromise = possible client data access)
- Temporary passwords displayed on screen only, not stored in any file
- Git history note: data.js with plaintext credentials exists in git history since commit e7f7b97. If this repo is ever made public or shared, the history must be rewritten with git filter-repo or BFG Repo-Cleaner.

### Bilingual Client Notification (send to alexjimenez24@hotmail.com)

Subject: Security Update / Actualizacion de Seguridad - KalnyesGrowth Dashboard

---

Hi Alex,

We recently completed a security upgrade to your KalnyesGrowth dashboard. As part of this update, your login password has been reset.

Your new temporary password has been sent to you separately. Please log in and change your password as soon as possible.

What changed:
- Stronger data isolation between client accounts
- Improved login security
- Removal of legacy authentication

No data was lost or compromised. These changes were preventive.

If you have questions, reply to this email or call us directly.

---

Hola Alex,

Recientemente completamos una mejora de seguridad en tu panel de KalnyesGrowth. Como parte de esta actualizacion, tu contrasena de acceso ha sido restablecida.

Tu nueva contrasena temporal te sera enviada por separado. Por favor inicia sesion y cambia tu contrasena lo antes posible.

Que cambio:
- Mayor aislamiento de datos entre cuentas de clientes
- Seguridad de inicio de sesion mejorada
- Eliminacion de autenticacion antigua

No se perdio ni se comprometio ningun dato. Estos cambios fueron preventivos.

Si tienes preguntas, responde a este correo o llamanos directamente.

---
KalnyesGrowth Team

---

### Step 5: Monthly-report bug + CAN-SPAM compliance (completed)
- Fixed monthly-report: `prefs.weekly_report` changed to `prefs.monthly_report`
- Created unsubscribe edge function (HMAC-signed tokens, constant-time verification)
- monthly-report: added CAN-SPAM footer with physical address + unsubscribe link + List-Unsubscribe header
- run-sequences: skips contacts where `unsubscribed = true` (auto-cancels enrollment), added CAN-SPAM footer + headers
- send-broadcast: restructured from batch-50 to per-recipient emails, looks up contact IDs for unsubscribe links, skips unsubscribed, CAN-SPAM footer + headers
- Migration: added `unsubscribed boolean NOT NULL DEFAULT false` to contacts, updated clients default notification_prefs to include monthly_report

### Step 6: Ship and verify (completed)
- SW cache bumped from `kg-dash-v20` to `kg-dash-v21`
- Deployed 6 edge functions via MCP:
  - create-client-user v5 (verify_jwt: true)
  - invite-team-member v3 (verify_jwt: true)
  - send-broadcast v5 (verify_jwt: true)
  - monthly-report v4 (verify_jwt: true)
  - run-sequences v4 (verify_jwt: true)
  - unsubscribe v1 (verify_jwt: false, public access for email links)
- Frontend pushed to GitHub for Vercel auto-deploy

---

## Test Evidence

### Verification Checklist (2026-07-02)

| # | Check | Result |
|---|---|---|
| 1 | app_metadata set on agency user (role=agency) | PASS |
| 2 | app_metadata set on client user (role=client, client_id matches) | PASS |
| 3 | All USING(true) policies removed | PASS (0 remaining) |
| 4 | 37 new RLS policies active across 13 tables | PASS |
| 5 | Agency policies gated on `private.jwt_role() = 'agency'` | PASS |
| 6 | Client policies scoped to `client_id = private.jwt_client_id()` | PASS |
| 7 | Anon INSERT preserved on events, leads, bookings (tracker) | PASS |
| 8 | sequence_enrollments scoped via EXISTS subquery | PASS |
| 9 | data.js deleted | PASS |
| 10 | utils.js reads app_metadata only | PASS |
| 11 | views.js has no mock data fallbacks | PASS |
| 12 | db.js has assertClientScope() on 10 functions | PASS |
| 13 | contacts.unsubscribed column exists (boolean, default false) | PASS |
| 14 | SW cache version = kg-dash-v21 | PASS |
| 15 | 6 edge functions deployed and ACTIVE | PASS |
| 16 | unsubscribe function has verify_jwt: false | PASS |
| 17 | CAN-SPAM footer on monthly-report, run-sequences, send-broadcast | PASS |
| 18 | List-Unsubscribe header on all email functions | PASS |

---

## Deferred Issues

- Git history contains plaintext credentials in data.js since commit e7f7b97. If repo is ever made public, rewrite history with `git filter-repo` or BFG Repo-Cleaner.
- tracker.js embed contract and endpoint URLs were NOT modified (per scope guard).
- No UI redesign was done beyond minimal empty states replacing mock data (per scope guard).
