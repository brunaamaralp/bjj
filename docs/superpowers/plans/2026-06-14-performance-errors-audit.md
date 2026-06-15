# Plano — Auditoria performance e erros

> **For agentic workers:** Use superpowers:executing-plans ou subagent-driven-development. Checkboxes `- [ ]` para tracking.

**Goal:** Executar a spec [2026-06-14-performance-errors-audit-design.md](../specs/2026-06-14-performance-errors-audit-design.md) e manter [PERFORMANCE_ERRORS_DIAGNOSTIC.md](../../PERFORMANCE_ERRORS_DIAGNOSTIC.md) atualizado.

**Architecture:** Fases sequenciais 1→5; Fase 1 bloqueia relatório final; correções saem em PRs separados por tema.

---

### Task 1: Completar Fase 1 automatizada

**Files:** `docs/PERFORMANCE_ERRORS_DIAGNOSTIC.md`

- [x] Aguardar `npm run test:run` completo; registrar totais pass/fail
- [x] Rodar testes de spec: `bootstrapRoutePrefetch`, `appwriteErrors`
- [ ] Script grep 500 + `e.message` em `api/` → tabela no diagnostic
- [x] Atualizar seção Fase 1 do diagnostic

---

### Task 2: Desbloquear gate de testes (P0)

**Files:**
- Modify: `src/test/useZapsterWhatsAppConnection.test.js` (mock `createSessionJwt`)
- Modify: `src/test/useInboxConversationList.test.js`
- Modify: `src/test/newLeadModal.test.js`
- Modify: `src/test/signContract.test.ts`

- [x] Corrigir mocks/expectativas
- [x] `npm run test:run` → 0 falhas
- [x] Atualizar diagnostic § Fase 1 testes

---

### Task 3: Fase 2 — Lighthouse (requer URL)

- [x] Lighthouse `/login` preview local (desktop + mobile) → `docs/audit-phase2-login-*.json`
- [x] DevTools: network waterfall pós-login (bootstrap `/financeiro` confirmado)
- [ ] Obter URL preview/prod do usuário
- [ ] PageSpeed Insights autenticado: `/`, `/inbox`, `/financeiro`
- [ ] INP scroll Inbox + offline `ErrorBanner`

---

### Task 4: Fase 3 — API latência

- [x] Script `scripts/audit-api-phase3.mjs` (500 scan + dead-letter + bench Appwrite)
- [x] Bench Appwrite list/stats (752 ms / 398 ms baseline)
- [x] Inventário timeouts agent + maxDuration
- [ ] Bench HTTP com `AUDIT_API_BASE` + `AUDIT_JWT`
- [ ] Dead-letter count em prod (env Vercel)

---

### Task 5: Fase 4 — Produção

- [x] `vercel inspect` — região functions **iad1** vs Appwrite **sfo**
- [x] Lighthouse `/login` prod → `docs/audit-phase4-login-mobile.json`
- [x] Amostra logs + TTFB (`docs/audit-phase4-logs-7d.txt`)
- [x] Script `scripts/audit-phase4-production.mjs`
- [x] Verificar Speed Insights / Web Analytics (ausentes no código)
- [ ] Dead-letter count (env coleções no Vercel `bjj`)

---

### Task 6: Backlog → PRs

- [ ] PR performance: circular deps + S2 bundle → [audit-backlog-performance](2026-06-14-audit-backlog-performance.md)
- [x] PR erros: sanitizar 500 P0 (`fix/api-500-sanitize-friendly-errors`) — **merge pendente**
- [ ] PR observabilidade → [audit-backlog-observability](2026-06-14-audit-backlog-observability.md)
- [ ] PR inbox API → [audit-backlog-inbox-api](2026-06-14-audit-backlog-inbox-api.md)

---

### Task 7: Fase 5 — Relatório final

- [x] Gates SLO consolidados no diagnostic § Fase 5
- [x] Backlog AUD-01…AUD-14 classificado P0/P1/P2
- [x] Planos por tema (performance, observabilidade, inbox-api)
- [x] Roadmap de PRs com ordem sugerida

---

## Comandos de verificação

```bash
npm run build
npm run test:run
npm run test:run src/test/bootstrapRoutePrefetch.test.js
npm run test:run src/test/appwriteErrors.test.js
npx lighthouse http://localhost:4173/login --only-categories=performance --output=json
```
