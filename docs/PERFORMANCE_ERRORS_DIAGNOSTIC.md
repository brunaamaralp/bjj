# Relatório de diagnóstico — performance e erros (Nave)

**Data:** 2026-06-14  
**Spec:** [2026-06-14-performance-errors-audit-design.md](superpowers/specs/2026-06-14-performance-errors-audit-design.md)  
**Escopo:** build local, Vitest, Lighthouse (preview + prod login), waterfall DevTools, varredura `api/`, Vercel prod (`www.navefit.com`).  
**Limitações:** CWV autenticado (Dashboard/Inbox) pendente; bench HTTP API precisa `AUDIT_JWT`; logs Vercel CLI com buffer limitado no Hobby.

---

## Resumo executivo

| Área | Status | Destaque |
|------|--------|----------|
| Build | ✅ Passa | Entry JS **172,9 KB gzip** — acima da meta |
| Testes | ✅ | 1204/1204 pass |
| Bootstrap prefetch | ✅ | `/financeiro` sem leads/alunos (runtime confirmado) |
| CWV login (preview / prod) | ⚠️ Mobile | Preview LCP **3,0 s** · Prod LCP **3,3 s** (meta 2,5 s) |
| Erros API | ✅ PR aberto | 500 sanitizado (`respondApiError`); merge pendente |
| Observabilidade | ❌ Gap | Speed Insights ausente — ver AUD-08 |
| Região prod | ⚠️ | Functions **iad1** · Appwrite **sfo** |
| **Auditoria SDD** | ✅ | Fases 1–5 concluídas — ver § Fase 5 |

---

## Fase 1 — Automatizado

### Build (`npm run build`)

**Resultado:** sucesso (Vite + Next.js).

| Asset | Tamanho | gzip | Meta spec |
|-------|---------|------|-----------|
| `index-CptpSmbi.js` (entry) | 571,5 KB | **172,88 KB** | < 145 KB ❌ |
| `index-BWpFcINT.css` | 112,9 KB | **19,15 KB** | < 30 KB ✅ |
| `vendor-charts` | 379,8 KB | 112,14 KB | lazy em reports |
| `vendor-xlsx` | 429,2 KB | 142,94 KB | lazy em import |
| `Inbox-*.js` | 127,9 KB | 38,59 KB | rota lazy |

**Warnings Rollup:**
- Chunks > 500 KB: entry + xlsx
- Dependência circular: `paymentMethodBankDefaults.js` ↔ `bankAccounts.js` (6 imports afetados)

**PWA:** precache 35 entries, **3988 KiB**

### Testes (`npm run test:run`)

**Status:** ✅ Suite completa — **1204/1204** testes, **233/233** arquivos (`exit_code: 0`, 2026-06-14).

| Arquivo | Status | Correção |
|---------|--------|----------|
| `useZapsterWhatsAppConnection.test.js` | ✅ | mock `createSessionJwt` |
| `newLeadModal.test.js` | ✅ | mock do chunk lazy |
| `useInboxConversationList.test.js` | ✅ | alinhado: mount sem `include_stats` |
| `signContract.test.ts` | ✅ | 2º arg `academyDoc` (`null`) |

**Spec verde (gate Fase 1):** ✅

### Contratos de erro (testes que passam)

- `appwriteErrors.test.js` — mensagens amigáveis, sem jargão técnico ao usuário
- Padrão documentado em [ux-feedback.md](ux-feedback.md)

### Varredura API — vazamento em 500

~~20 ocorrências em handlers P0~~ → **0** após PR `fix/api-500-sanitize-friendly-errors` (`respondApiError`).

```bash
node --env-file=.env scripts/audit-api-phase3.mjs | grep '"count"'  # → "count": 0
```

Novos handlers: usar `respondApiError()` — `lib/server/friendlyError.js`.

---

## Fase 2 — Cliente (runtime)

**Ambiente:** `vite preview` → `http://localhost:4173` (build produção) · `vite dev` → `http://localhost:5173` (sessão autenticada, API proxy sem backend local).

### Lighthouse — `/login` (preview, cold)

Relatórios: [desktop](audit-phase2-login-desktop.json) · [mobile](audit-phase2-login-mobile.json)

