# WhatsApp — Handoff Integrações ↔ Agente IA (TECH)

**Data:** 2026-06-18  
**PRODUCT:** [2026-06-18-whatsapp-integracoes-agente-handoff-PRODUCT.md](./2026-06-18-whatsapp-integracoes-agente-handoff-PRODUCT.md)  
**Status:** rascunho — aguardando implementação

---

## Escopo técnico

Mudanças **frontend** + **docs/flows** no mesmo PR. Sem novas Vercel Functions.

Reutilizar:

- `src/lib/integracoesRoutes.js` — `INTEGRACOES_WHATSAPP_PATH`
- `src/lib/agentIaRoutes.js` — `AGENTE_IA_SETUP_PATH`, `readAgentIaSetupIntent`
- `src/lib/resolveWhatsAppIntegrationStatus.js` — `WA_CONNECTED_STATUSES`, `WA_PAUSED_STATUSES`
- Lógica `isAgentWaSetupStepDone` em `AgenteIASection.jsx` (extrair para módulo compartilhado)

---

## Arquivos (planejado)

| Arquivo | Ação | Notas |
|---------|------|-------|
| `src/lib/waSetupProgress.js` | **Novo** | `isWaSetupStepDone()`, labels stepper, helpers compartilhados |
| `src/lib/agentIaRoutes.js` | Modificar | `AGENTE_IA_FROM_INTEGRACOES_PARAM`, `buildAgentIaSetupPath({ fromIntegracoes })` |
| `src/lib/naviMenu.js` | Modificar | `buildConectarWhatsAppNavItem()` |
| `src/components/layout/NaviSidebarNav.jsx` | Modificar | Render link condicional; estado WA |
| `src/lib/mobileMoreNav.js` | Modificar | Paridade mobile |
| `src/components/academy/WhatsAppSetupStepper.jsx` | **Novo** | Stepper 3 passos reutilizável |
| `src/components/academy/WhatsAppConnectionPanel.jsx` | Modificar | Stepper, banner persistente, reduzir toast duplicado |
| `src/components/academy/IntegracoesWhatsAppSection.jsx` | Modificar | Passar `promptConfigured` / fetch mínimo se necessário |
| `src/components/academy/AgenteIASection.jsx` | Modificar | Header prefix contextual `from=integracoes` |
| `src/components/OnboardingBanner.jsx` | Modificar | Guard `setup_ai`, passo disabled |
| `src/lib/onboardingChecklist.js` | Modificar | Helper `isOnboardingStepDone(id)` se útil |
| `src/hooks/useWaSetupProgress.js` | **Novo** (opcional) | Encapsula zap + prompt flag para nav/sidebar |
| `docs/flows/atendimento/agente-ia-whatsapp.md` | Modificar | Mapa de telas + checklist |
| `docs/flows/config/onboarding-academia.md` | Modificar | Destinos dos passos |
| `docs/flows/VALIDATION.md` | Modificar | Entrada de validação |
| `src/test/waSetupProgress.test.js` | **Novo** | |
| `src/test/naviMenu.test.js` | Modificar | Item Conectar WhatsApp |
| `src/test/onboardingChecklist.test.js` | Modificar | Guard setup_ai |

---

## R1 — Sidebar `Conectar WhatsApp`

### Modelo de nav

```javascript
// naviMenu.js
export function buildConectarWhatsAppNavItem() {
  return {
    id: 'conectar-whatsapp',
    to: INTEGRACOES_WHATSAPP_PATH,
    label: 'Conectar WhatsApp',
    iconKey: 'whatsapp', // ou reutilizar 'agente' / novo ícone Smartphone
  };
}
```

`buildNavModel`: incluir `conectarWhatsApp: owner && !waSetupDone ? buildConectarWhatsAppNavItem() : null`.

### Fonte de `waSetupDone`

Evitar hook Zapster em todo layout:

**Opção A (recomendada):** selector Zustand derivado de `useLeadStore` academy doc (`zapster_instance_id` + status cache) + invalidação via evento existente pós-conexão.

**Opção B:** `useZapsterWhatsAppConnection(academyId, { watchAcademyStatus: true })` apenas em `NaviSidebarNav` — aceitável se dedupe já existir no hook.

**Opção C:** onboarding checklist `connect_whatsapp.done` — rápido mas desatualiza se WA desconectar depois.

**Decisão:** combinar **C para sidebar** (hide link quando checklist done) + **hook status** para reexibir link se `waSetupDone` false após disconnect (listener `useZapsterWhatsAppConnection` no sidebar wrapper ou store sync).

### Active state

