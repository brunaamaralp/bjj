<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- **Vercel Hobby: máximo 12 Serverless Functions** em `/api/` — não criar arquivos `api/*.js` novos sem consolidar via `?route=` / `?hub=` em handlers existentes (`leads.js`, `finance.js`, `agent.js`, `reports.js`, `cron/reset-usage.js`, etc.). Exceção atual: `api/cron/automations-frequent.js` (12ª function) para fila `pending_automations` a cada 15 min.
- **Automações agendadas (`runAutomations`)**: sem mutex entre invocações paralelas (`automations-frequent` a cada 15 min + safety net diário). `sent=true` é gravado **após** envio Zapster OK (ou skip `no_recent_interaction`); sobreposição teórica pode duplicar envio — resolver em spec futuro se necessário.
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->

## Limite de Functions Vercel Hobby

O projeto usa o plano Hobby da Vercel, que permite no máximo 12 Serverless Functions (arquivos físicos em `/api/`).

**Status atual: 12/12 — limite esgotado.**

Inventory atual:

- `api/agent.js`
- `api/billing.js`
- `api/contracts.js`
- `api/conversations.js`
- `api/finance.js`
- `api/leads.js`
- `api/reports.js`
- `api/tasks.js`
- `api/webhooks.js`
- `api/whatsapp.js`
- `api/cron/reset-usage.js`
- `api/cron/automations-frequent.js`

### Regra obrigatória

Nenhum novo arquivo `.js` pode ser criado em `/api/` ou subpastas.

Novos endpoints devem obrigatoriamente usar um destes padrões:

1. `api/agent.js?route=<nome>` — para rotas de produto
2. `api/cron/reset-usage.js?action=<nome>` — para novos crons (adicionar rewrite em `vercel.json`)

Rewrites em `vercel.json` não contam como function adicional.  
Cron entries em `vercel.json` não contam como function adicional.  
Subpastas em `/api/` não contam como função separada se o arquivo pai já existe — verificar antes de criar.

### Consequência de violar esta regra

Deploy falha silenciosamente ou functions são truncadas sem aviso.

## Design system

Padrões de UI, tokens e componentes compartilhados: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Feedback visual (toasts, banners, erros)

Ao adicionar alertas ou mensagens de erro, siga [docs/ux-feedback.md](docs/ux-feedback.md): use `useToast` para ações transitórias, `StatusBanner`/`ErrorBanner` para erros persistentes de página, `FieldError` em formulários e `ConfirmDialog` em vez de `window.confirm`.

## Menus dropdown

Novos menus flutuantes devem usar o primitivo em `src/components/shared/menu` e as classes `navi-menu__*` (tokens em `:root`). Ver [docs/dropdown-menus.md](docs/dropdown-menus.md).
