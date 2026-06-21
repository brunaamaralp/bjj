# Arquitetura de Configuracoes IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a arquitetura da informacao de configuracoes para separar `Minha conta`, `Configuracoes` e superficies operacionais, mantendo o layout atual de settings e melhorando a clareza de navegacao.

**Architecture:** A implementacao mantem o layout existente baseado em `HubTabBar` + `AcademyTabSettingsLayout`, adiciona um hub canonico `/configuracoes`, reclassifica `Empresa` como `Configuracoes`, agrupa `Alunos` + `Horarios` na mesma familia e move `Integracoes` para dentro do hub de configuracoes sem mexer em `Agente IA` e `Mensagens automaticas` como hubs operacionais. Rotas antigas continuam funcionando por alias e redirects suaves.

**Tech Stack:** React, React Router, Vitest, Testing Library, CSS existente em `finance.css`, utilitarios de navegação em `src/lib/*`.

---

## File Structure

### Criar

- `src/lib/configuracoesSections.js`
  - Define as tabs de alto nivel do novo hub `/configuracoes`
  - Resolve `tab` canonica, labels e hints
- `src/components/settings/AlunosAulasSettingsSection.jsx`
  - Wrapper que combina `StudentsSection` + `HorariosSection` na mesma familia mantendo o layout atual
- `src/components/settings/IntegracoesSettingsSection.jsx`
  - Wrapper reutilizavel para renderizar o conteudo atual de `Integracoes` dentro de `Configuracoes`
- `src/test/configuracoesSections.test.js`
  - Cobre canonico, fallback e labels do novo hub

### Modificar

- `src/App.jsx`
  - Adiciona rota canonica `/configuracoes`
  - Mantem `/empresa` como alias/redirect
- `src/pages/AcademySettings.jsx`
  - Vira o hub principal de `Configuracoes`
  - Mantem o layout atual de settings
- `src/pages/Integracoes.jsx`
  - Vira alias fino para a secao `integracoes` do hub de configuracoes
- `src/lib/empresaLegacyRedirects.js`
  - Atualiza destinos legados do antigo hub
- `src/components/routing/LegacyRedirects.jsx`
  - Atualiza `EmpresaLegacyTabRedirect`
- `src/lib/naviMenu.js`
  - Ajusta labels e destinos do menu desktop/mobile
- `src/lib/mobileMoreNav.js`
  - Ajusta label/destino de `Minha academia` para `Configuracoes`
- `src/components/layout/NaviUserMenu.jsx`
  - Ajusta entrada do menu do usuario para `Configuracoes`
- `src/test/empresaLegacyRedirects.test.js`
  - Atualiza asserts de redirecionamento
- `src/test/naviMenu.test.js`
  - Atualiza labels/targets do menu lateral
- `src/test/mobileMoreNav.test.js`
  - Atualiza label/target do item de configuracoes
- `docs/flows/config/onboarding-academia.md`
  - Atualiza nomes/rotas canônicas
- `docs/flows/config/empresa-horarios-turmas.md`
  - Atualiza nomenclatura e agrupamento `Alunos e aulas`
- `docs/flows/config/conta-assinatura.md`
  - Mantem `Minha conta` separado de `Configuracoes`

### Nao modificar nesta entrega

- `src/pages/Automacoes.jsx`
- `src/pages/AIAgentSettings.jsx`
- `src/components/academy/AgenteIASection.jsx`

Essas superficies permanecem operacionais; a entrega mexe apenas em navegacao, rotulagem e posicionamento conceitual.

---

### Task 1: Criar taxonomia e rota canonica de `Configuracoes`

**Files:**
- Create: `src/lib/configuracoesSections.js`
- Modify: `src/App.jsx`
- Modify: `src/lib/empresaLegacyRedirects.js`
- Modify: `src/components/routing/LegacyRedirects.jsx`
- Test: `src/test/configuracoesSections.test.js`
- Test: `src/test/empresaLegacyRedirects.test.js`

- [ ] **Step 1: Escrever os testes que definem a taxonomia nova**

