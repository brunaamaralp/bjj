# P4.1 — Reestruturação IA Automações (Opção A) — Implementation Spec

> **For agentic workers:** Implementar tarefa a tarefa. Marcar checkboxes ao concluir. Harness obrigatório antes de merge.

**Goal:** Separar **Processos da equipe** (config CRM) para `/tarefas?tab=processos` e deixar `/automacoes` exclusivo para **Mensagens do funil** (Modelos + Gatilhos), com redirects e menu alinhados.

**Architecture:** Renomear/mover `AutomacoesProcessosTab` → `TaskProcessosTab`; hub `Tasks.jsx` ganha modo `tab=processos`; hub `Automacoes.jsx` perde Processos e renomeia aba `configuracoes` → `gatilhos`; lib central `automacoesHub.js` + `automacoesCopy.js` + `automacoesSetupWizard.js` atualizadas; navegação em `naviMenu.js` sem item Processos no accordion funil.

**PRODUCT:** [2026-06-17-automacoes-ia-restructure-PRODUCT.md](./2026-06-17-automacoes-ia-restructure-PRODUCT.md) (aprovada — Opção A)  
**TECH:** [2026-06-17-automacoes-ia-restructure-TECH.md](./2026-06-17-automacoes-ia-restructure-TECH.md)

**Plano espelhado (agents):** [../plans/2026-06-17-automacoes-ia-restructure.md](../plans/2026-06-17-automacoes-ia-restructure.md)

**Tech stack:** React 18, React Router, Vitest, `HubTabBar`, `StatusBanner`, `useToast`.

**Escopo desta spec:** P4.1 apenas. P4.2 (status WA no header, subheaders menu) fica fora.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `src/lib/tasksHubTabs.js` | **Criar** | `TASKS_HUB_TABS`, `resolveTasksHubTab`, constante `processos` |
| `src/lib/automacoesHub.js` | **Modificar** | 2 abas; `GATILHOS_TAB_ID`; `normalizeAutomacoesTab()` |
| `src/lib/automacoesCopy.js` | **Modificar** | Título hub, copy gatilhos, remover tab.processos / scope |
| `src/lib/automacoesSetupWizard.js` | **Modificar** | `tab: 'gatilhos'`; defaults; remover compact/processos |
| `src/pages/TaskProcessosTab.jsx` | **Criar** | Conteúdo migrado de `AutomacoesProcessosTab` |
| `src/pages/AutomacoesProcessosTab.jsx` | **Deletar** | Substituído por TaskProcessosTab |
| `src/pages/Tasks.jsx` | **Modificar** | `?tab=processos`, header dinâmico, HubTabBar Operação/Processos |
| `src/pages/Automacoes.jsx` | **Modificar** | 2 abas; redirects; remover scope banner e Processos |
| `src/pages/AutomacoesConfigTab.jsx` | **Modificar** | Renomear imports se `tabId=gatilhos` em intro |
| `src/components/academy/AutomacoesTabIntroBanner.jsx` | **Modificar** | `gatilhos` em vez de `configuracoes`; remover `processos` |
| `src/components/academy/AutomacoesHubScopeBanner.jsx` | **Deletar** ou deixar unused | Remover uso |
| `src/components/academy/AutomacoesSection.jsx` | **Modificar** | Links `tab=gatilhos`; sem finance no readiness |
| `src/components/academy/AutomacoesReadinessBanner.jsx` | **Modificar** | Remover bloco `finance_reminders` |
| `src/lib/automationUx.js` | **Modificar** | Remover passo `finance_reminders` de `computeAutomationReadiness` |
| `src/lib/naviMenu.js` | **Modificar** | Menu Atendimento conforme PRODUCT |
| `src/lib/mobileMoreNav.js` | **Modificar** | Labels/rotas funil |
| `src/lib/empresaLegacyRedirects.js` | **Modificar** | Destinos novos |
| `src/lib/legacyRoutes.js` | **Verificar** | Redirects `/automacoes?tab=processos` |
| `src/components/routing/LegacyRedirects.jsx` | **Verificar** | Idem |
| ~15 arquivos com deep links | **Modificar** | Ver Task 8 |
| `src/test/tasksHubTabs.test.js` | **Criar** | |
| `src/test/automacoesHub.test.js` | **Modificar** | |
| `src/test/automacoesSetupWizard.test.js` | **Modificar** | Sem compact/processos |
| `src/test/naviMenu.test.js` | **Modificar** | |
| `src/test/empresaLegacyRedirects.test.js` | **Modificar** | |
| `src/test/automationUx.test.js` | **Modificar** | Sem finance step |
| `docs/flows/atendimento/automacoes-funil.md` | **Modificar** | |
| `docs/flows/crm/tarefas-operacao.md` | **Modificar** | |
| `docs/flows/atendimento/agente-ia-automacoes.md` | **Modificar** | |

