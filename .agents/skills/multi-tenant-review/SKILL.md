---
name: multi-tenant-review
description: >-
  Expert multi-tenant product auditor that reviews every layer of a project for
  account/tenant context isolation, security, clarity, and UX intuitiveness.
  Use when building or reviewing SaaS, B2B apps, workspaces, organizations,
  academies, stores, or any product where users switch between accounts.
  Triggers on requests like "multi-tenant review", "tenant isolation audit",
  "revisar multi-tenant", "contexto por conta", "separação por academia/organização",
  "IDOR entre contas", "account switcher", "cross-tenant leak", or before shipping
  features that touch tenant-scoped data. Always use for PRs that add APIs, queries,
  caches, webhooks, background jobs, or UI that reads/writes tenant-owned resources.
---

# Multi-Tenant Review

Audits whether **account context** (tenant, organization, workspace, academy, store, team) is **isolated**, **secure**, **clear**, and **intuitive** across all layers.

## When to Use

- Full-project or scoped audit of tenant isolation
- Reviewing a PR that touches auth, APIs, DB queries, caches, webhooks, cron, or UI state
- Debugging "wrong account data", stale data after switch, or suspected cross-tenant access
- Designing a new tenant-scoped feature (pre-implementation review)
- Complementing `security-review` with tenant-specific BOLA/IDOR and UX context checks

## Core Principles

1. **Tenant ID is never trusted from the client alone** — always derive from session/JWT + membership, then verify resource ownership server-side.
2. **Every read and write is scoped** — queries, caches, queues, files, logs, and indexes must include tenant key.
3. **Context switches reset state** — frontend stores, caches, and in-flight requests must not leak prior tenant data.
4. **Users always know which account they're in** — visible, persistent, unambiguous active-tenant indicator.
5. **Defense in depth** — DB constraints + API guards + UI scoping; one layer failing must not expose other tenants.

## Execution Workflow

Follow these steps **in order**:

### Step 1 — Discover Tenant Model

Before scanning code, map how this project represents tenants:

1. Find the **tenant identifier** names (`academyId`, `orgId`, `workspaceId`, `storeId`, `teamId`, etc.)
2. Find **how tenant is resolved**: JWT claims, session, subdomain, path prefix, query param, webhook metadata
3. Find **membership/authorization** helpers (`resolveAcademyAccess`, `ensureAuth`, RBAC, team membership)
4. Find **tenant switch UX**: switcher component, URL sync, localStorage keys, store hydration
5. Document the model in one short paragraph before proceeding

Read `references/common-failures.md` for naming and anti-pattern catalog.

### Step 2 — Scope Resolution

- Path provided → scan only that scope
- No path → scan full project, prioritizing: `api/`, `lib/server/`, auth middleware, DB access, stores/hooks, webhooks, cron, cache layers
- Note frameworks (React, Next.js, Appwrite, Prisma, etc.) and storage (SQL, NoSQL, localStorage, Redis)

### Step 3 — Layer-by-Layer Audit

Work through every layer. Use `references/layer-checklists.md` for detailed signals.

| Layer | Isolation | Security | Clarity | Intuitiveness |
|-------|-----------|----------|---------|---------------|
| **UI / UX** | Data shown matches active tenant | No tenant ID in hidden fields user can forge | Active account visible | Switcher discoverable; post-switch feedback |
| **Frontend state** | Stores keyed/reset on switch | No cross-tenant data in global singletons | Loading/error states per tenant | No flash of wrong-tenant content |
| **API / handlers** | Every handler scopes by tenant | Membership checked before data access | Errors don't leak other tenants | Consistent tenant param naming |
| **Auth / access** | Role scoped to tenant membership | No privilege escalation across tenants | 403 vs 404 policy documented | User understands "no access" vs "not found" |
| **Database / queries** | `WHERE tenant_id = ?` on all ops | Composite keys / FK include tenant | — | — |
| **Cache** | Keys namespaced by tenant | TTL + invalidation on membership change | — | — |
| **Webhooks / public** | Tenant bound to instance/secret | Signature + tenant ownership verified | — | — |
| **Background jobs** | Job payload carries tenant ID | Job cannot process wrong tenant | — | — |
| **Logs / analytics** | Tenant ID in structured logs | No PII/cross-tenant data in shared logs | — | — |
| **Files / storage** | Paths prefixed by tenant | Signed URLs scoped to tenant | — | — |

### Step 4 — Cross-Layer Data Flow Tracing

For each sensitive resource type (users, payments, messages, settings):

1. **Entry**: Where does tenant context enter? (header, cookie, body, URL)
2. **Propagation**: Does it flow through every function, or get dropped?
3. **Persistence**: Is the DB query/filter guaranteed?
4. **Response**: Could the response include another tenant's data?
5. **Client**: Does the UI bind to the correct tenant after fetch?

Trace at least 3 critical flows end-to-end (e.g., list records, update record, webhook inbound).

### Step 5 — Self-Verification

For each finding:

1. Re-read code — is there upstream middleware that already enforces scope?
2. Is it exploitable or theoretical?
3. Assign severity and confidence (High / Medium / Low)
4. Discard false positives

### Step 6 — Generate Report

Output using `references/report-format.md`. Group findings by **dimension** (Isolation, Security, Clarity, Intuitiveness), then by layer.

### Step 7 — Propose Fixes

For CRITICAL and HIGH findings:

- Show vulnerable pattern (before) and fix (after)
- Prefer existing project helpers (`resolveAcademyAccess`, `invalidateAcademyAccessCache`, etc.)
- State: **"Review each patch before applying. Nothing has been changed yet."**

## Severity Guide

| Severity | Meaning | Example |
|----------|---------|---------|
| 🔴 CRITICAL | Cross-tenant data access or write | Query without tenant filter; IDOR on update |
| 🟠 HIGH | Missing guard with plausible exploit path | Cache key without tenant; stale store after switch |
| 🟡 MEDIUM | Inconsistent scoping; defense gap | One endpoint skips membership check others use |
| 🔵 LOW | Naming inconsistency; weak UX signal | Mixed `academyId` / `academy_id` without bug |
| ⚪ INFO | Observation or best practice | Suggest composite DB index on `(tenant_id, id)` |

## Quick Grep Patterns

Run targeted searches (adapt names to project's tenant key):

```
academyId|tenantId|orgId|workspaceId|storeId
getDocument\(|getDocument<|\.find\(|\.findOne\(
localStorage|sessionStorage|persist
cache\.|Map\(|new Map
req\.body\.|req\.query\.|params\.
resetFor|onAcademyChange|syncAcademyContext|invalidate.*Cache
```

Flag any DB/API call that filters only by `id` without tenant key.

## Relationship to Other Skills

- **`security-review`**: Run for general vulns (SQLi, XSS, secrets). This skill adds tenant isolation, BOLA/IDOR in business context, and UX clarity.
- **`verification-before-completion`**: After fixes, re-run grep traces and tests for tenant scoping.

## Reference Files

- [layer-checklists.md](references/layer-checklists.md) — Per-layer detection signals and pass/fail criteria
- [common-failures.md](references/common-failures.md) — Anti-patterns, attack scenarios, safe patterns
- [report-format.md](references/report-format.md) — Structured output template
