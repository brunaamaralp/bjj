# Relatório de diagnóstico de segurança (Nave)

**Data:** 2026-05-12  
**Escopo:** repositório local, `npm audit`, build de produção (`vite build`), varredura estática de `dist/`, revisão de `api/`, `lib/server/` e `src/`.  
**Limitações:** não inclui acesso ao painel Vercel/Appwrite em produção nem pentest dinâmico nem auditoria LGPD.

---

## Fase 1 — Automatizado

### `npm audit` (estado atual)

Execução local após dependências instaladas:

| Severidade | Pacote | Notas |
|------------|--------|--------|
| **Moderada** | `@anthropic-ai/sdk` 0.79.0–0.91.0 | [GHSA-p7fg-763f-g4gf](https://github.com/advisories/GHSA-p7fg-763f-g4gf) — permissões de ficheiro no “Local Filesystem Memory Tool”. Correção típica: `npm audit fix --force` (upgrade para ~0.95.x, possível breaking change). |
| **Alta** | `xlsx` (todas as versões reportadas) | Prototype pollution + ReDoS — **sem patch upstream** no ecossistema npm clássico. Mitigar: processar ficheiros só em worker/isolamento, limitar tamanho/complexidade, ou migrar para biblioteca mantida. |

`npm audit --omit=dev` reproduz o mesmo par (SDK + xlsx estão em `dependencies`).

### Build e bundle `dist/`

- `npm run build` **conclui com sucesso** (Vite 7.3.3).
- **Nota operacional:** `src/pages/Students.jsx` importava `xlsx` sem entrada correspondente em `package.json`, o que impedia o build; foi adicionada a dependência `xlsx` para permitir esta fase do diagnóstico e builds reprodutíveis. O risco de segurança da própria biblioteca permanece (linha da tabela acima).

### Varredura de segredos no `dist/`

Padrões procurados nos ficheiros gerados (JS/CSS/manifest/SW): `APPWRITE_API_KEY`, `sk-ant`, `sk_live`, `sk_test`, `OPENAI_API`, `ANTHROPIC_API_KEY`, `ASAAS_WEBHOOK`, `CRON_SECRET`, `INTERNAL_API`.

- **Resultado:** nenhuma ocorrência literal desses identificadores no `dist/` analisado. Isto **não** substitui política de segredos na Vercel nem revê se algum valor sensível foi embutido sob outro nome.

---

## Fase 2 — Segredos e configuração (checklist manual)

Confirmar na **Vercel** (Production / Preview) e alinhar com [`.env`](../.env) / [`.env.example`](../.env.example):

| Tipo | Variáveis (exemplos no código) | Notas |
|------|--------------------------------|--------|
| **Só servidor** | `APPWRITE_API_KEY`, `ANTHROPIC_API_KEY`, `ASAAS_WEBHOOK_SECRET`, `CRON_SECRET`, `INTERNAL_API_SECRET`, `ZAPSTER_WEBHOOK_TOKEN`, `ZAPSTER_API_TOKEN` / `ZAPSTER_TOKEN` | Nunca usar prefixo `VITE_*`. |
| **Cliente (bundle)** | `VITE_APPWRITE_*`, `VITE_INBOX_DEBUG`, `VITE_BILLING_ENABLED`, `VITE_ENABLE_*`, `VITE_ASAAS_LINK_*`, `VITE_CONTROLID_PROXY_BASE`, etc. | Tudo `VITE_*` é público no browser. |
| **Crons** | `CRON_SECRET` | Com `CRON_SECRET` definido no projeto Vercel, a plataforma envia `Authorization: Bearer <valor>` nas invocações agendadas — alinhar com [`api/cron/reset-usage.js`](../api/cron/reset-usage.js) (`timingSafeEqual`). |

- **Deployment Protection:** crons e webhooks devem usar URL de produção autorizada ou bypass documentado (ver [AGENTS.md](../AGENTS.md)).
- **Fallbacks em [`src/lib/appwrite.js`](../src/lib/appwrite.js):** `project`, `DB_ID`, `LEADS_COL`, `ACADEMIES_COL`, etc. têm valores default se env faltar — risco de ambiente errado e **IDs versionados no Git**; em produção, preferir falhar o build ou runtime se env obrigatórios faltarem.
- **Logs no cliente:** o mesmo ficheiro faz `console.log` de endpoint, projeto, DB e coleções — útil em dev, mas em produção expõe topologia de dados a qualquer utilizador com DevTools aberto.

---

## Fase 3 — API serverless (`/api/*`)

### Autenticação e multi-tenant

- Rotas com dados de negócio em [`api/conversations.js`](../api/conversations.js), [`api/tasks.js`](../api/tasks.js), [`api/leads.js`](../api/leads.js) (exceto rotas públicas listadas abaixo), [`api/labels.js`](../api/labels.js), [`api/message-flags.js`](../api/message-flags.js), [`api/reports.js`](../api/reports.js), [`api/whatsapp.js`](../api/whatsapp.js) usam `ensureAuth` + `ensureAcademyAccess` de [`lib/server/academyAccess.js`](../lib/server/academyAccess.js) com `x-academy-id`.
- [`api/reports.js`](../api/reports.js): compara `body.academyId` com o `academyId` autorizado pelo header — evita confiar só no body.
- [`api/billing.js`](../api/billing.js): JWT + `getAppwriteUserFromJwt`; mutações cruzam `assertAcademyOwnedByOwner` / `storeId` no body com ownership.
- **Planos públicos:** `GET /api/billing?action=plans` não exige JWT (lista para UI); confirmar que não expõe dados sensíveis além do pretendido.

### Webhooks e tarefas agendadas

| Endpoint | Controlo |
|----------|----------|
| [`api/v1/webhooks/asaas.js`](../api/v1/webhooks/asaas.js) | `ASAAS_WEBHOOK_SECRET` com `timingSafeEqual` (header ou query `token`). |
| [`lib/server/zapsterWebhook.js`](../lib/server/zapsterWebhook.js) | `ZAPSTER_WEBHOOK_TOKEN` com `safeCompare` (query, header ou Bearer). |
| [`api/cron/reset-usage.js`](../api/cron/reset-usage.js) | `CRON_SECRET` no Bearer + comparação em tempo constante. |
| [`api/leads.js`](../api/leads.js) `id=cron-aniversario` | `cronAuthOk`: Bearer, `x-cron-secret` ou **`?secret=`** na query. |

### Achados (API)

1. **Segredo em query string (`cron-aniversario`, Zapster webhook, Asaas webhook):** tokens em URL aparecem em logs de proxies, histórico de servidor e `Referer`. Preferir só header (ou POST com body) para segredos quando o integrador permitir.
2. **Vazamento de detalhes em JSON de erro:** vários handlers devolvem `e.message` / `error.message` em 500 (ex.: [`api/conversations.js`](../api/conversations.js), [`api/whatsapp.js`](../api/whatsapp.js), [`api/tasks.js`](../api/tasks.js), [`api/agent.js`](../api/agent.js) com `detail`, [`lib/server/academyAccess.js`](../lib/server/academyAccess.js) em `ensureAcademyAccess` no ramo 500). Risco: expor mensagens internas do Appwrite ou stack implícita.
3. **`ensureAuth`:** não regista o header `Authorization` (bom); evitar regressões que loguem prefixo do JWT.
4. **Agente:** [`api/agent.js`](../api/agent.js) delega em handlers com segredos internos (ex.: [`lib/server/agentProcess.js`](../lib/server/agentProcess.js) — `INTERNAL_API_SECRET`); manter consistência com o resto da superfície.

---

## Fase 4 — Cliente (Appwrite + XSS + storage)

### `dangerouslySetInnerHTML` (classificação)

| Classe | Onde | Risco |
|--------|------|--------|
| **(a) CSS estático** | Maioria das páginas (`Inbox.jsx`, `Dashboard.jsx`, `Tasks.jsx`, `Reports.jsx`, `StudentProfile.jsx`, `App.jsx`, etc.) | Baixo — apenas estilos em template literal. |
| **(b) Copy / hints** | [`ImportSheet.jsx`](../src/components/ImportSheet.jsx) — `terms.importSheetStudentRowHint` | Médio-baixo — depende de [`terminology`](../src/lib/terminology.js); se no futuro for editável por admin sem sanitização, rever XSS. |
| **(c) Conteúdo dinâmico de utilizador em HTML** | Sem ocorrências evidentes no grep atual para `__html` preenchido diretamente com mensagens de chat/notas. | Rever sempre que se passe HTML de terceiros. |

### `localStorage` / persistência

- Preferências de UI e estado local.
- **Zustand persist:** [`useLeadStore.js`](../src/store/useLeadStore.js), [`useAccountingStore.js`](../src/store/useAccountingStore.js), [`useControlIdStore.js`](../src/store/useControlIdStore.js) — dados de negócio/cache; risco em dispositivos partilhados e extensões; não substituem permissões no Appwrite.

### Debug

- `VITE_INBOX_DEBUG` e chave `inbox_debug` no storage — manter desligado em produção para reduzir superfície.

---

## Fase 5 — Appwrite Console (manual)

Checklist a executar no console Appwrite:

1. **Auth:** métodos ativos, domínios de redirect, política de sessão.
2. **Database → cada coleção:** permissões por role/team; isolamento por `academy_id` / `academyId` onde for multi-tenant.
3. **API keys:** escopo mínimo; rotação; separar chaves de CI vs produção.
4. **Functions / Webhooks** nativos Appwrite: alinhados com o que a app expõe na Vercel.

---

## Resumo de severidade (achados principais)

| Severidade | Achado | Evidência / ação |
|------------|--------|------------------|
| **Alto** | Vulnerabilidades `xlsx` (sem fix npm) | `npm audit`; mitigar uso (limites, worker, ou alternativa). |
| **Alto** | Aceitar segredo de cron em `?secret=` (GET) | [`api/leads.js`](../api/leads.js) — `cronAuthOk`; preferir só header/POST. |
| **Moderado** | `@anthropic-ai/sdk` (advisory filesystem tool) | Upgrade planeado com testes. |
| **Moderado** | Fallbacks e logs verbosos no cliente Appwrite | [`src/lib/appwrite.js`](../src/lib/appwrite.js). |
| **Moderado** | Respostas 500 com `e.message` | Vários `api/*.js` + `ensureAcademyAccess`. |
| **Moderado** | Webhook tokens também aceites em query | Asaas / Zapster — risco operacional de vazamento em logs. |
| **Baixo** | `dangerouslySetInnerHTML` com copy estática | Monitorizar origem do HTML. |
| **Baixo** | Dados em `localStorage` | Política de dispositivo; comunicação aos utilizadores. |

---

## Próximos passos sugeridos

1. Planear upgrade de `@anthropic-ai/sdk` após regressão em fluxos de LLM.
2. Reduzir superfície `xlsx`: validação de ficheiros, limites de tamanho, ou processamento server-side apenas.
3. Endurecer `cronAuthOk`: remover `req.query.secret` para pedidos GET ou exigir apenas `Authorization` / `x-cron-secret`.
4. Normalizar erros 500 para mensagem genérica ao cliente e log estruturado só no servidor.
5. Checklist Vercel + Appwrite (Fases 2 e 5) com responsável e data.
6. Opcional: `eslint-plugin-security` e CI com `npm audit --audit-level=high` (com política explícita para `xlsx` “accepted risk” ou ticket de substituição).

---

*Este documento corresponde às Fases 1–6 do plano de diagnóstico; não substitui pentest externo nem auditoria de conformidade.*