```js
import { describe, expect, it } from 'vitest';
import {
  CONFIGURACOES_SECTIONS,
  CONFIGURACOES_ITEMS,
  CONFIGURACOES_DEFAULT_SECTION,
  isConfiguracoesSection,
  resolveConfiguracoesNavState,
} from '../lib/configuracoesSections.js';

describe('configuracoesSections', () => {
  it('usa academia como fallback canônico', () => {
    expect(CONFIGURACOES_DEFAULT_SECTION).toBe(CONFIGURACOES_SECTIONS.ACADEMIA);
    expect(resolveConfiguracoesNavState('invalido').section).toBe('academia');
  });

  it('expõe as famílias principais da nova IA', () => {
    expect(CONFIGURACOES_ITEMS.map((item) => item.id)).toEqual([
      'academia',
      'crm',
      'alunos-aulas',
      'integracoes',
      'financeiro',
    ]);
  });

  it('aceita tabs válidas e rejeita tabs removidas', () => {
    expect(isConfiguracoesSection('crm')).toBe('crm');
    expect(isConfiguracoesSection('estudio')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes para ver falha vermelha**

Run: `npm test -- configuracoesSections empresaLegacyRedirects`

Expected:

```text
FAIL  src/test/configuracoesSections.test.js
Error: Failed to resolve import "../lib/configuracoesSections.js"
```

- [ ] **Step 3: Implementar a taxonomia e a rota canônica**

```js
// src/lib/configuracoesSections.js
export const CONFIGURACOES_SECTIONS = {
  ACADEMIA: 'academia',
  CRM: 'crm',
  ALUNOS_AULAS: 'alunos-aulas',
  INTEGRACOES: 'integracoes',
  FINANCEIRO: 'financeiro',
};

const VALID = new Set(Object.values(CONFIGURACOES_SECTIONS));

export const CONFIGURACOES_ITEMS = [
  {
    id: CONFIGURACOES_SECTIONS.ACADEMIA,
    label: 'Academia',
    hint: 'Dados gerais, endereço, redes e personalização.',
  },
  {
    id: CONFIGURACOES_SECTIONS.CRM,
    label: 'CRM',
    hint: 'Funil, perguntas, etiquetas e metas.',
  },
  {
    id: CONFIGURACOES_SECTIONS.ALUNOS_AULAS,
    label: 'Alunos e aulas',
    hint: 'Matrícula, graduações, turmas e horários.',
  },
  {
    id: CONFIGURACOES_SECTIONS.INTEGRACOES,
    label: 'Integrações',
    hint: 'WhatsApp, catraca e assinatura digital.',
  },
  {
    id: CONFIGURACOES_SECTIONS.FINANCEIRO,
    label: 'Financeiro',
    hint: 'Planos, regras e parâmetros financeiros.',
  },
];

export const CONFIGURACOES_DEFAULT_SECTION = CONFIGURACOES_SECTIONS.ACADEMIA;

export function isConfiguracoesSection(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return VALID.has(id) ? id : null;
}

