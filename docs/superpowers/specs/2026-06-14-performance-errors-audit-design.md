# Auditoria de performance e erros — Design v1

**Data:** 2026-06-14  
**Status:** Aprovado para execução  
**Metodologia:** Spec-Driven Development (SDD)  
**Referências:** [SECURITY_DIAGNOSTIC.md](../../SECURITY_DIAGNOSTIC.md), [shell-performance S2](../plans/2026-06-10-shell-performance-s2.md), [ux-feedback.md](../../ux-feedback.md)

---

## 1. Objetivo

Estabelecer uma auditoria **repetível e mensurável** do Nave em duas dimensões:

1. **Performance** — bundle, bootstrap, Core Web Vitals, APIs críticas, runtime (INP/LCP).
2. **Erros** — contrato de falha (cliente + API), observabilidade, dead-letters, testes como especificação.

A spec define **critérios de sucesso mensuráveis** antes da execução. Cada achado vira item rastreável com severidade, evidência e plano de correção opcional.

### Fora de escopo (v1)

- Pentest / segurança (ver `SECURITY_DIAGNOSTIC.md`)
- Auditoria LGPD
- Otimização de custo de LLM (fase posterior)
- APM comercial (Sentry/Datadog) — apenas recomendação se gap for confirmado

---

## 2. Princípios SDD aplicados

| Princípio | Como aplicamos |
|-----------|----------------|
| **Spec antes do código** | Métricas, thresholds e rotas críticas definidos aqui antes de refatorar |
| **Critérios verificáveis** | Cada meta tem comando ou teste associado |
| **Testes como contrato** | Vitest cobre bootstrap, erros amigáveis, prefetch — falhas = regressão de spec |
| **Design → Plan → Execução** | Este doc → `plans/2026-06-14-performance-errors-audit.md` → `PERFORMANCE_ERRORS_DIAGNOSTIC.md` |
| **Baseline + delta** | Medição inicial congelada; melhorias comparam contra baseline |

---

## 3. Superfícies críticas

### 3.1 Rotas (cliente — Vite SPA)

| Rota | Prioridade | Por quê |
|------|------------|---------|
| `/` (Dashboard) | P0 | Primeira tela pós-login; bootstrap leads+alunos |
| `/inbox` | P0 | Tempo real, lista grande, mídia |
| `/pipeline`, `/funil` | P1 | DnD + listas |
| `/financeiro`, `/caixa` | P1 | Não deve prefetch leads/alunos (spec existente) |
| `/alunos`, `/lead/:id` | P1 | Perfis pesados |
| `/reports` | P2 | Charts (vendor-charts ~112 KB gzip) |

### 3.2 APIs (Vercel serverless)

| Handler | Prioridade | Risco |
|---------|------------|-------|
| `api/conversations.js` | P0 | Volume + latência Inbox |
| `api/whatsapp.js` | P0 | Webhook + envio; dead-letter |
| `api/leads.js` | P1 | Bootstrap |
| `api/agent.js` | P1 | LLM + timeouts |
| `api/reports.js` | P2 | Agregações pesadas |
| Crons + webhooks | P1 | `webhookQueue`, `deadLetterInbound` |

### 3.3 Contratos de erro (já especificados parcialmente)

| Camada | Módulo | Spec |
|--------|--------|------|
| Cliente UX | `friendlyError`, `useToast`, `ErrorBanner` | [ux-feedback.md](../../ux-feedback.md) |
| Cliente Appwrite | `appwriteErrors.js` | `src/test/appwriteErrors.test.js` |
| Cliente crash | `ErrorBoundary` + `lazyWithRetry` | Chunk stale vs erro genérico |
| Servidor | `logStructured`, `webhookQueue`, `deadLetterInbound` | JSON logs; alert após N falhas |
| API JSON | `apiErro` / handlers | Não vazar `e.message` cru em 500 (ver security doc) |

---