| Métrica | Desktop | Mobile | Threshold “good” |
|---------|---------|--------|------------------|
| Performance score | **92** | **77** | — |
| FCP | 0,9 s ✅ | 2,7 s ⚠️ | < 1,8 s |
| LCP | 1,0 s ✅ | **3,0 s** ⚠️ | < 2,5 s |
| TBT | 30 ms ✅ | 410 ms ⚠️ | < 200 ms |
| CLS | 0 ✅ | 0,001 ✅ | < 0,1 |
| TTI (interactive) | 1,0 s ✅ | 3,8 s ⚠️ | — |
| Speed Index | 2,5 s ⚠️ | 4,3 s ⚠️ | — |

**Leitura:** login desktop está saudável; **mobile em preview local** estoura LCP/TBT — entry JS 173 KB gzip + parse no emulador mobile. Validar em **URL Vercel** (CDN + HTTP/2) antes de otimizar à cegas.

### Waterfall pós-navegação (dev autenticado, Performance API)

Medição: navegação SPA + requests nos primeiros 4–6 s após `performance.clearResourceTimings()`.

| Rota | Nav (ms) | `/api/students/list` | `/api/leads` | Outros relevantes |
|------|----------|----------------------|--------------|-----------------|
| `/financeiro` | 1422 | **0** ✅ | **0** ✅ | notifications, products, inventory, conversations `stats=1` |
| `/` (Dashboard) | 1108 | **1** (`limit=200`) | **0** (HTTP) | leads via Appwrite SDK (coleção documents) |
| `/inbox` | 1354 | **0** ✅ | Appwrite leads query | conversations `stats=1`; lista sem `include_stats` no mount |

**Conclusão bootstrap:** spec `resolveRouteBootstrapNeeds('/financeiro')` **confirmada em runtime** — sem prefetch de listas leads/alunos.

**Achados adicionais:**
- Dashboard ainda dispara `GET /api/students/list?limit=200` ao navegar para `/` (esperado pela spec S2).
- Leads no Dashboard/Inbox vão **direto ao Appwrite** (não passam por `/api/leads`) — métrica de rede deve incluir chamadas `*.appwrite.io`.
- Dev local: várias APIs retornam erro de proxy (`ECONNREFUSED` → `localhost:3000`); latências no browser não representam produção.

### Checklist Fase 2

- [x] Lighthouse `/login` (desktop + mobile, preview)
- [x] Waterfall `/`, `/inbox`, `/financeiro` (bootstrap)
- [ ] Lighthouse `/`, `/inbox`, `/financeiro` **autenticados** (requer URL prod + login script ou credenciais)
- [ ] INP ao scroll Inbox (DevTools Performance ou Speed Insights prod)
- [ ] Simular offline → `ErrorBanner` + retry

**Próximo para fechar Fase 2:** URL de produção/preview Vercel + conta de teste, ou `vercel dev` com API local.

---

## Fase 3 — API

**Script:** `node --env-file=.env scripts/audit-api-phase3.mjs --academy-id=<id>`  
**Data:** 2026-06-14 · academia com **126** conversas ativas

### Latência Appwrite (proxy inbox, sem auth/handler Vercel)

| Operação | Tempo | Meta spec p95 |
|----------|-------|---------------|
| List 50 conversas (`orderDesc updated_at`) | **752 ms** | TTFB list < 800 ms ⚠️ |
| Stats 4× count em paralelo | **398 ms** | — |
| **Estimativa list + stats + enrich** | ~1,1–1,5 s + enrich leads | revisar com `AUDIT_JWT` |

**Arquitetura `api/conversations.js` (estático):**
- ✅ `fetchListStats`: 4 counts em `Promise.all` + cache 60 s (`INBOX_LIST_STATS_CACHE_MS`)
- ✅ Com `include_stats=1`, stats disparam em paralelo com a list (`statsPromise`)
- ⚠️ `enrichConversationListDocs` roda **após** a list (waterfall)
- ⚠️ Busca textual dispara 2ª query wide (120 docs) + enrich

**Bench HTTP handler completo:** omitido — definir `AUDIT_API_BASE` + `AUDIT_JWT` no `.env` para medir `/api/conversations` com auth real.

### Dead-letter / filas webhook