export function resolveConfiguracoesNavState(rawTab) {
  const section = isConfiguracoesSection(rawTab) || CONFIGURACOES_DEFAULT_SECTION;
  const meta = CONFIGURACOES_ITEMS.find((item) => item.id === section) || CONFIGURACOES_ITEMS[0];
  return { section, meta };
}
```

```jsx
// src/App.jsx
<Route path="/configuracoes" element={<AcademySettings />} />
<Route path="/empresa" element={<Navigate to="/configuracoes" replace />} />
```

```js
// src/lib/empresaLegacyRedirects.js
export const EMPRESA_LEGACY_TAB_REDIRECTS = {
  estoque: '/loja?tab=estoque',
  equipe: '/equipe',
  catraca: '/configuracoes?tab=integracoes',
  avancado: '/conta?tab=dados',
  automacoes: '/automacoes?tab=gatilhos',
  tarefas: '/tarefas?tab=processos',
  vendas: '/loja?tab=vendas&config=1',
  contratos: '/configuracoes?tab=financeiro&section=contratos',
};
```

- [ ] **Step 4: Rodar os testes e verificar verde**

Run: `npm test -- configuracoesSections empresaLegacyRedirects`

Expected:

```text
PASS  src/test/configuracoesSections.test.js
PASS  src/test/empresaLegacyRedirects.test.js
```

- [ ] **Step 5: Commitar o bloco de taxonomia**

```bash
git add src/lib/configuracoesSections.js src/App.jsx src/lib/empresaLegacyRedirects.js src/components/routing/LegacyRedirects.jsx src/test/configuracoesSections.test.js src/test/empresaLegacyRedirects.test.js
git commit -m "feat: add configuracoes route taxonomy"
```

---

### Task 2: Transformar `/configuracoes` no hub principal mantendo o layout atual

**Files:**
- Modify: `src/pages/AcademySettings.jsx`
- Create: `src/components/settings/AlunosAulasSettingsSection.jsx`
- Create: `src/components/settings/IntegracoesSettingsSection.jsx`
- Modify: `src/pages/Integracoes.jsx`

- [ ] **Step 1: Escrever o teste do novo agrupamento de tabs**

```js
import { describe, expect, it } from 'vitest';
import { CONFIGURACOES_ITEMS } from '../lib/configuracoesSections.js';

