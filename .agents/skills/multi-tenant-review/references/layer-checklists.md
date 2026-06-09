# Layer Checklists — Multi-Tenant Review

Use these checklists during Step 3. Mark each item PASS / FAIL / N/A with evidence (file + line).

---

## 1. UI / UX Layer

### Isolation
- [ ] Lists, dashboards, and detail views fetch data for **active tenant only**
- [ ] Deep links (`/resource/:id`) re-verify tenant ownership before render
- [ ] Empty states differ from "wrong tenant" states (not generic blank screens)
- [ ] Modals/drawers close or refresh when tenant switches mid-interaction

### Security
- [ ] No sensitive tenant IDs exposed in URLs if guessable/enumerable (or mitigated server-side)
- [ ] Client-side filters are not the only access control
- [ ] `dangerouslySetInnerHTML` / HTML exports cannot embed another tenant's data via cached templates

### Clarity
- [ ] **Active tenant name/logo** visible in header, sidebar, or persistent chrome
- [ ] Page titles or breadcrumbs include tenant context where helpful
- [ ] Billing/plan status shown in tenant context (not user-global misleading state)

### Intuitiveness
- [ ] Account switcher in predictable location (profile menu, top bar)
- [ ] Switch shows confirmation when unsaved work exists
- [ ] After switch: toast/banner confirms new active account
- [ ] Multi-tenant users see **only** tenants they belong to (no ghost entries)

---

## 2. Frontend State (Stores, Context, Hooks)

### Isolation
- [ ] Global stores include `tenantId` field or are **reset** on tenant change
- [ ] `persist` middleware uses **tenant-scoped storage keys** (`accounting:${academyId}`)
- [ ] React Query / SWR cache keys include tenant ID
- [ ] In-flight requests from previous tenant cancelled or ignored on switch
- [ ] `subscribe` / `onFinishHydration` syncs tenant context across stores

### Security
- [ ] No tenant A data remains in memory after switching to tenant B
- [ ] Optimistic updates tagged with tenant ID; stale responses discarded

### Clarity
- [ ] Loading skeleton during tenant switch (not old data + spinner overlay)
- [ ] Error: "Você não tem acesso a esta conta" vs generic errors

### Intuitiveness
- [ ] Switching tenant feels instant or shows explicit progress
- [ ] Selected tenant persisted across refresh **without** showing wrong data first

---

## 3. API / Server Handlers

### Isolation
- [ ] Every handler receives tenant context from **trusted** source (session, verified JWT, webhook binding)
- [ ] `GET/POST/PUT/DELETE` all scope queries: `tenant_id = resolvedTenant`
- [ ] Batch endpoints filter each item by tenant (no `IN (...)` without tenant guard)
- [ ] Aggregations (SUM, COUNT) include tenant in GROUP BY or pre-filter

### Security
- [ ] Client-supplied `academyId` / `tenantId` in body or query is **validated against membership**
- [ ] Admin/superuser bypass is explicit and audited
- [ ] 404 vs 403 policy: prefer 404 for cross-tenant ID enumeration (document choice)
- [ ] Rate limits per tenant where abuse affects neighbors

### Clarity
- [ ] Error messages never include another tenant's resource names or counts
- [ ] API responses use consistent tenant field naming

### Intuitiveness
- [ ] Same REST shape across tenants (no special-case endpoints per tenant in client)

---

## 4. Auth & Access Control

### Isolation
- [ ] Membership resolved via team/org table, not just document ownership
- [ ] Roles (admin, member, viewer) scoped **per tenant**
- [ ] Service accounts / API keys bound to single tenant (or explicit multi-tenant key design)

### Security
- [ ] JWT does not carry forgeable tenant claim without server verification
- [ ] Session fixation cannot attach user to wrong tenant
- [ ] Invitation flows bind invitee to correct tenant only
- [ ] Logout clears tenant selection and cached tenant data

### Clarity
- [ ] User sees which role they have in current tenant
- [ ] Pending invites distinguished from active memberships

---

## 5. Database & ORM

### Isolation
- [ ] All tenant-owned tables have `tenant_id` (or equivalent) column
- [ ] Unique constraints are composite: `UNIQUE(tenant_id, slug)` not `UNIQUE(slug)`
- [ ] Foreign keys include tenant dimension where cross-tenant FK is possible
- [ ] Migrations backfill `tenant_id` with NOT NULL + index
- [ ] Soft deletes scoped: `deleted_at IS NULL AND tenant_id = ?`

### Security
- [ ] No raw SQL with only `WHERE id = ?` for tenant-owned rows
- [ ] Row-level security (RLS) or ORM global scope middleware if applicable
- [ ] Sequences/IDs not globally enumerable across tenants (or access still gated)

---

## 6. Cache (Memory, Redis, CDN, React Query)

### Isolation
- [ ] Cache keys: `tenant:{id}:resource:{key}` — never `resource:{key}` alone
- [ ] Shared CDN assets OK; **tenant data** never in public cache without tenant in key
- [ ] Cache invalidation on tenant settings change, membership revoke, tenant delete

### Security
- [ ] Stale cache cannot serve tenant A data to tenant B session
- [ ] `invalidateAcademyAccessCache` (or equivalent) called after membership mutations

---

## 7. Webhooks & Public Endpoints

### Isolation
- [ ] Webhook URL or payload binds event to tenant (`?academyId=`, instance ID mapping)
- [ ] Public enrollment/signup creates records under correct tenant only
- [ ] OAuth callbacks cannot redirect tokens to wrong tenant

### Security
- [ ] Signature/HMAC verified before tenant resolution
- [ ] Instance ID / API key verified to belong to claimed tenant
- [ ] Idempotency keys scoped per tenant

---

## 8. Background Jobs & Cron

### Isolation
- [ ] Cron iterates tenants explicitly or filters jobs by `tenant_id` in payload
- [ ] No global job that processes all rows without per-tenant chunking
- [ ] Dead letter / retry queues tagged with tenant

### Security
- [ ] Worker cannot replay job with swapped tenant ID without auth check
- [ ] Cross-tenant batch reports require superadmin flag

---

## 9. Logs, Metrics, Analytics

### Isolation
- [ ] Structured logs include `tenantId` / `academyId` field
- [ ] Error trackers (Sentry) tag events with tenant (non-PII id)
- [ ] Analytics events include tenant dimension for filtering

### Security
- [ ] Logs do not dump full cross-tenant query results
- [ ] Support tools mask other tenants' data in admin views

---

## 10. Files & Blob Storage

### Isolation
- [ ] Path pattern: `{tenantId}/uploads/{fileId}`
- [ ] List/delete operations prefix path with tenant
- [ ] Signed URL generation verifies tenant ownership of file record

### Security
- [ ] Path traversal cannot escape tenant prefix (`../other-tenant/`)
- [ ] Public URLs time-limited and tied to tenant-owned asset

---

## Cross-Layer Red Flags (Instant FAIL)

| Signal | Risk |
|--------|------|
| `getDocument(DB, COL, id)` without tenant check | IDOR |
| `localStorage.setItem('data', ...)` without tenant in key | Cross-tenant leak on switch |
| `useStore` global list not cleared on `academyId` change | Stale/wrong UI |
| Webhook trusts `tenantId` query param without instance binding | Spoofed inbound |
| `Map()` module-level cache keyed only by resource id | Cross-tenant cache hit |
| User picks tenant from dropdown without server membership list | Privilege escalation |