| Fila | Env | Pending |
|------|-----|---------|
| Inbound WhatsApp | `VITE_APPWRITE_INBOUND_DEAD_LETTER_COL_ID` | **não configurado** no `.env` local |
| Webhook jobs (Asaas) | `APPWRITE_WEBHOOK_JOBS_COLLECTION_ID` | **não configurado** no `.env` local |

Código pronto: `webhookQueue.js` (retry 3×, alert após 5 falhas), `deadLetterInbound.js` (skip silencioso se col ausente).

### Timeouts agente / Vercel

| Knob | Valor |
|------|-------|
| `CLAUDE_TIMEOUT_MS` | **8500 ms** (`lib/constants.js`) |
| `maxDuration` explícito | só `api/finance.js`, `api/contracts.js` (60 s) |
| `api/agent.js`, `api/conversations.js` | default Vercel (**10 s** Hobby) |

Claude a 8,5 s cabe no Hobby; rotas LLM com retries encadeados podem encostar no limite.

### Varredura API — vazamento em 500

~~**20 ocorrências** em handlers P0~~ → **0** após PR `fix/api-500-sanitize-friendly-errors` (`respondApiError` em conversations, whatsapp, tasks, leads, billing).

Verificação contínua:

```bash
node --env-file=.env scripts/audit-api-phase3.mjs | grep '"count"'
# esperado: "count": 0
```

**Recomendação:** novos handlers devem usar `respondApiError()` — ver `lib/server/friendlyError.js` e `lib/server/friendlyError.test.js`.

---

### Checklist Fase 3

- [x] Bench Appwrite list + stats (proxy DB)
- [x] Inventário 500 + `e.message`
- [x] Revisão webhook/dead-letter (config + código)
- [x] Timeouts agent vs Vercel
- [ ] Bench HTTP autenticado (precisa `AUDIT_JWT`)
- [ ] Contagem dead-letter em produção (env Vercel)

---

## Fase 4 — Produção

**Script:** `node --env-file=.env scripts/audit-phase4-production.mjs`  
**URLs:** prod canônica **https://www.navefit.com** (projeto `bjj`) · preview **https://bjj-nave.vercel.app** (projeto `bjj-nave`)  
**Data:** 2026-06-14

### Deploys Vercel (`vercel inspect`)

| Projeto | Alias prod | Functions region | Node |
|---------|------------|------------------|------|
| `bjj` | www.navefit.com | **iad1** (US East) | 24.x |
| `bjj-nave` | bjj-nave.vercel.app | **iad1** | 24.x |

**Appwrite:** `sfo.cloud.appwrite.io` (US West).

**Gap de latência:** cada round-trip Appwrite na function paga ~60–90 ms extra vs co-location. Para usuários BR, considerar avaliar **gru1** (Vercel) vs latência Appwrite — trade-off a medir com bench real.

### Speed Insights / Web Analytics

| Check | Resultado |
|-------|-----------|
| `@vercel/speed-insights` / `@vercel/analytics` no `package.json` | **Ausente** |
| Scripts `/_vercel/insights` ou `vitals.vercel` no HTML `/login` | **Ausente** |

**Conclusão:** observabilidade CWV em produção depende só de Lighthouse manual — **habilitar SDK** é P2 do backlog.

### Lighthouse — `/login` produção (mobile)

Relatório: [audit-phase4-login-mobile.json](audit-phase4-login-mobile.json)

| Métrica | Preview local | **Prod navefit.com** | Threshold |
|---------|---------------|----------------------|-----------|
| Score | 77 | **63** ⚠️ | — |
| LCP | 3,0 s | **3,3 s** ⚠️ | < 2,5 s |
| FCP | 2,7 s | **2,9 s** ⚠️ | < 1,8 s |
| TTFB documento | — | **140 ms** ✅ | — |
| CLS | 0,001 | **0,001** ✅ | < 0,1 |

Prod pior que preview local no score mobile — entry JS 173 KB gzip + parse mobile; CDN não compensa bundle.

### TTFB rotas (sem auth, cold/warm misto)

| Rota | Status | Tempo |
|------|--------|-------|
| `GET /login` | 200 | **~1586 ms** (1ª carga) |
| `GET /api/conversations?…` | 401 | **~1883 ms** |
| `GET /api/agent?route=health` | 404 | **~1315 ms** |