## 4. Critérios de sucesso (SLOs da auditoria)

### 4.1 Performance — bundle (build Vite)

| Métrica | Baseline 2026-06-14 | Meta v1 | Comando |
|---------|---------------------|---------|---------|
| `index-*.js` gzip (entry) | **172,88 KB** | **< 145 KB** (S2) | `npm run build` → dist/assets/index-*.js |
| `index-*.css` gzip | **19,15 KB** | **< 30 KB** | idem |
| Chunks > 500 KB raw | **2** (index, xlsx) | **0** no critical path inicial | build warnings |
| `vendor-xlsx` no path inicial | carregado lazy? | **Só em import/export** | grep imports + network |
| `vendor-charts` | 112 KB gzip | **Só em `/reports`** | route split |
| PWA precache | 3988 KiB | documentar; não bloquear v1 | build log |

### 4.2 Performance — bootstrap (spec existente)

Fonte: `src/test/bootstrapRoutePrefetch.test.js`

| Cenário | Esperado |
|---------|----------|
| `/financeiro`, `/caixa`, `/empresa` | `{ leads: false, students: false }` |
| `/inbox` | `{ leads: true, students: false }` |
| `/` | `{ leads: true, students: true }` |
| Double-fetch Dashboard | **0** (meta S2) |

### 4.3 Performance — runtime (produção ou preview)

| Métrica | Good | Needs improvement | Ferramenta |
|---------|------|-------------------|------------|
| LCP | < 2,5 s | 2,5–4 s | PageSpeed / Vercel Speed Insights |
| INP | < 200 ms | 200–500 ms | idem |
| CLS | < 0,1 | 0,1–0,25 | idem |
| TTFB API Inbox list | < 800 ms p95 | manual / logs | Vercel Functions |

### 4.4 Erros — qualidade

| Métrica | Meta v1 | Verificação |
|---------|---------|-------------|
| `npm run test:run` | **0 falhas** | CI local |
| Testes de erro (`appwriteErrors`, `agentTestErrorMessage`) | **100% pass** | vitest |
| APIs 500 sem mensagem interna | **0 ocorrências** em handlers P0 | grep + review |
| Dead-letter inbound configurado | coleção + logs | env + Appwrite |
| ErrorBoundary cobre app shell | **sim** (`App.jsx`) | code review |
| Páginas com load failure | **ErrorBanner + onRetry** | amostragem P0 |

### 4.5 Observabilidade

| Evento | Onde | Ação se ausente |
|--------|------|-----------------|
| `webhook_operational_alert` | `webhookQueue.js` | Configurar alerta externo |
| `dead_letter_*` | `deadLetterInbound.js` | Dashboard reconciliação |
| `[ErrorBoundary]` | console cliente | Considerar report remoto |
| `[WA Debug]` em prod | `useZapsterWhatsAppConnection` | Desligar com flag |

---

## 5. Fases de execução

Espelha [SECURITY_DIAGNOSTIC.md](../../SECURITY_DIAGNOSTIC.md):

### Fase 1 — Automatizado (local)

- [ ] `npm run build` — tamanhos gzip, warnings Rollup
- [ ] `npm run test:run` — suite completa
- [ ] `npm run test:run src/test/bootstrapRoutePrefetch.test.js`
- [ ] `npm run test:run src/test/appwriteErrors.test.js`
- [ ] Grep: `res.status(500).json` com `e.message` em `api/`
- [ ] Grep: imports estáticos de `xlsx`, charts no entry
- [ ] Inventário testes performance/erro (lista abaixo)

### Fase 2 — Cliente (manual + DevTools)

- [ ] Network waterfall: login → Dashboard (requests leads/alunos)
- [ ] Network: `/financeiro` direto — **sem** leads/alunos
- [ ] Lighthouse nas rotas P0 (mobile + desktop)
- [ ] Long tasks no Inbox (scroll + thread)
- [ ] Verificar `ErrorBanner`/`toast.error` em falha simulada (offline)

