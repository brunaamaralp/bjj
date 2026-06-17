# Automações — Clareza P3 (TECH)

**Data:** 2026-06-17  
**Status:** implementado (2026-06-17)  
**PRODUCT:** [2026-06-17-automacoes-ux-clareza-PRODUCT.md](./2026-06-17-automacoes-ux-clareza-PRODUCT.md)

---

## Escopo

Correções de fluxo, redução de banners e polish de layout em `/automacoes`. Sem API nova.

---

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/lib/automacoesCopy.js` | `wizard.step.gatilhos`; `wizard.compact.*.cta` por passo |
| `src/lib/automacoesSetupWizard.js` | scope dismiss storage; `getCompactWizardContent` com cta por passo; step label gatilhos |
| `src/lib/automacoesHub.js` | `WHATSAPP_TEMPLATE_UI_GROUPS` |
| `src/pages/Automacoes.jsx` | CTA compact via `handleWizardStepAction`; `canEdit`; scope dismiss; processos intro |
| `src/components/academy/AutomacoesHubScopeBanner.jsx` | dismiss |
| `src/pages/AutomacoesProcessosTab.jsx` | `showTabIntro`; blocos CSS |
| `src/components/academy/AutomacoesReadinessBanner.jsx` | `hideZapsterStep` |
| `src/components/academy/AutomacoesSection.jsx` | passa `hideZapsterStep` |
| `src/pages/AutomacoesModelosTab.jsx` | render por grupo |
| `src/styles/pipeline.css` | `.automacoes-processos-block`, `.automacoes-modelos-group` |
| `src/test/automacoesSetupWizard.test.js` | compact CTA copy; scope dismiss keys |
| `docs/flows/atendimento/automacoes-funil.md` | checklist P3 |

---

## Decisões

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Compact CTA | Reutilizar `handleWizardStepAction` (mesma lógica do wizard full) |
| D2 | Scope dismiss | `navi_automacoes_scope_dismissed_{academyId}`; limpar ao `reopenGuide` |
| D3 | Member | `canEditWhatsappTemplates` na página hub |
| D4 | Grupos modelos | Mapa estático em `automacoesHub.js` espelhando `AUTOMATION_GROUPS` |

---

## Testes

- `getCompactWizardContent('whatsapp').ctaLabel` contém “Agente IA”
- `read/writeAutomacoesScopeBannerDismissed`
- `resolveWizardSurface` inalterado (regressão)
