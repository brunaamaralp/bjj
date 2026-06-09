# Convenções multi-tenant (Navi)

Guia para manter isolamento por academia em código novo e revisões.

## Identificador de tenant

| Contexto | Nome canônico | Notas |
|----------|---------------|--------|
| API / header HTTP | `academyId` | Header `x-academy-id` |
| Billing | `storeId` | Mesmo ID da academia no Appwrite |
| Legado Appwrite | `academy_id` | Conversas, extratos bancários, algumas coleções antigas |

**Regra:** em JavaScript/TypeScript preferir `academyId`. Na persistência, usar o campo já definido na coleção; ao criar schemas novos, padronizar em `academyId`.

## Resolução e autorização (servidor)

Fluxo obrigatório para handlers autenticados:

1. `ensureAuth(req, res)` — validar JWT
2. `ensureAcademyAccess(req, res, me)` — validar membership via `x-academy-id`
3. Escopar queries com `academyId` / `academy_id`
4. Em `getDocument` por ID, verificar ownership (`doc.academyId === access.academyId`)

Helpers do projeto:

- [`lib/server/academyAccess.js`](../lib/server/academyAccess.js) — `ensureAcademyAccess`, `ensureAcademyOwnerOrAdmin`, `invalidateAcademyAccessCache`
- [`lib/server/studentsHandler.js`](../lib/server/studentsHandler.js) — `assertStudentInAcademy`
- [`lib/server/academyDocumentPermissions.js`](../lib/server/academyDocumentPermissions.js) — `buildAcademyDocumentPermissions`

Nunca confiar só em `req.body.academyId` ou `req.query.academyId` sem `ensureAcademyAccess`.

## Frontend — troca de academia

Ao mudar `academyId` no `useLeadStore`:

- Chamar [`resetStoresForAcademyChange`](../src/lib/resetStoresForAcademyChange.js) (via `initStores` subscribe ou `handleAcademyChange`)
- React Query: keys devem incluir `academyId` (ex.: contratos `['contracts', academyId, ...]`)
- `localStorage` tenant-scoped: prefixo por academia (ex. `bjj_accounting_v1_{academyId}`)

## Webhooks Zapster

- Token global `ZAPSTER_WEBHOOK_TOKEN` — tratar como segredo de infraestrutura
- Academia resolvida por `instanceId` mapeado no Appwrite ou `?academyId=` **somente** com instância válida/vinculada
- Ver [`lib/server/zapsterWebhook.js`](../lib/server/zapsterWebhook.js): `verifyInstanceBelongsToAcademy`, `bindInstanceToAcademyIfNeeded`

## Checklist Appwrite (automático + manual)

Referência: [SECURITY_DIAGNOSTIC.md — Fase 5](./SECURITY_DIAGNOSTIC.md#fase-5--appwrite-console-manual)

### Gerar / atualizar a tabela

Com `APPWRITE_API_KEY` no `.env` (somente servidor):

```bash
# Relatório no terminal (não altera arquivos)
node --env-file=.env scripts/audit-multi-tenant-appwrite.mjs

# Atualiza a tabela abaixo em este documento
node --env-file=.env scripts/audit-multi-tenant-appwrite.mjs --write --responsavel "Seu Nome"
```

O script audita **permissões de coleção**, **atributos tenant** (`academyId` / `academy_id`) e **segredos em `src/`/`dist/`**. Itens de Auth (redirects) e mutações client-side para não-membros ficam como **Pendente** — exigem console Appwrite ou teste E2E com dois JWTs.

| Item | Status | Responsável | Data |
|------|--------|-------------|------|
<!-- audit-multi-tenant:auto-start -->
| Auth: domínios de redirect e métodos ativos revisados | Pendente — revisar no console Appwrite → Auth (não exposto na API deste script) | audit-script | 2026-06-09 |
| Coleções tenant-owned: permissões `Role.team(teamId)` + owner | Falha — 0/14 coleções OK; 10 falha(s); 4 atenção | audit-script | 2026-06-09 |
| Leads/Students/Financial: atributo e permissões sem leitura global | Falha — 0/11 coleções CRM/finance OK | audit-script | 2026-06-09 |
| API keys: escopo mínimo, sem chave admin no cliente | Falha — 3 ocorrência(s): src/services/planService.js, src/services/planService.js, src/services/planService.js | audit-script | 2026-06-09 |
| Mutações client-side bloqueadas para não-membros | Pendente — 7 arquivo(s) com updateDocument — validar com JWT de usuário sem membership (E2E) | audit-script | 2026-06-09 |
<!-- audit-multi-tenant:auto-end -->

## Backlog (não bloqueante)

Migrar mutações sensíveis feitas direto no browser (`databases.updateDocument`) para APIs com `ensureAcademyOwnerOrAdmin`:

- Configurações de academia em componentes `src/components/academy/*`
- Contas contábeis em `AccountsTab.jsx`
- Estágios do funil em `Pipeline.jsx`

## Auditoria

Usar a skill `multi-tenant-review` antes de PRs que tocam APIs, caches, webhooks, cron ou UI com dados por academia.