```javascript
isDirectNavPath('/integracoes') && searchParams.get('tab') === 'whatsapp'
```

---

## R2 — Onboarding guard

`OnboardingBanner.handleStepNav`:

```javascript
if (stepId === 'setup_ai') {
  const waDone = isStepDone('connect_whatsapp'); // checklist + effective
  if (!waDone) {
    addToast({ type: 'info', message: 'Conecte o WhatsApp em Integrações primeiro.' });
    navigate(INTEGRACOES_WHATSAPP_PATH);
    return;
  }
  navigate(AGENTE_IA_SETUP_PATH);
  return;
}
```

UI lista: render `setup_ai` com `aria-disabled` + estilo muted quando `!connect_whatsapp.done`.

---

## R3 — `WhatsAppSetupStepper`

Props:

```typescript
type Props = {
  waDone: boolean;
  configDone: boolean;
  activeDone: boolean;
  canEditAgent: boolean;
};
```

- Passo 1: sem link (current page).
- Passo 2: `<Link to={AGENTE_IA_SETUP_PATH}>` quando `waDone && canEditAgent`.
- Passo 3: `<Link to="/agente-ia">` quando `configDone`.

Estilos: reutilizar classes `agent-ia-setup-step*` de `agent-ia.css` ou extrair para `whatsapp-setup-stepper.css`.

---

## R4 — Handoff Integrações

### Banner persistente

Condição:

```javascript
const showAgentSetupHandoff =
  isOwner &&
  zap.waConnected &&
  !agentConfigDone;
```

`agentConfigDone` — ordem de preferência:

1. `useLeadStore` onboarding `setup_ai.done`
2. Fallback GET `/api/settings/ai-prompt` campo mínimo `prompt_configured` (só se checklist atrasado)

Evitar fetch em toda montagem: ler checklist primeiro; fetch lazy se `connect_whatsapp.done && !setup_ai.done` após 2 s idle (P1).

### Toast vs banner

Remover toast no effect de transição; manter apenas banner persistente + botão primário no resumo.

---

## R5 — Agente IA prefix

```javascript
const fromIntegracoes =
  readAgentIaSetupIntent(searchParams) ||
  searchParams.get('from') === 'integracoes' ||
  location.state?.fromIntegracoes;

const pageHeaderPrefix = fromIntegracoes ? (
  <Link to={INTEGRACOES_WHATSAPP_PATH}>← Voltar para Integrações</Link>
) : (
  <Link to="/inbox">← Voltar para conversas</Link>
);
```

Links de handoff passam state:

```javascript
<Link to={AGENTE_IA_SETUP_PATH} state={{ fromIntegracoes: true }}>
```

---

## R6 — Extrair `isAgentWaSetupStepDone`

Mover para `src/lib/waSetupProgress.js`:

```javascript
export function isWaSetupStepDone({ waConnected, waStatus, instanceId }) {
  // lógica atual de AgenteIASection
}

export function buildWaAgentJourneyProgress({ waConnected, waStatus, instanceId, promptConfigurado, iaAtiva }) {
  const waDone = isWaSetupStepDone({ waConnected, waStatus, instanceId });
  // retorna { waDone, configDone, activeDone, currentStep } — espelho AgenteIASection
}
```

---

## R7 — Status chip Integrações

Em `WhatsAppConnectionPanel`, chip verde só se `zap.waConnected`; se `waDone && !waConnected` usar accent laranja + copy pausada.

---

## Testes

| Teste | Cobertura |
|-------|-----------|
| `waSetupProgress.test.js` | `isWaSetupStepDone`, journey progress |
| `naviMenu.test.js` | `buildConectarWhatsAppNavItem`, model com/sem item |
| `onboardingChecklist.test.js` | paths + guard behavior (mock navigate) |
| `agentIaRoutes.test.js` | `buildAgentIaSetupPath` com query `from` |
| Manual | Checklist Seção B da PRODUCT |

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Hook Zapster no sidebar aumenta polls | Usar checklist + refresh on focus Integrações/Agente |
| Banner persistente sem prompt API | Checklist `setup_ai` como source of truth v1 |
| Duplicar stepper Agente (2) vs Integrações (3) | Componente compartilhado de **step** visual; labels diferentes por contexto |

---

## Ordem de implementação sugerida

1. `waSetupProgress.js` + testes  
2. `WhatsAppSetupStepper` + Integrações panel (R3, R4)  
3. Onboarding guard (R2)  
4. Sidebar link (R1) + mobile  
5. Agente prefix + link state (R5)  
6. Copy status (R7) + member banner (R8)  
7. Docs flows + VALIDATION (R6)
