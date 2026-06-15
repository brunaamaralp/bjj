# Backlog auditoria — Observabilidade

> **Origem:** [PERFORMANCE_ERRORS_DIAGNOSTIC.md](../../PERFORMANCE_ERRORS_DIAGNOSTIC.md) · Fase 5 · 2026-06-14  
> **Prioridade:** P2 melhoria (P1 para dead-letter se webhooks em prod)

**Goal:** CWV mensuráveis em prod, filas dead-letter operacionais, logs Vercel limpos de falsos positivos.

---

## Gaps confirmados

| Item | Evidência | Impacto |
|------|-----------|---------|
| Speed Insights / Web Analytics | ausentes em `package.json` e HTML `/login` | CWV prod invisíveis |
| Dead-letter inbound | `VITE_APPWRITE_INBOUND_DEAD_LETTER_COL_ID` não configurado | mensagens perdidas sem rastro |
| Webhook jobs | `APPWRITE_WEBHOOK_JOBS_COLLECTION_ID` não configurado | retry Asaas só em memória |
| Logs `DEP0169` | 6 linhas `error` com HTTP 304/401 | ruído em alertas |

---

### Task 1: Vercel Speed Insights + Web Analytics

**Files:**
- Modify: `package.json`, `src/main.jsx`
- Docs: `.env.example` (nota: sem secrets)

- [ ] **Step 1:** `npm i @vercel/speed-insights @vercel/analytics`
- [ ] **Step 2:** Em `main.jsx`, após `createRoot`:

```jsx
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
// dentro do Router:
<SpeedInsights />
<Analytics />
```

- [ ] **Step 3:** Deploy preview; confirmar script `/_vercel/insights` no HTML.
- [ ] **Step 4:** Habilitar Speed Insights no dashboard Vercel (projeto `bjj`).

**PR sugerido:** `feat/vercel-speed-insights-analytics`

---

### Task 2: Provisionar dead-letter + webhook jobs

**Files:**
- Script: `scripts/provision-dead-letter-schema.mjs` (criar se não existir)
- Env: Vercel dashboard projeto **`bjj`** (prod canônica)
- Modify: `.env.example` — descomentar vars

- [ ] **Step 1:** Criar coleções Appwrite: `inbound_dead_letter`, `webhook_jobs` (attrs: `status`, `payload`, `error`, `attempts`, `academy_id`, timestamps).
- [ ] **Step 2:** Setar env production:
  - `VITE_APPWRITE_INBOUND_DEAD_LETTER_COL_ID`
  - `APPWRITE_WEBHOOK_JOBS_COLLECTION_ID`
- [ ] **Step 3:** Rodar `node --env-file=.env scripts/audit-api-phase3.mjs` — pending count deve responder.
- [ ] **Step 4:** Documentar runbook em comentário no diagnostic ou `docs/ops-webhooks.md` (1 parágrafo).

**PR sugerido:** `ops/dead-letter-collections` (script + docs; env manual no Vercel)

---

### Task 3: Suprimir DEP0169 como `error` nos logs

**Files:**
- Investigar: qual API Node 24 deprecada dispara em `api/agent`, `api/tasks`, `api/conversations`
- Modify: handler ou `vercel.json` runtime config se aplicável

- [ ] **Step 1:** Reproduzir local com `vercel dev` ou log completo de uma linha DEP0169.
- [ ] **Step 2:** Corrigir uso deprecado **ou** filtrar no `logStructured` se for dependência transitiva.
- [ ] **Step 3:** Confirmar `vercel logs` sem `error` para requests 2xx/304.

**PR sugerido:** `fix/node-dep0169-log-noise`  
**Prioridade:** P2

---

### Task 4 (opcional): ErrorBoundary → report remoto

**Files:** `src/App.jsx`, `src/components/ErrorBoundary.jsx`

- [ ] Avaliar Sentry vs Vercel Observability; só implementar se prod confirmar crashes não capturados.

---

## Critério de done

- [ ] Speed Insights recebendo dados em dashboard Vercel (LCP/INP por rota)
- [ ] Dead-letter vars configuradas em prod + pending count verificável
- [ ] Zero HTTP 500 na amostra de logs; DEP0169 não aparece como `error`
