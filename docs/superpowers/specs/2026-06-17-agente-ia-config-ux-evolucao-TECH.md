# Agente IA — UX do painel de configurações (TECH)

**Data:** 2026-06-17  
**PRODUCT:** [2026-06-17-agente-ia-config-ux-evolucao-PRODUCT.md](./2026-06-17-agente-ia-config-ux-evolucao-PRODUCT.md)  
**Status:** implementado (P0–P2, 2026-06-17)

---

## Escopo técnico

Mudanças **somente frontend** — sem alteração de contrato API nem novas Vercel Functions.

---

## Arquivos

| Arquivo | Ação | Notas |
|---------|------|-------|
| `src/styles/buttons.css` | Modificado | `.ai-switch` — dimensões, raios, `--color-primary` |
| `src/components/academy/agent-ia.css` | Modificado | `.agent-ia-setting-row*`, `.agent-ia-activate-cta--pause` |
| `src/components/academy/AgenteIASection.jsx` | Modificado | Remove toggle header; `renderServiceControl`; setting-row IA |
| `src/components/academy/AgentIAAdvancedOptions.jsx` | Modificado | setting-row execução automática |
| `src/pages/AcademySettings.jsx` | Modificado | Remove CSS duplicado de `.ai-switch` |
| `docs/flows/atendimento/agente-ia-whatsapp.md` | Pendente | Passo 3: botão vs toggle |
| `src/components/shared/SettingRow.jsx` | Novo | Primitivo `.navi-setting-row` |
| `src/styles/setting-row.css` | Novo | CSS shared + badges |
| `src/lib/agentIaServiceControl.js` | Novo | Lógica pura ativar/pausar/banners |
| `src/components/academy/AgentServiceControl.jsx` | Novo | CTA ativar/pausar |
| `src/components/academy/AgentIaStatusBadge.jsx` | Novo | Badges canônicos |
| `src/test/agentIaServiceControl.test.js` | Novo | |
| `src/test/AgentServiceControl.test.jsx` | Novo | |
| `src/components/academy/StockSettingsSection.jsx` | P1 | SettingRow |
| `src/components/academy/AutomacoesSection.jsx` | P1 | SettingRow |

---

## CSS canônico — `.ai-switch`

Fonte única: `src/styles/buttons.css`.

```css
.ai-switch {
  width: 36px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--color-card-border);
  background: var(--color-content-bg);
}
.ai-switch--on {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.ai-switch-thumb {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  /* off: thumb cinza; on: thumb branco + translateX(16px) */
}
```

**Não duplicar** em `AcademySettings.jsx` ou outros pages com `<style>` inline.

---

## `AgenteIASection` — controle de serviço

Substituir `renderActivateCta` por `renderServiceControl`:

```javascript
// Pseudocódigo
function renderServiceControl() {
  if (!promptConfigurado || !canEditPrompt) return null;
  if (showWizard || showEditor || showTestChat) return null;

  if (!iaAtiva) {
    return (
      <ActivateBlock
        disabled={togglingIa || !zap.waConnected || !aiModuleEnabled}
        hint={!aiModuleEnabled ? IA_OFF_HINT : ACTIVATE_HINT}
        onClick={() => handleToggleIa(true)}
      />
    );
  }

  return (
    <PauseBlock
      disabled={togglingIa}
      onClick={() => handleToggleIa(false)}
    />
  );
}
```

Chamar em **ambos** os ramos `promptConfigurado && !iaAtiva` e `promptConfigurado && iaAtiva`.

`handleToggleIa` permanece inalterado — já valida `canEditPrompt`, `promptConfigurado`, `aiModuleEnabled`.

---

## Setting-row (agente)

```html
<div class="agent-ia-setting-row">
  <div class="agent-ia-setting-row__text">
    <span class="agent-ia-setting-row__label">…</span>
    <span class="agent-ia-setting-row__hint">…</span>
  </div>
  <button role="switch" class="ai-switch …">…</button>
</div>
```

`aria-label` no switch quando o label visível não está no mesmo `label for=`.

---

## Regressões a verificar

| Área | Risco |
|------|-------|
| `AutomacoesSection` | Toggle menor — alinhamento em mobile (`pipeline.css` `.automacoes-trigger-card__head .ai-switch`) |
| `AcademySettings` | Regra `button:not(.ai-switch)` min-height 44px — switch deve continuar excluído |
| `AgentIAAdvancedOptions` | Accordion fechado — setting-row só visível ao expandir |
| A11y | `role="switch"` + `aria-checked` em todos os toggles |

---

## Testes sugeridos (P1)

Arquivo novo ou extensão: `src/components/academy/__tests__/AgenteIASection.serviceControl.test.jsx`

| Caso | Assert |
|------|--------|
| `promptConfigurado`, `!iaAtiva`, `canEditPrompt` | `getByRole('button', { name: /ativar atendimento/i })` presente |
| Mesmo estado | `queryByRole('switch', { name: /atendimento automático/i })` ausente |
| `iaAtiva` | botão pausar presente |
| `!aiModuleEnabled` | ativar disabled + hint IA |
| `showWizard` | sem CTA ativar/pausar |

Mock: `useZapsterWhatsAppConnection`, `fetchWithBillingGuard`, `createSessionJwt`.

---

## Checklist de implementação

### P0

- [x] Redesenho `.ai-switch` em `buttons.css`
- [x] Remover duplicata CSS em `AcademySettings.jsx`
- [x] Remover toggle `iaAtiva` do header
- [x] `renderServiceControl` + pause CTA
- [x] Setting-rows IA + execução automática
- [x] Atualizar `agente-ia-whatsapp.md` e `agente-ia-automacoes.md`
- [x] Atualizar `docs/flows/VALIDATION.md`
- [ ] Validação manual checklist PRODUCT (staging)

### P1

- [x] Consolidar banners (R1-1) — `shouldShowAgentConfigBanner`, hint CTA sem duplicar IA off
- [x] Badges canônicos (R1-2) — `AgentIaStatusBadge`
- [x] Testes — `agentIaServiceControl.test.js`, `AgentServiceControl.test.jsx`
- [x] `SettingRow` + migração estoque/automações

### P2

- [x] `ConfirmDialog` ativar — `buildActivateConfirmDescription`, `showActivateServiceConfirm`
- [x] `ConfirmDialog` pausar — `showPauseServiceConfirm`
- [x] `AgentIaHeaderStatusChip` no `PageHeader.actions`
- [x] Toast ao desligar IA com agente ativo — `AGENT_IA_MODULE_DISABLED_WHILE_ACTIVE_TOAST`
- [x] `.navi-confirm-desc` com `white-space: pre-line` para resumos multilinha
- [x] Testes atualizados (15 passando)