---

## Modelo de URL

| URL | Comportamento |
|-----|---------------|
| `/tarefas` | Operação (views atuais) — **sem mudança funcional** |
| `/tarefas?tab=processos` | `TaskProcessosTab` — templates, playbook, follow-up legado |
| `/automacoes` | Redirect → `?tab=modelos` ou tab do wizard ativo |
| `/automacoes?tab=modelos` | Modelos de mensagem |
| `/automacoes?tab=gatilhos` | Gatilhos do funil (ex-Configurações) |
| `/automacoes?tab=configuracoes` | Redirect replace → `?tab=gatilhos` |
| `/automacoes?tab=processos` | `navigate('/tarefas?tab=processos', { replace: true })` + toast opcional |
| Empresa `?tab=tarefas` | `/tarefas?tab=processos` |
| Empresa `?tab=automacoes` | `/automacoes?tab=gatilhos` |
| Onboarding `setup_automations` | `/automacoes?wizard=1` (mantém) |

---

## Wireframe lógico

### `/tarefas?tab=processos`

```
┌─ Processos da equipe ───────────────────────────────────┐
│ Subtitle: checklists CRM — não envia WhatsApp sozinho   │
│ [ Operação ] [ Processos da equipe ]  ← HubTabBar       │
├─────────────────────────────────────────────────────────┤
│ (sem wizard WhatsApp)                                   │
│ TaskTemplatesSection                                    │
│ ─── separador ───                                       │
│ FollowupPlaybookSection                                 │
│ ─── separador ───                                       │
│ EnrollmentFollowUpSection                               │
└─────────────────────────────────────────────────────────┘
```

### `/automacoes`

```
┌─ Mensagens do funil ──────────────────────────────────┐
│ Subtitle: textos e gatilhos WhatsApp automáticos       │
│ [ Modelos ] [ Gatilhos ]                               │
├─────────────────────────────────────────────────────────┤
│ (wizard opcional — só aqui)                            │
│ conteúdo da aba                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Constantes novas

### `src/lib/tasksHubTabs.js`

```javascript
export const TASKS_HUB_TABS = [
  { id: 'operacao', label: 'Operação' },
  { id: 'processos', label: 'Processos da equipe' },
];

export const TASKS_TAB_OPERACAO = 'operacao';
export const TASKS_TAB_PROCESSOS = 'processos';

/** @param {string | null | undefined} tab */
export function resolveTasksHubTab(tab) {
  const t = String(tab || '').trim().toLowerCase();
  if (t === TASKS_TAB_PROCESSOS) return TASKS_TAB_PROCESSOS;
  return TASKS_TAB_OPERACAO;
}

export function isTasksProcessosTab(tab) {
  return resolveTasksHubTab(tab) === TASKS_TAB_PROCESSOS;
}
```

### `src/lib/automacoesHub.js`

```javascript
export const AUTOMACOES_GATILHOS_TAB_ID = 'gatilhos';

export const AUTOMACOES_TABS = [
  { id: 'modelos', label: 'Modelos' },
  { id: AUTOMACOES_GATILHOS_TAB_ID, label: 'Gatilhos' },
];

const AUTOMACOES_TAB_ALIASES = {
  configuracoes: AUTOMACOES_GATILHOS_TAB_ID,
};

