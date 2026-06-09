# Common Multi-Tenant Failures & Safe Patterns

## Tenant Identifier Discovery

Search the codebase for project-specific names. Common variants:

| Concept | Common field names |
|---------|-------------------|
| Tenant | `tenantId`, `tenant_id`, `organizationId`, `orgId` |
| Workspace | `workspaceId`, `workspace_id`, `teamId` |
| Vertical SaaS | `academyId`, `storeId`, `shopId`, `companyId` |
| Billing | `storeId`, `customerId` (Stripe), `subscription.tenantId` |

**Rule**: Once identified, use the project's canonical name in the report. Note aliases (`academy_id` vs `academyId`) as LOW if both work but confuse maintainers.

---

## Attack Scenarios to Trace

### 1. IDOR / BOLA (Broken Object Level Authorization)
**Attack**: User in tenant A sends `GET /api/students/xyz` where `xyz` belongs to tenant B.

**Unsafe**:
```javascript
const doc = await databases.getDocument(DB, COL, req.query.id);
```

**Safe**:
```javascript
const access = await resolveAcademyAccess(academyId, me);
if (!access) return res.status(403).json({ error: 'forbidden' });
const doc = await databases.getDocument(DB, COL, id);
if (doc.academy_id !== access.academyId) return res.status(404).json({ error: 'not found' });
```

### 2. Client-Trusted Tenant ID
**Attack**: POST body `{ academyId: "victim-tenant", ... }` while authenticated as attacker.

**Unsafe**: `const tenant = req.body.academyId`

**Safe**: `const tenant = await resolveTenantFromSession(req)` then `assertMembership(me, tenant)`

### 3. Cache Poisoning Across Tenants
**Attack**: User switches account; UI shows cached list from previous tenant.

**Unsafe**: `queryKey: ['students']`

**Safe**: `queryKey: ['students', academyId]` + `queryClient.removeQueries()` on switch

### 4. Webhook Tenant Spoofing
**Attack**: Attacker sends webhook with `?academyId=victim` to ingest data into wrong tenant.

**Safe**: Resolve tenant from signed instance ID; verify `instanceId` belongs to `academyId` before processing.

### 5. Stale Global Singleton
**Attack**: Module-level `let currentAcademy` set once, never updated on switch.

**Safe**: Read tenant from request context per call, or subscribe store and invalidate.

### 6. Cron Cross-Tenant Mutation
**Attack**: Cron deletes "overdue" records globally, affecting all tenants without billing gate.

**Safe**: `for (const academy of await listActiveAcademies()) { await processOverdue(academy.id) }`

### 7. localStorage Collision
**Attack**: Two tenants on same browser profile share `localStorage['accounting']`.

**Safe**: `localStorage[\`accounting:${academyId}\`]` or clear on switch

---

## Safe Pattern Catalog

### Server: Resolve → Assert → Scope
```
1. authenticate(req)
2. tenantId = resolveFromSessionOrParam(req)
3. membership = assertMembership(user, tenantId)
4. query = query.where('tenant_id', tenantId)
5. return scopedResult
```

### Frontend: Switch Protocol
```
1. User selects new tenant
2. Cancel in-flight requests
3. Clear or re-key client caches
4. Reset tenant-scoped stores (or call loadByAcademy)
5. Update URL / persist selection
6. Fetch fresh data
7. Show confirmation UI
```

### Database: Composite Uniqueness
```sql
-- Bad: email unique globally (blocks same email in two tenants)
UNIQUE(email)

-- Good: email unique per tenant
UNIQUE(tenant_id, email)
```

### Cache: Namespace Template
```
{tenantId}:{resourceType}:{resourceId}
{tenantId}:access:{userId}
```

---

## UX Clarity Checklist (Portuguese products)

When the product UI is in Portuguese, verify copy:

| Situation | Bad copy | Good copy |
|-----------|----------|-----------|
| No membership | "Erro 403" | "Você não tem acesso a esta academia" |
| Wrong tenant resource | "Não encontrado" (ambiguous) | "Este registro não existe nesta conta" |
| After switch | (silent) | "Conta alterada para {nome}" |
| Multi-account user | Hidden switcher | "Trocar academia" visible in nav |

---

## False Positive Filters

Do **not** flag these without evidence of cross-tenant risk:

- Tenant ID in URL when server always re-validates membership on load
- Admin panel intentionally cross-tenant with `superadmin` role check
- Public marketing pages with no tenant-scoped data
- Shared reference data (country list, belt ranks) without PII
- Server-side cache keyed by `(tenantId, resourceId)` with correct invalidation

---

## Project-Specific Hooks (this repo)

When reviewing **JIU JITSU / Navi**, prioritize these integration points:

| Module | Tenant concern |
|--------|----------------|
| `lib/server/academyAccess.js` | `resolveAcademyAccess`, cache invalidation |
| `src/lib/academyContext.js` | `syncAcademyContext`, `getAcademyContext` |
| `src/lib/initStores.js` | Store reset on `academyId` change |
| `lib/server/zapsterWebhook.js` | Webhook `academyId` + instance binding |
| `lib/server/agentProcess.js` | Inbound agent scoped to academy |
| `lib/billing/gate.js` | Billing per `storeId` / academy |
| `useAccountingStore` | `loadByAcademy`, tenant-scoped localStorage |

If these exist in the project, verify new code uses them instead of inventing parallel tenant resolution.
