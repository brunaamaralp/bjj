# Backlog auditoria — Inbox API (latência)

> **Origem:** [PERFORMANCE_ERRORS_DIAGNOSTIC.md](../../PERFORMANCE_ERRORS_DIAGNOSTIC.md) · Fase 5 · 2026-06-14  
> **Prioridade:** P1 degradante (list p95 encostando em 800 ms)

**Goal:** TTFB p95 `GET /api/conversations` **< 800 ms** com auth real; eliminar waterfall list → enrich.

**Baseline Appwrite (126 conversas, 2026-06-14):**

| Etapa | ms |
|-------|-----|
| List 50 docs | **726–752** |
| Stats 4× parallel | **384–398** |
| Enrich leads | **não medido** (roda após list) |
| **Handler completo** | **pendente** (`AUDIT_JWT`) |

**Região:** Vercel `iad1` + Appwrite `sfo` → ~60–90 ms RTT extra por hop.

---

### Task 0: Bench HTTP autenticado (pré-requisito)

**Env:** adicionar ao `.env` local (não commitar JWT):

```
AUDIT_API_BASE=https://www.navefit.com
AUDIT_JWT=<session JWT>
AUDIT_ACADEMY_ID=699f21b70006985daa90
```

```bash
node --env-file=.env scripts/audit-api-phase3.mjs \
  --base-url=https://www.navefit.com \
  --academy-id=699f21b70006985daa90
```

- [ ] Registrar p50/p95 de list, list+stats, list+stats+enrich no diagnostic.

---

### Task 1: Paralelizar enrich com list (quando seguro)

**Files:**
- Modify: `api/conversations.js` — `enrichConversationListDocs`
- Test: `src/test/inboxApiUtils.test.js` ou novo teste de handler

- [ ] **Step 1:** Mapear dependências: enrich precisa dos IDs da list ou pode prefetch parcial?
- [ ] **Step 2:** Se enrich só depende de `lead_id` nos docs retornados, iniciar enrich em `Promise.all` com stats (não após list completa se IDs conhecidos incrementalmente).
- [ ] **Step 3:** Manter cache `INBOX_LIST_STATS_CACHE_MS` (60 s).
- [ ] **Step 4:** Re-bench com `AUDIT_JWT`; meta p95 < 800 ms.

**PR sugerido:** `perf/inbox-enrich-parallel`

---

### Task 2: Busca textual — evitar 2ª query wide

**Files:** `api/conversations.js` (branch de search)

- [ ] **Step 1:** Documentar fluxo atual (120 docs + enrich).
- [ ] **Step 2:** Limitar campos projetados ou índice Appwrite se disponível.
- [ ] **Step 3:** Timeout/guard para academias com > N conversas.

**PR sugerido:** `perf/inbox-search-narrow`  
**Prioridade:** P2 (só se search for hot path)

---

### Task 3: `maxDuration` em conversations (opcional)

**Files:** `api/conversations.js`

- [ ] Exportar `maxDuration: 30` se bench mostrar timeouts em cold start + enrich.

**Nota:** Hobby cap 10 s — enrich + LLM side effects não devem bloquear list.

---

## Critério de done

- [ ] Bench HTTP autenticado documentado no diagnostic
- [ ] p95 list+stats < 800 ms **ou** plano de índice Appwrite/região documentado
- [ ] Waterfall enrich reduzido (evidência no bench)