/** Normaliza tab legada → canônica */
export function normalizeAutomacoesTab(tab) {
  const t = String(tab || '').trim().toLowerCase();
  if (t === 'processos') return { kind: 'redirect', to: '/tarefas?tab=processos' };
  if (AUTOMACOES_TAB_ALIASES[t]) return { kind: 'tab', tab: AUTOMACOES_TAB_ALIASES[t] };
  if (AUTOMACOES_TABS.some((x) => x.id === t)) return { kind: 'tab', tab: t };
  return { kind: 'tab', tab: 'modelos' };
}
```

### Copy (`automacoesCopy.js`)

```javascript
hub: {
  title: 'Mensagens do funil',
  subtitle: 'Textos e gatilhos que enviam WhatsApp automaticamente quando o número está conectado no Agente IA.',
},
tab: {
  modelos: { hint: '...' },
  gatilhos: { hint: 'Ative ou desative cada gatilho de envio automático do funil.' },
},
// Remover: tab.processos, wizard compact (não há mais aba processos no hub)
wizard: {
  configuracoes: { ctaLabel: 'Ir para Gatilhos' },
  // whatsapp.description: remover menção a "Processos (outra aba)"
}
```

Adicionar `tasks.processos` em copy nova ou `tasksCopy.js` mínimo:

```javascript
// src/lib/tasksCopy.js (criar se não existir)
export const TASKS_COPY = {
  processos: {
    title: 'Processos da equipe',
    subtitle: 'Checklists e rotinas que a equipe executa no CRM — não enviam WhatsApp sozinhos.',
    introBanner: null, // opcional: link para Mensagens do funil
  },
};
```

---

## Task 1: Libs + testes (fundação)

**Files:** `tasksHubTabs.js`, `automacoesHub.js`, testes

- [ ] **1.1** Criar `src/lib/tasksHubTabs.js` com exports acima
- [ ] **1.2** Criar `src/test/tasksHubTabs.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { resolveTasksHubTab, isTasksProcessosTab } from '../lib/tasksHubTabs.js';