### Fase 3 — API e jobs

- [ ] Latência p50/p95 endpoints P0 (Vercel logs ou curl autenticado)
- [ ] Webhook retry + dead-letter (documentação operacional)
- [ ] Crons: auth + duração
- [ ] Respostas 500: mensagem amigável vs vazamento

### Fase 4 — Produção (Vercel / Appwrite)

- [ ] Speed Insights + Web Analytics habilitados
- [ ] Function regions vs Appwrite region
- [ ] Revisar logs 7d: top errors por rota
- [ ] Dead-letter collection: pending count

### Fase 5 — Relatório e backlog

- [x] Consolidar em `docs/PERFORMANCE_ERRORS_DIAGNOSTIC.md`
- [x] Classificar: **P0 blocker** | **P1 degradante** | **P2 melhoria**
- [x] Planos de implementação em `docs/superpowers/plans/` por tema

---

## 6. Testes como especificação (inventário)

### Performance

- `src/test/bootstrapRoutePrefetch.test.js` — matriz rota → prefetch
- `src/test/newLeadModal.test.js` — preload chunk modal
- `src/test/useInboxConversationList.test.js` — anti-waterfall stats
- `src/test/inboxListStatsCache.test.js`, `inboxThreadCache.test.js`

### Erros / UX

- `src/test/appwriteErrors.test.js` — não expor jargão Appwrite
- `src/test/agentTestErrorMessage.test.js`
- `src/test/inboxApiUtils.test.js` — parsing erros API

### Regressões conhecidas (baseline 2026-06-14)

| Arquivo | Falha | Causa provável |
|---------|-------|----------------|
| `useZapsterWhatsAppConnection.test.js` | 4/4 | mock `createSessionJwt` ausente |
| `newLeadModal.test.js` | 1/2 | preload chunk timeout |
| `useInboxConversationList.test.js` | 1/5 | expectativa `include_stats` |
| `signContract.test.ts` | 2/4 | API positions/sortable |

**Spec:** suite verde é pré-requisito para fechar Fase 1.

---

## 7. Achados iniciais (Fase 1 parcial)

### Performance

1. **Entry JS 172,88 KB gzip** — acima da meta S2 (145 KB). Regressão vs baseline S1 (158,9 KB).
2. **Chunks > 500 KB:** `index-CptpSmbi.js` (571 KB), `vendor-xlsx` (429 KB), `vendor-charts` (380 KB).
3. **Circular dependency warning:** `paymentMethodBankDefaults` ↔ `bankAccounts` — risco de ordem de execução quebrada entre chunks.
4. **PWA precache ~3,9 MB** — pode atrasar first visit em rede lenta.

### Erros / qualidade

1. **Test suite com falhas** — ver tabela §6; spec violada.
2. **APIs retornam `e.message` em 500** — ex.: `api/whatsapp.js` (confirmado grep).
3. **ErrorBoundary** — apenas `console.error`; sem telemetria remota.
4. **ErrorBoundary único** no root — correto para shell; rotas lazy dependem de chunk retry.

---

## 8. Entregáveis

| Artefato | Caminho |
|----------|---------|
| Esta spec | `docs/superpowers/specs/2026-06-14-performance-errors-audit-design.md` |
| Plano de execução | `docs/superpowers/plans/2026-06-14-performance-errors-audit.md` |
| Relatório vivo | `docs/PERFORMANCE_ERRORS_DIAGNOSTIC.md` |
| Correções | PRs temáticos (performance S2, test fixes, API error sanitization) |

---

## 9. Próximo passo recomendado

1. Aprovar esta spec (ou ajustar metas).
2. Executar Fase 1 completa → atualizar diagnostic.
3. Paralelo rápido: corrigir 4 arquivos de teste falhando (desbloqueia gate de qualidade).
4. Fase 2 Lighthouse em preview Vercel com URL fornecida pelo usuário.
