# Automações — Clareza P3 (pós-auditoria UX)

**Data:** 2026-06-17  
**Status:** implementado (2026-06-17)  
**TECH:** [2026-06-17-automacoes-ux-clareza-TECH.md](./2026-06-17-automacoes-ux-clareza-TECH.md)

**Specs anteriores:** [2026-06-16-automacoes-ux-onboarding-PRODUCT.md](./2026-06-16-automacoes-ux-onboarding-PRODUCT.md)

**Fluxo:** [automacoes-funil.md](../../flows/atendimento/automacoes-funil.md)

---

## Problema

Após P0–P2, o hub `/automacoes` ainda confunde usuários por:

1. **Bug:** wizard compact na aba Processos, passo WhatsApp, envia para Modelos em vez de Agente IA.
2. **Ruído:** até 3 avisos sobre WhatsApp na aba Processos (scope + compact + tab intro).
3. **Duplicidade:** Configurações com WA offline mostra `ZapsterOfflineBanner` **e** passo Zapster no readiness.
4. **Nomenclatura:** passo do wizard “Configurações” = nome da aba — ambiguidade.
5. **Densidade:** aba Processos sem separação visual; Modelos sem agrupamento como Config.
6. **Member:** vê wizard e ack sem poder agir.
7. **Power user:** scope banner permanente sem dispensar.

---

## Goals

| # | Meta |
|---|------|
| G1 | CTA do wizard compact sempre leva ao destino correto do passo atual |
| G2 | Máximo **2** banners educativos empilhados em qualquer aba |
| G3 | Um único aviso de WhatsApp offline na Configurações |
| G4 | Passo 3 do wizard legível como “Ativar gatilhos” |
| G5 | Member não vê wizard nem é redirecionado pelo guia |
| G6 | Processos e Modelos com hierarquia visual clara |

---

## Non-Goals

- Sub-nav “Equipe \| WhatsApp” (futuro).
- Link de status WA no `PageHeader` (futuro).
- Alterar backend de envio ou cron.
- Nova Serverless Function.

---

## Requisitos

### R3-1 — CTA compact correto

| Passo | Ação do CTA |
|-------|-------------|
| modelos | `?tab=modelos` |
| whatsapp | navegar `/agente-ia` |
| configuracoes | `?tab=configuracoes` |

Labels: usar copy específica por passo (`Abrir Agente IA`, `Ir para Modelos`, etc.).

### R3-2 — Menos banners na aba Processos

- Omitir `AutomacoesTabIntroBanner` quando `wizardSurface === 'compact'`.
- Manter scope banner (dispensível — R3-5).

### R3-3 — WhatsApp offline unificado

- Manter `AutomacoesZapsterOfflineBanner` como aviso primário.
- Ocultar passo `zapster` em `AutomacoesReadinessBanner` quando o banner offline estiver visível.

### R3-4 — Renomear passo 3 do wizard

- Label pill: **Ativar gatilhos**
- Título do painel: inalterado (“Ative os gatilhos”).

### R3-5 — Scope banner dispensável

- Botão “Entendi” por academia (`localStorage`).
- Reaparece se usuário clicar “Ver guia de configuração” (reabre educação).

### R3-6 — Member sem wizard

- `canEditWhatsappTemplates === false` → não renderizar wizard full/compact/complete; não forçar redirect de aba pelo guia.

### R3-7 — Aba Processos com blocos

- Separadores visuais entre: templates de tarefa, playbook, follow-up pós-matrícula.

### R3-8 — Modelos agrupados

- Grupos alinhados à Config: **Captação e funil** + **Rotinas diárias**.
- Busca filtra dentro dos grupos; grupos vazios ocultos.

---

## Critérios de aceite

1. Compact no passo WhatsApp → `/agente-ia` (teste ou manual).
2. Processos com wizard compact: no máximo 2 banners (scope + compact).
3. Config WA offline: 1 aviso warning de desconexão (banner dedicado).
4. Member abre `/automacoes` sem wizard.
5. `npm test -- automacoesSetupWizard automacoesHub automationUx` verde.
6. Fluxo `automacoes-funil.md` atualizado.

---

## Validação manual

1. [ ] Processos + passo WA pendente → compact “Abrir Agente IA” → `/agente-ia`
2. [ ] Processos sem tab intro duplicado quando compact visível
3. [ ] Config offline → banner warning único + readiness sem linha Zapster
4. [ ] Dispensar scope banner → some até reabrir guia
5. [ ] Member: sem wizard, abas funcionam
6. [ ] Modelos: seções Captação / Rotinas visíveis