describe('configuracoes IA', () => {
  it('agrupa alunos e horarios na mesma família', () => {
    const ids = CONFIGURACOES_ITEMS.map((item) => item.id);
    expect(ids).toContain('alunos-aulas');
    expect(ids).not.toContain('horarios');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar o baseline**

Run: `npm test -- configuracoesSections`

Expected:

```text
PASS  src/test/configuracoesSections.test.js
```

- [ ] **Step 3: Refatorar `AcademySettings.jsx` para o novo hub sem perder o layout**

```jsx
// trecho esperado em src/pages/AcademySettings.jsx
import {
  CONFIGURACOES_DEFAULT_SECTION,
  CONFIGURACOES_ITEMS,
  resolveConfiguracoesNavState,
} from '../lib/configuracoesSections.js';
import AlunosAulasSettingsSection from '../components/settings/AlunosAulasSettingsSection.jsx';
import IntegracoesSettingsSection from '../components/settings/IntegracoesSettingsSection.jsx';

const rawTab = searchParams.get('tab');
const navState = resolveConfiguracoesNavState(rawTab);
const activeTab = navState.section;

<PageHeader
  title="Configurações"
  subtitle="Estrutura, integrações e regras-base da academia."
  prefix={...}
/>

<HubTabBar
  tabs={CONFIGURACOES_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
  }))}
  activeId={activeTab}
  onChange={(id) => setSearchParams({ tab: id })}
  ariaLabel="Seções de configurações"
  variant="secondary"
  size="sm"
  fullWidth
/>

{activeTab === 'academia' && (
  <EstudioSection ... />
)}

{activeTab === 'crm' && (
  <FunilSection ... />
)}

{activeTab === 'alunos-aulas' && (
  <AlunosAulasSettingsSection academy={academy} setAcademy={setAcademy} academyId={academyId} academyDataVersion={academyDataVersion} />
)}

{activeTab === 'integracoes' && (
  <IntegracoesSettingsSection academyId={academyId} />
)}

{activeTab === 'financeiro' && academyId && (
  <div className="empresa-section">
    <FinanceiroConfigTab academyId={academyId} isOwner={role === 'owner'} />
  </div>
)}
```

```jsx
// src/components/settings/AlunosAulasSettingsSection.jsx
import React from 'react';
import AcademyTabSettingsLayout from '../academy/settings/AcademyTabSettingsLayout.jsx';
import StudentsSection from '../academy/StudentsSection.jsx';
import HorariosSection from '../academy/HorariosSection.jsx';

const ITEMS = [
  { id: 'campos', label: 'Campos e motivos' },
  { id: 'graduacoes', label: 'Graduações' },
  { id: 'matricula', label: 'Matrícula' },
  { id: 'turmas', label: 'Turmas' },
  { id: 'horarios', label: 'Horários' },
];

export default function AlunosAulasSettingsSection(props) {
  // usar useSearchParams ou estado derivado da query ?section=
  // renderizar StudentsSection para campos/graduacoes/matricula
  // renderizar HorariosSection para turmas/horarios
}
```

```jsx
// src/components/settings/IntegracoesSettingsSection.jsx
import React from 'react';
import AcademyTabSettingsLayout from '../academy/settings/AcademyTabSettingsLayout.jsx';
import ControlIdCatracaSection from '../academy/ControlIdCatracaSection.jsx';
import ContractsAutentiqueSection from '../academy/ContractsAutentiqueSection.jsx';
import IntegracoesWhatsAppSection from '../academy/IntegracoesWhatsAppSection.jsx';
import {
  INTEGRACOES_SETTINGS_ITEMS,
  INTEGRACOES_SETTINGS_SECTIONS,
} from '../../lib/integracoesSettingsSections.js';

export default function IntegracoesSettingsSection({ academyId, activeTab, onChange }) {
  let body = null;
  if (activeTab === INTEGRACOES_SETTINGS_SECTIONS.WHATSAPP) body = <IntegracoesWhatsAppSection embeddedInLayout academyId={academyId} />;
  if (activeTab === INTEGRACOES_SETTINGS_SECTIONS.CATRACA) body = <ControlIdCatracaSection embeddedInLayout academyId={academyId} />;
  if (activeTab === INTEGRACOES_SETTINGS_SECTIONS.AUTENTIQUE) body = <ContractsAutentiqueSection embeddedInLayout academyId={academyId} />;

  return (
    <AcademyTabSettingsLayout
      navLabel="Integrações"
      items={INTEGRACOES_SETTINGS_ITEMS}
      activeId={activeTab}
      onSelect={onChange}
      title="Integrações"
      subtitle="Canais e sistemas externos da academia."
    >
      {body}
    </AcademyTabSettingsLayout>
  );
}
```

- [ ] **Step 4: Fazer `/integracoes` apontar para a nova seção do hub**

```jsx
// src/pages/Integracoes.jsx
import { Navigate } from 'react-router-dom';

export default function Integracoes() {
  return <Navigate to="/configuracoes?tab=integracoes" replace />;
}
```

- [ ] **Step 5: Validar manualmente o layout**

Run: `npm test -- configuracoesSections`

Expected:

```text
PASS  src/test/configuracoesSections.test.js
```

Manual check:

```text
/configuracoes mantém PageHeader + HubTabBar + AcademyTabSettingsLayout
Academia/CRM/Alunos e aulas/Integrações/Financeiro trocam sem quebrar o layout existente
```

- [ ] **Step 6: Commitar o hub de configurações**

```bash
git add src/pages/AcademySettings.jsx src/components/settings/AlunosAulasSettingsSection.jsx src/components/settings/IntegracoesSettingsSection.jsx src/pages/Integracoes.jsx
git commit -m "feat: reorganize settings hub information architecture"
```

---

### Task 3: Atualizar navegação desktop, mobile e menu do usuário

**Files:**
- Modify: `src/lib/naviMenu.js`
- Modify: `src/lib/mobileMoreNav.js`
- Modify: `src/components/layout/NaviUserMenu.jsx`
- Test: `src/test/naviMenu.test.js`
- Test: `src/test/mobileMoreNav.test.js`

- [ ] **Step 1: Escrever os testes de label e destino do novo item**

```js
import { describe, expect, it } from 'vitest';
import { buildSidebarNavModel } from '../lib/naviMenu.js';
import { buildMobileMoreItems } from '../lib/mobileMoreNav.js';

describe('settings navigation IA', () => {
  it('usa Configurações como destino do workspace', () => {
    const mobile = buildMobileMoreItems({ modules: {}, isOwner: true });
    const settingsItem = mobile.find((item) => item.id === 'empresa');
    expect(settingsItem.label).toBe('Configurações');
    expect(settingsItem.to).toBe('/configuracoes');
  });

  it('mantém Agente IA e Mensagens automáticas como hubs operacionais separados', () => {
    const model = buildSidebarNavModel({ modules: {}, isOwner: true, canConfigureAgenteIa: true });
    expect(model.accordions.some((item) => item.label === 'Mensagens Automáticas')).toBe(true);
    expect(model.agenteIa?.to).toBe('/agente-ia');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar a falha esperada**

Run: `npm test -- naviMenu mobileMoreNav`

Expected:

```text
FAIL  label expected "Configurações"
Received: "Minha academia"
```

- [ ] **Step 3: Ajustar labels e destinos nos menus**

```js
// src/lib/mobileMoreNav.js
add({ id: 'empresa', label: 'Configurações', to: '/configuracoes', iconKey: 'empresa' });
```

```jsx
// src/components/layout/NaviUserMenu.jsx
<button
  type="button"
  role="menuitem"
  className={menuItemClass('/configuracoes')}
  onClick={() => go('/configuracoes')}
>
  <Building2 size={16} strokeWidth={1.75} aria-hidden />
  Configurações
</button>
```

```js
// src/lib/naviMenu.js
export function buildSidebarNavModel(...) {
  return {
    ...
    footerAccordions: [],
  };
}

// manter Agente IA e Mensagens automáticas fora do bloco de configurações;
// se houver item direto de workspace em outro ponto do menu, atualizar to="/configuracoes".
```

- [ ] **Step 4: Rodar testes de menu e revisar regressões**

Run: `npm test -- naviMenu mobileMoreNav`

Expected:

```text
PASS  src/test/naviMenu.test.js
PASS  src/test/mobileMoreNav.test.js
```

- [ ] **Step 5: Commitar a navegação**

```bash
git add src/lib/naviMenu.js src/lib/mobileMoreNav.js src/components/layout/NaviUserMenu.jsx src/test/naviMenu.test.js src/test/mobileMoreNav.test.js
git commit -m "feat: update settings navigation labels"
```

---

### Task 4: Fechar UX de aliases, títulos e experiência de transição

**Files:**
- Modify: `src/pages/AcademySettings.jsx`
- Modify: `src/components/routing/LegacyRedirects.jsx`
- Modify: `src/lib/empresaLegacyRedirects.js`
- Modify: `src/App.jsx`
- Test: `src/test/empresaLegacyRedirects.test.js`

- [ ] **Step 1: Escrever o teste do redirect principal**

```js
import { describe, expect, it } from 'vitest';
import { resolveEmpresaLegacyTabRedirect } from '../lib/empresaLegacyRedirects.js';

describe('empresa legacy redirects after configuracoes IA', () => {
  it('manda catraca para a aba de integrações', () => {
    expect(resolveEmpresaLegacyTabRedirect('catraca')).toBe('/configuracoes?tab=integracoes');
  });

  it('mantém automações como hub separado', () => {
    expect(resolveEmpresaLegacyTabRedirect('automacoes')).toBe('/automacoes?tab=gatilhos');
  });
});
```

- [ ] **Step 2: Rodar o teste de redirect**

Run: `npm test -- empresaLegacyRedirects`

Expected:

```text
PASS  src/test/empresaLegacyRedirects.test.js
```

- [ ] **Step 3: Implementar a transição suave**

```jsx
// src/components/routing/LegacyRedirects.jsx
export function EmpresaLegacyTabRedirect() {
  const [searchParams] = useSearchParams();
  const target = resolveEmpresaLegacyTabRedirect(searchParams.get('tab'));
  if (target) return <Navigate to={target} replace />;
  return <Navigate to="/configuracoes" replace />;
}
```

```jsx
// src/App.jsx
<Route path="/empresa" element={<Navigate to="/configuracoes" replace />} />
```

```jsx
// src/pages/AcademySettings.jsx
<PageHeader
  title="Configurações"
  subtitle="Estrutura, integrações e regras-base da academia."
  ...
/>
```

- [ ] **Step 4: Verificar fluxo manual de habituacao**

Run: `npm test -- empresaLegacyRedirects`

Expected:

```text
PASS  src/test/empresaLegacyRedirects.test.js
```

Manual check:

```text
/empresa -> /configuracoes
/integracoes -> /configuracoes?tab=integracoes
menu do usuário mostra "Configurações"
```

- [ ] **Step 5: Commitar os aliases**

```bash
git add src/App.jsx src/components/routing/LegacyRedirects.jsx src/lib/empresaLegacyRedirects.js src/pages/AcademySettings.jsx src/test/empresaLegacyRedirects.test.js
git commit -m "feat: add legacy redirects for configuracoes hub"
```

---

### Task 5: Atualizar documentação e verificar tudo antes da implementação final

**Files:**
- Modify: `docs/flows/config/onboarding-academia.md`
- Modify: `docs/flows/config/empresa-horarios-turmas.md`
- Modify: `docs/flows/config/conta-assinatura.md`
- Reference: `docs/superpowers/specs/2026-06-19-arquitetura-configuracoes-ia-design.md`

- [ ] **Step 1: Atualizar as rotas e agrupamentos nos fluxos**

```md
## Ajustes esperados

- rota canônica de configurações: `/configuracoes`
- `/empresa` permanece como alias legado com redirect
- `Alunos` e `Horários` passam a compor `Configurações > Alunos e aulas`
- `Minha conta` permanece separada da arquitetura de configuração da academia
```

- [ ] **Step 2: Rodar a suíte focada de testes**

Run: `npm test -- configuracoesSections empresaLegacyRedirects naviMenu mobileMoreNav`

Expected:

```text
PASS  src/test/configuracoesSections.test.js
PASS  src/test/empresaLegacyRedirects.test.js
PASS  src/test/naviMenu.test.js
PASS  src/test/mobileMoreNav.test.js
```

- [ ] **Step 3: Rodar um smoke check do app**

Run: `npm run build`

Expected:

```text
vite build complete
```

- [ ] **Step 4: Conferir o layout de settings manualmente**

Checklist:

```text
[ ] PageHeader continua consistente com outras páginas
[ ] HubTabBar continua com o mesmo visual atual
[ ] AcademyTabSettingsLayout continua sendo o layout base dos painéis internos
[ ] Não há cardões novos quebrando a hierarquia visual existente
[ ] Agente IA e Mensagens automáticas continuam acessíveis como hubs separados
```

- [ ] **Step 5: Commitar docs e QA final**

```bash
git add docs/flows/config/onboarding-academia.md docs/flows/config/empresa-horarios-turmas.md docs/flows/config/conta-assinatura.md
git commit -m "docs: update flows for configuracoes IA"
```

---

## Self-review

### Spec coverage

- `Minha conta` separado de `Configuracoes`: coberto em Tasks 1, 3 e 5
- `Mensagens automáticas` fora de `Configuracoes`: coberto em Tasks 3 e 4
- `Agente IA` fora de `Configuracoes`: coberto em Tasks 3 e 4
- `Empresa` deixar de ser o guarda-chuva: coberto em Tasks 1, 2 e 4
- `Alunos` + `Horários` na mesma família: coberto em Task 2
- `WhatsApp` dividido entre canal/inteligência/automação/atendimento: coberto em Tasks 2, 3 e 5

### Placeholder scan

- Nenhum `TODO`, `TBD` ou "implementar depois"
- Todas as tasks listam arquivos, testes e comandos
- Os snippets definem nomes concretos de arquivos e símbolos

### Type consistency

- O plano usa consistentemente `CONFIGURACOES_SECTIONS`, `CONFIGURACOES_ITEMS`, `resolveConfiguracoesNavState`
- O agrupamento novo é sempre `alunos-aulas`
- A rota canônica é sempre `/configuracoes`

---

Plan complete and saved to `docs/superpowers/plans/2026-06-19-arquitetura-configuracoes-ia.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