401/404 esperados sem JWT; latência inclui cold start Hobby.

### Logs Vercel — amostra 7d (`vercel logs www.navefit.com --since 168h`)

**Limitação Hobby:** CLI retorna **~100 linhas recentes**, não agregação completa 7d. Amostra salva em [audit-phase4-logs-7d.txt](audit-phase4-logs-7d.txt).

| Métrica | Amostra |
|---------|---------|
| HTTP **500** | **0** |
| Linhas `error` | **6** (todas `DEP0169` Node deprecation, status 304/401/404 — não falha de negócio) |
| Tráfego dominante | `GET /api/agent` (polling sessão/plano) |
| Rotas P0 saudáveis | `/api/conversations` 304, `/api/students/list` 304, `/api/billing/status` 304 |

**Ação P2:** suprimir ou corrigir warning `DEP0169` para não poluir nível `error` nos logs.

### Dead-letter / filas (prod)

| Fila | Env | Pending |
|------|-----|---------|
| Inbound WhatsApp | `VITE_APPWRITE_INBOUND_DEAD_LETTER_COL_ID` | **não configurado** (local + `.env.example` comentado) |
| Webhook jobs | `APPWRITE_WEBHOOK_JOBS_COLLECTION_ID` | **não configurado** |

`vercel env pull` do projeto linkado (`bjj-nave`) trouxe só vars de build — secrets de Appwrite ficam no dashboard; confirmar coleções no painel Vercel do projeto **`bjj`**.

### Checklist Fase 4

- [x] Region functions vs Appwrite (iad1 vs sfo)
- [x] Lighthouse `/login` produção (mobile)
- [x] Amostra logs Vercel + TTFB rotas
- [x] Verificar Speed Insights / Web Analytics (ausentes)
- [ ] Dead-letter pending count (precisa env vars no Vercel + coleções provisionadas)
- [ ] Agregação logs 7d completa (requer Pro / Log Drain ou dashboard Vercel)

---

## Fase 5 — Relatório final e backlog

**Status auditoria:** ✅ **Concluída** (2026-06-14) — fases 1–5 executadas; itens abertos viram PRs abaixo.

### Gates SLO (spec §4)

| Categoria | Meta | Resultado | Status |
|-----------|------|-----------|--------|
| Testes Vitest | 0 falhas | **1204/1204** | ✅ |
| Entry JS gzip | < 145 KB | **172,88 KB** | ❌ P1 |
| CSS gzip | < 30 KB | **19,15 KB** | ✅ |
| Bootstrap `/financeiro` | sem leads/alunos | confirmado runtime | ✅ |
| LCP login mobile prod | < 2,5 s | **3,3 s** | ❌ P1 |
| CLS | < 0,1 | **0,001** | ✅ |
| API 500 sem `e.message` | 0 | **0** (branch fix) | ✅ merge pendente |
| Dead-letter configurado | coleção + env | **não configurado** | ❌ P2 |
| Speed Insights prod | habilitado | **ausente** | ❌ P2 |
| Inbox list p95 | < 800 ms | **~752 ms** DB only | ⚠️ encostando |
| Logs HTTP 500 (7d amostra) | 0 | **0** | ✅ |

**Veredicto:** qualidade de erros e bootstrap **ok**; performance mobile e bundle **fora da meta**; observabilidade prod **gap**.

### Backlog classificado