describe('tasksHubTabs', () => {
  it('default é operacao', () => {
    expect(resolveTasksHubTab('')).toBe('operacao');
    expect(resolveTasksHubTab(undefined)).toBe('operacao');
  });
  it('processos', () => {
    expect(resolveTasksHubTab('processos')).toBe('processos');
    expect(isTasksProcessosTab('processos')).toBe(true);
  });
});
```

- [ ] **1.3** Atualizar `automacoesHub.js` com `normalizeAutomacoesTab`, 2 abas, `AUTOMACOES_GATILHOS_TAB_ID`
- [ ] **1.4** Atualizar `src/test/automacoesHub.test.js`:

```javascript
it('AUTOMACOES_TABS tem modelos e gatilhos', () => {
  expect(AUTOMACOES_TABS.map((t) => t.id)).toEqual(['modelos', 'gatilhos']);
});
it('normalizeAutomacoesTab redireciona processos', () => {
  expect(normalizeAutomacoesTab('processos')).toEqual({
    kind: 'redirect',
    to: '/tarefas?tab=processos',
  });
});
it('normalizeAutomacoesTab alias configuracoes', () => {
  expect(normalizeAutomacoesTab('configuracoes')).toEqual({ kind: 'tab', tab: 'gatilhos' });
});
```

- [ ] **1.5** Rodar: `npm test -- tasksHubTabs automacoesHub` → verde

---

## Task 2: Wizard e setup (`automacoesSetupWizard.js`)

- [ ] **2.1** Passo wizard `configuracoes`: `tab: 'gatilhos'` (manter `id: 'configuracoes'` internamente ou renomear para `gatilhos` — **preferir `id: 'gatilhos'`** e atualizar todos os `switch`/testes)
- [ ] **2.2** `tabForWizardStep`: default `'modelos'` (não `'processos'`)
- [ ] **2.3** Remover `resolveWizardSurface` branch `activeTab === 'processos' → compact`
- [ ] **2.4** Remover `getCompactWizardContent` e componente `AutomacoesSetupWizardCompact` **se** não houver mais uso; caso contrário manter só para edge case `?wizard=1` (avaliar — após P4.1 compact só existe se forçado; **remover compact** simplifica)
- [ ] **2.5** Atualizar `automacoesSetupWizard.test.js`: remover testes `processos + compact`; atualizar `tabForWizardStep('configuracoes')` → `'gatilhos'`
- [ ] **2.6** Rodar: `npm test -- automacoesSetupWizard` → verde

---

## Task 3: Migrar Processos → Tarefas

- [ ] **3.1** Criar `src/pages/TaskProcessosTab.jsx` — copiar corpo de `AutomacoesProcessosTab.jsx`:
  - Remover `AutomacoesTabIntroBanner` com `tabId=processos` (ou substituir por banner opcional com link `/automacoes?tab=modelos`)
  - Manter seções `.automacoes-processos-block`
- [ ] **3.2** Deletar `src/pages/AutomacoesProcessosTab.jsx`
- [ ] **3.3** Em `Tasks.jsx`:
  - `useSearchParams` + `resolveTasksHubTab`
  - `HubTabBar` primário: Operação | Processos da equipe (`variant="secondary"` ou igual Caixa)
  - `activeTab === 'processos'`: render `<TaskProcessosTab />`; **ocultar** filtros, view toggle, kanban, lista
  - `activeTab === 'operacao'`: layout atual
  - PageHeader dinâmico (título/subtitle/actions)
  - Link header: `Configurar processos` → `setSearchParams({ tab: 'processos' })` em vez de `/automacoes?tab=processos`
- [ ] **3.4** CSS: reutilizar `.automacoes-processos-block` em `pipeline.css` ou mover para `tasks.css`
- [ ] **3.5** Teste manual: `/tarefas?tab=processos` carrega templates

---

## Task 4: Hub `/automacoes` (só funil)

- [ ] **4.1** `Automacoes.jsx`:
  - Remover import/uso `AutomacoesProcessosTab`, `AutomacoesHubScopeBanner`, compact wizard, `showProcessosTabIntro`
  - `ALLOWED` = `modelos`, `gatilhos`
  - `useEffect` redirect: `normalizeAutomacoesTab(tab)` → navigate ou setSearchParams
  - Toast único ao redirect processos: `sessionStorage navi_migrated_processos_v1`
  - PageHeader: `AUTOMACOES_COPY.hub.title` + subtitle
  - `fallbackTab`: wizard → `modelos`; completo → `gatilhos`
  - Lazy tabs: só modelos + configuracoes (renomear prop `AutomacoesConfigTab` → tab gatilhos)
- [ ] **4.2** Deletar ou deixar sem referência `AutomacoesHubScopeBanner.jsx`
- [ ] **4.3** `AutomacoesTabIntroBanner`: suportar `tabId: 'gatilhos'`; remover case `processos`
- [ ] **4.4** `AutomacoesConfigTab` / `AutomacoesSection`: `showTabIntro` para `gatilhos`

---

## Task 5: Readiness sem Financeiro

- [ ] **5.1** `automationUx.js`: remover bloco `if (financeModuleOn) { infraSteps.push(finance_reminders...) }`
- [ ] **5.2** `AutomacoesReadinessBanner.jsx`: remover case `finance_reminders` e import `FINANCE_WHATSAPP_REMINDERS_PATH`
- [ ] **5.3** `useAutomacoesSetupWizard.js`: remover `financeModuleOn` se passado só para readiness
- [ ] **5.4** `automationUx.test.js`: remover/ajustar teste `finance_reminders`
- [ ] **5.5** Rodar: `npm test -- automationUx` → verde

---

## Task 6: Navegação

- [ ] **6.1** `buildAutomacoesAccordion` → renomear para `buildFunilMensagensAccordion` (ou manter função, mudar conteúdo):

```javascript
export function buildAutomacoesAccordion({ canConfigureAgenteIa }) {
  const children = [
    { id: 'modelos', label: 'Modelos', to: '/automacoes?tab=modelos' },
    { id: 'gatilhos', label: 'Gatilhos', to: '/automacoes?tab=gatilhos' },
  ];
  if (canConfigureAgenteIa) {
    children.push({ id: 'agente', label: 'Agente IA', to: '/agente-ia' });
  }
  return {
    id: NAV_ACCORDION_IDS.AUTOMACOES, // manter id interno por ora
    label: 'Mensagens do funil',
    iconKey: 'automacoes',
    defaultTo: '/automacoes?tab=modelos',
    children,
  };
}
```

- [ ] **6.2** `buildSidebarNavModel`: após Tarefas, adicionar item direto:

```javascript
{ to: '/tarefas?tab=processos', label: 'Processos da equipe', iconKey: 'tarefas' },
```

- [ ] **6.3** `flattenNavItemsForMobile`: label pai `Mensagens do funil`; incluir Processos da equipe; defaultTo `modelos`
- [ ] **6.4** `getAccordionIdForLocation`: `/tarefas?tab=processos` — **não** abrir accordion automacoes (permanece em primary/tarefas)
- [ ] **6.5** `isAccordionChildActive`: match `gatilhos` e alias `configuracoes`
- [ ] **6.6** Atualizar `naviMenu.test.js` e `mobileMoreNav.js`

---

## Task 7: Legacy redirects

- [ ] **7.1** `empresaLegacyRedirects.js`:

```javascript
automacoes: '/automacoes?tab=gatilhos',
tarefas: '/tarefas?tab=processos',
```

- [ ] **7.2** `empresaLegacyRedirects.test.js` — asserts novos
- [ ] **7.3** Revisar `legacyRoutes.js` / `LegacyRedirects.jsx` para `/automacoes` paths

---

## Task 8: Deep links (grep obrigatório)

Substituir em todos os hits:

| Padrão antigo | Novo |
|---------------|------|
| `/automacoes?tab=processos` | `/tarefas?tab=processos` |
| `/automacoes?tab=configuracoes` | `/automacoes?tab=gatilhos` |
| `tab=configuracoes` em links internos funil | `tab=gatilhos` |

**Arquivos confirmados (mínimo):**

- `src/pages/Tasks.jsx`
- `src/pages/AutomacoesModelosTab.jsx`
- `src/components/academy/AutomacoesSection.jsx`
- `src/components/academy/EnrollmentFollowUpSection.jsx`
- `src/components/academy/StudentsSection.jsx`
- `src/pages/Tasks.jsx` (empty states / CTAs)
- `lib/server/sendAutomationCron.js` (se houver URL em comentário/log — só se aplicável)

- [ ] **8.1** `rg "automacoes\\?tab=(processos|configuracoes)" src lib` → zero após patch (exceto redirects/tests)

---

## Task 9: Documentação

- [ ] **9.1** `automacoes-funil.md` — rotas, mapa de telas, remover processos do hub
- [ ] **9.2** `tarefas-operacao.md` — adicionar `?tab=processos`, checklist
- [ ] **9.3** `agente-ia-automacoes.md` — diagrama atualizado
- [ ] **9.4** PRODUCT status → `implementado (P4.1)` quando mergeado

---

## Task 10: Verificação final

- [ ] **10.1** `npm test -- tasksHubTabs automacoesHub automacoesSetupWizard automationUx naviMenu empresaLegacyRedirects`
- [ ] **10.2** Checklist manual PRODUCT (6 itens)
- [ ] **10.3** `npm run build` sem erros

---

## Ordem de merge recomendada

1. Task 1 (libs + testes)
2. Task 2 (wizard)
3. Task 3 (TaskProcessosTab + Tasks)
4. Task 4 (Automacoes hub)
5. Task 5 (readiness)
6. Task 6–8 (nav + links)
7. Task 9–10 (docs + QA)

**Um PR** com todos os commits acima é o ideal (deploy atômico — evita menu novo com rota antiga quebrada).

---

## Riscos de implementação

| Risco | Mitigação |
|-------|-----------|
| `Tasks.jsx` muito grande | Extrair só `TaskProcessosTab`; não refatorar operação |
| Wizard `id` configuracoes vs gatilhos | Renomear `id` para `gatilhos` em um único commit com testes |
| Accordion id `automacoes` interno | Manter `NAV_ACCORDION_IDS.AUTOMACOES` para não quebrar persistência de accordion aberto |
| Onboarding `setup_automations` | Smoke test manual pós-deploy |

---

## Fora de escopo (P4.2+)

- Banner status WhatsApp no header de Mensagens do funil
- Subheaders “Equipe” / “WhatsApp” na sidebar
- Split do playbook por tipo de passo
- Renomear rota `/automacoes` → `/funil`

---

## Histórico

| Data | Mudança |
|------|---------|
| 2026-06-17 | Spec de implementação P4.1 — Opção A aprovada |
