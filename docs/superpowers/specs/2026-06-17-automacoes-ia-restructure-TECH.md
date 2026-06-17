# Reestruturação IA — Automações / Tarefas / Funil WhatsApp (TECH)

**Data:** 2026-06-17  
**Status:** aprovada (Opção A)  
**PRODUCT:** [2026-06-17-automacoes-ia-restructure-PRODUCT.md](./2026-06-17-automacoes-ia-restructure-PRODUCT.md)  
**IMPLEMENTATION:** [2026-06-17-automacoes-ia-restructure-IMPLEMENTATION.md](./2026-06-17-automacoes-ia-restructure-IMPLEMENTATION.md)

---

## Escopo técnico (P4.1)

Mover superfície **Processos** para Tarefas; reduzir `/automacoes` ao funil WhatsApp; redirects; menu; copy centralizada.

**Sem alteração** em `lib/automationCore.js`, cron, APIs de task-templates ou whatsapp-templates.

---

## Decisões

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Rota Processos | `/tarefas?tab=processos` |
| D2 | Tab gatilhos | `gatilhos` canônico; `configuracoes` alias redirect |
| D3 | Componente Processos | Extrair `AutomacoesProcessosTab` → `TaskProcessosTab.jsx` ou montar em `Tasks.jsx` |
| D4 | Hub automacoes tabs | `AUTOMACOES_TABS` só `modelos` + `gatilhos` |
| D5 | Scope banner | Remover de `Automacoes.jsx` |
| D6 | Finance no readiness | Remover passo `finance_reminders` de `computeAutomationReadiness` **ou** só deixar de renderizar em `AutomacoesSection` |

---

## Arquivos principais

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Tasks.jsx` | `tab=processos`; lazy `TaskProcessosTab`; HubTabBar Operação/Processos ou query tab |
| `src/pages/AutomacoesProcessosTab.jsx` | Renomear/mover → `TaskProcessosTab.jsx` |
| `src/pages/Automacoes.jsx` | Remover Processos; redirect `tab=processos`; tabs modelos/gatilhos |
| `src/lib/automacoesHub.js` | `AUTOMACOES_TABS` 2 itens; `GATILHOS_TAB_ID`; helpers redirect |
| `src/lib/automacoesCopy.js` | `hub.title` Mensagens do funil; remover copy scope duas trilhas |
| `src/lib/naviMenu.js` | Accordion: Tarefas, Processos da equipe, Mensagens do funil, Agente IA |
| `src/lib/empresaLegacyRedirects.js` | Atualizar destinos |
| `src/components/routing/LegacyRedirects.jsx` | Se necessário |
| Links grep `tab=processos` | Atualizar para `/tarefas?tab=processos` |
| `src/components/academy/AutomacoesSection.jsx` | Remover finance readiness; título seção |
| `docs/flows/*` | automacoes-funil, tarefas-operacao, agente-ia-automacoes |

---

## Redirect em `Automacoes.jsx`

```javascript
// Pseudocódigo
if (tab === 'processos') navigate('/tarefas?tab=processos', { replace: true });
if (tab === 'configuracoes') setSearchParams({ tab: 'gatilhos' }, { replace: true });
```

---

## `Tasks.jsx` — aba Processos

- `ALLOWED_TABS = new Set(['', 'processos'])` ou resolver via `resolveHubTab`
- Quando `tab=processos`: render `TaskProcessosTab`; esconder filtros/kanban
- PageHeader dinâmico por tab
- Manter deep links de operação sem `tab`

---

## Testes

| Arquivo | Caso |
|---------|------|
| `automacoesHub.test.js` | 2 tabs; alias gatilhos |
| `naviMenu.test.js` | Novos labels e destinos |
| `empresaLegacyRedirects.test.js` | Destinos atualizados |
| Novo `taskProcessosTab.test.js` (opcional) | Redirect automacoes → tarefas |

Harness: `npm test -- automacoesHub automacoesSetupWizard naviMenu empresaLegacyRedirects`

---

## Rollout

1. Implementar redirects **antes** de remover conteúdo (evita 404 perceptivo)
2. Deploy único preferível (menu + redirects + move)
3. Toast sessionStorage `navi_migrated_processos_tab` uma vez após redirect de bookmark