| ID | Prioridade | Item | Evidência | Plano / PR |
|----|------------|------|-----------|------------|
| AUD-01 | **P0** | ~~Suite Vitest verde~~ | 1204 pass | ✅ feito |
| AUD-02 | **P0** | ~~Sanitizar HTTP 500 P0~~ | grep count 0 | PR `fix/api-500-sanitize-friendly-errors` — **merge pendente** |
| AUD-03 | **P1** | Entry JS 172 → 145 KB gzip | build 2026-06-14 | [audit-backlog-performance](superpowers/plans/2026-06-14-audit-backlog-performance.md) + [S2](superpowers/plans/2026-06-10-shell-performance-s2.md) |
| AUD-04 | **P1** | LCP mobile login < 2,5 s | prod 3,3 s | idem AUD-03 (bundle) |
| AUD-05 | **P1** | Circular `bankAccounts` ↔ `paymentMethodBankDefaults` | Rollup warning | `fix/finance-bank-circular-deps` |
| AUD-06 | **P1** | Inbox enrich waterfall + p95 | list 752 ms | [audit-backlog-inbox-api](superpowers/plans/2026-06-14-audit-backlog-inbox-api.md) |
| AUD-07 | **P1** | Bench HTTP autenticado | sem `AUDIT_JWT` | Task 0 inbox plan |
| AUD-08 | **P2** | Speed Insights + Web Analytics | HTML sem SDK | [audit-backlog-observability](superpowers/plans/2026-06-14-audit-backlog-observability.md) |
| AUD-09 | **P2** | Dead-letter + webhook jobs env | vars ausentes | idem observability |
| AUD-10 | **P2** | PWA precache 3,9 MB | build log | performance plan Task 3 |
| AUD-11 | **P2** | DEP0169 como `error` nos logs | 6 linhas amostra | observability Task 3 |
| AUD-12 | **P2** | Região iad1 vs Appwrite sfo | vercel inspect | medir bench; considerar `gru1` |
| AUD-13 | **P2** | CWV autenticado `/`, `/inbox` | não medido | Speed Insights pós AUD-08 |
| AUD-14 | **P2** | INP scroll Inbox + offline ErrorBanner | Fase 2 aberta | manual / Playwright |

**Legenda:** **P0 blocker** · **P1 degradante** (meta spec) · **P2 melhoria** (ops / observabilidade)

### Roadmap de PRs (ordem sugerida)

```
1. merge fix/api-500-sanitize-friendly-errors     [AUD-02] ← desbloqueia prod
2. fix/finance-bank-circular-deps                 [AUD-05] ← quick win build
3. perf/shell-s2-bootstrap-css                    [AUD-03, AUD-04]
4. perf/inbox-enrich-parallel                     [AUD-06] ← após AUDIT_JWT
5. feat/vercel-speed-insights-analytics           [AUD-08, AUD-13]
6. ops/dead-letter-collections                    [AUD-09]
7. perf/pwa-precache-trim                         [AUD-10]
8. fix/node-dep0169-log-noise                     [AUD-11]
```

### Planos de implementação

| Tema | Documento |
|------|-----------|
| Performance bundle + PWA | [2026-06-14-audit-backlog-performance.md](superpowers/plans/2026-06-14-audit-backlog-performance.md) |
| Observabilidade | [2026-06-14-audit-backlog-observability.md](superpowers/plans/2026-06-14-audit-backlog-observability.md) |
| Inbox API latência | [2026-06-14-audit-backlog-inbox-api.md](superpowers/plans/2026-06-14-audit-backlog-inbox-api.md) |
| Shell S2 (existente) | [2026-06-10-shell-performance-s2.md](superpowers/plans/2026-06-10-shell-performance-s2.md) |
| Execução auditoria | [2026-06-14-performance-errors-audit.md](superpowers/plans/2026-06-14-performance-errors-audit.md) |

### Scripts de re-auditoria

```bash
npm run build && npm run test:run
node --env-file=.env scripts/audit-api-phase3.mjs --academy-id=<id>
node --env-file=.env scripts/audit-phase4-production.mjs
npx lighthouse https://www.navefit.com/login --form-factor=mobile --only-categories=performance
```

### Checklist Fase 5

- [x] Consolidar fases 1–4 neste documento
- [x] Classificar backlog P0 / P1 / P2
- [x] Planos por tema em `docs/superpowers/plans/`
- [x] Roadmap de PRs com dependências

---

## Histórico

| Data | Autor | Notas |
|------|-------|-------|
| 2026-06-14 | Auditoria SDD | **Fase 5:** backlog final, SLO gates, 3 planos de implementação |
| 2026-06-14 | Auditoria SDD | Fase 4: prod navefit.com, região iad1/sfo, logs, Lighthouse |
| 2026-06-14 | Auditoria SDD | Fase 3: bench API Appwrite + inventário 500 |
| 2026-06-14 | Auditoria SDD | Fase 1 completa; testes verdes |
