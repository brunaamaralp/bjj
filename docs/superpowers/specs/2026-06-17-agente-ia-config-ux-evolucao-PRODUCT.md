# Agente IA — UX do painel de configurações

**Data:** 2026-06-17  
**Status:** P0–P2 concluídos (2026-06-17)  
**TECH:** [2026-06-17-agente-ia-config-ux-evolucao-TECH.md](./2026-06-17-agente-ia-config-ux-evolucao-TECH.md)

**Fluxos relacionados:**

- [agente-ia-whatsapp.md](../../flows/atendimento/agente-ia-whatsapp.md)
- [agente-ia-automacoes.md](../../flows/atendimento/agente-ia-automacoes.md)

**Design system:** [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md) · [docs/ux-feedback.md](../../ux-feedback.md)

**Componentes-chave:** `src/components/academy/AgenteIASection.jsx`, `src/components/academy/AgentIAAdvancedOptions.jsx`, `src/styles/buttons.css` (`.ai-switch`), `src/components/academy/agent-ia.css`

---

## Problema

O card **Agente de Atendimento** em `/agente-ia` (e espelho em Configurações da academia) confunde donos e recepcionistas na etapa final de ativação:

| # | Sintoma | Impacto |
|---|---------|---------|
| P1 | **Dois controles** para ligar/desligar o atendimento automático (toggle no header + botão primário no rodapé) | Hesitação (“qual uso?”), cliques duplicados, sensação de interface “quebrada” |
| P2 | **Toggle visualmente pesado** — pill grande, verde neon, thumb circular | Destoa do design system (roxo primário no conteúdo); parece controle de sistema, não preferência |
| P3 | **Hierarquia invertida** — toggle verde competia com CTA roxo de ativação | Ação consequente (responder no WhatsApp) não se destaca |
| P4 | **Estados contraditórios** — badge “Pronto” (verde) + label “pausado” + toggle off na mesma dobra | Usuário não sabe se já está operacional |
| P5 | **Linhas de toggle inconsistentes** — “Recursos de IA” em caixa; demais toggles soltos com label longa | Layout “esticado”, toggle isolado na borda direita |
| P6 | **Densidade de banners** — banner roxo + caixa IA + badge + hint + CTA antes de qualquer edição | Fadiga cognitiva na primeira configuração |

**Quem é afetado:** owner e member com `canEditAgentPrompt` na jornada de setup (passos 2–3: configurar → ativar).

**Custo de não resolver:** medo de “ligar IA sem querer”, abandono após configurar prompt, tickets de suporte (“está ativo ou não?”), percepção de produto amador na área mais visível do módulo de atendimento.

---

## Goals

| # | Meta |
|---|------|
| G1 | **Uma única affordance** para ativar/pausar atendimento automático no card do assistente |
| G2 | Toggle de preferências (**Recursos de IA**, ações automáticas, automações, estoque) alinhado ao design system — compacto, retangular, roxo quando on |
| G3 | Em ≤5 s, usuário distingue **configurado / pronto / ativo / pausado** sem ler três controles |
| G4 | Linhas de configuração binária seguem padrão único (`setting-row`: título + hint + controle) |
| G5 | Ativação de atendimento no WhatsApp tratada como **ação deliberada** (botão), não switch casual |
| G6 | Fluxo `agente-ia-whatsapp.md` e checklist de demo refletem o novo layout |

---

## Non-Goals

- Redesign do wizard guiado (`AgenteChatSetup`) ou do editor manual de prompt.
- Alterar API `PATCH /api/settings/ai-prompt` ou lógica de webhooks Zapster.
- Novo componente shadcn/Radix Switch como dependência — evoluir `.ai-switch` existente.
- Confirmação modal ao ativar/pausar — implementado em P2.
- Unificar `/agente-ia` e aba Agente em Configurações da academia num único layout (fora do escopo desta spec).
- Nova Serverless Function em `/api/`.

---

## Decisões de produto

### 1. Tipos de controle

| Configuração | Controle | Motivo |
|--------------|----------|--------|
| Recursos de IA (módulo) | Toggle em `setting-row` | Preferência reversível, baixo risco |
| Ações automáticas no WhatsApp | Toggle em `setting-row` | Liga/desliga família de opções |
| Automações de funil / lembrete estoque | Toggle existente (mesmo visual) | Consistência cross-módulo |
| **Atendimento automático no WhatsApp** | **Botão primário** (ativar) / **outline** (pausar) | Ação com consequência externa; merece deliberation |

### 2. Visual do toggle (`.ai-switch`)

Substituir estética “pill iOS” por switch **retangular compacto**:

| Propriedade | Antes | Depois |
|-------------|-------|--------|
| Trilho | 48×28px, `border-radius: 999px`, fundo cinza sólido | 36×20px, `border-radius: 4px`, borda + fundo branco |
| Thumb | 22px círculo | 14px quadrado (`border-radius: 3px`) |
| Estado on | Verde `--accent` | Roxo `--color-primary` |
| Foco | — | `outline` 2px `--color-primary` |

### 3. Hierarquia do card (estado “pronto, pausado”)

```
[Banner configuração — só enquanto não ativo]

[Setting-row: Recursos de IA                    [toggle]]

🤖 Agente de Atendimento

   ● Pronto — ative para começar a atender
   Atualizado em …

   [Editar manualmente] [Refazer guiada] [Testar]

   ─────────────────────────────────────
   Último passo: ative para responder no WhatsApp.
   [ Ativar atendimento automático ]        ← único controle de ativação
```

Estado **ativo**:

```
   ● Ativo — Respondendo automaticamente no WhatsApp
   [Editar] [Refazer] [Testar]
   ─────────────────────────────────────
   [ Pausar atendimento automático ]        ← outline, não toggle
```

---

## User stories

### Owner / admin da academia

- Como **dono da academia**, quero **um botão claro para ativar o assistente** para não duvidar se já liguei o atendimento no WhatsApp.
- Como **dono**, quero **pausar o atendimento sem apagar as instruções** para desligar temporariamente em feriados ou manutenção.
- Como **dono**, quero **ver se os recursos de IA estão ligados** separado do atendimento automático, para usar copilot sem responder clientes sozinho.
- Como **dono**, quero **saber por que não posso ativar** (IA off, WhatsApp desconectado, prompt incompleto) em uma frase, não em três lugares.

### Member com permissão de edição

- Como **recepcionista autorizada**, quero **testar o assistente** sem confundir o botão de teste com o de ativar produção.

### Member somente leitura

- Como **member sem `canEditAgentPrompt`**, quero **ver status (ativo/pausado)** sem toggles ou botões desabilitados que pareçam clicáveis.

---

## Requisitos

### P0 — Must-have (núcleo desta spec)

#### R0-1 — Remover toggle redundante do header do agente

**Comportamento:** O header do card exibe apenas ícone + título “Agente de Atendimento”. Não há `role="switch"` para `ia_ativa` no header.

**Aceite:**

- [ ] Nenhum `.ai-switch` associado a `iaAtiva` no bloco do título
- [ ] Ativar chama `handleToggleIa(true)` só pelo botão primário
- [ ] Pausar chama `handleToggleIa(false)` pelo botão outline no rodapé

**Status:** implementado (2026-06-17).

**Aceite:**

- [x] Nenhum `.ai-switch` associado a `iaAtiva` no bloco do título
- [x] Ativar chama `handleToggleIa(true)` só pelo botão primário
- [x] Pausar chama `handleToggleIa(false)` pelo botão outline no rodapé

#### R0-2 — Redesenho global `.ai-switch`

**Aceite:**

- [ ] Dimensões e raios conforme tabela em “Decisões de produto §2”
- [ ] Estado on usa `--color-primary`, não `--accent`
- [ ] `:focus-visible` acessível
- [ ] CSS canônico só em `src/styles/buttons.css` (remover duplicata inline em `AcademySettings.jsx`)

**Status:** implementado em `buttons.css` + remoção duplicata em `AcademySettings.jsx`.

#### R0-3 — Setting-row para toggles do card Agente IA

**Comportamento:** Classe `.agent-ia-setting-row` com `__label` + `__hint` + controle à direita.

**Aceite:**

- [ ] “Recursos de IA”: label curta + hint na segunda linha
- [ ] “Execução automática” em `AgentIAAdvancedOptions` usa o mesmo padrão
- [ ] Toggle alinhado à direita sem `flex: 1` no label empurrando controle

**Status:** implementado em `agent-ia.css`, `AgenteIASection.jsx`, `AgentIAAdvancedOptions.jsx`.

#### R0-4 — Controle de serviço unificado (`renderServiceControl`)

**Comportamento:**

| `iaAtiva` | UI |
|-----------|-----|
| `false` + prompt OK | Hint + `btn-primary` “Ativar atendimento automático” |
| `false` + `!aiModuleEnabled` | Hint específico + botão disabled |
| `false` + `!waConnected` | Hint WhatsApp + botão disabled |
| `true` | `btn-outline` “Pausar atendimento automático” |

**Aceite:**

- [ ] Não renderizar CTA de ativação durante wizard, editor ou chat de teste abertos
- [ ] `canEditPrompt === false` → sem CTA de ativar/pausar

**Status:** implementado em `AgenteIASection.jsx`.

#### R0-5 — Atualizar fluxo documentado

**Aceite:**

- [x] `docs/flows/atendimento/agente-ia-whatsapp.md` — passo 3 descreve botão, não toggle
- [x] Checklist Seção A do fluxo revisada (15 itens)
- [x] `docs/flows/VALIDATION.md` alinhado

**Status:** implementado (2026-06-17).

---

### P1 — Should-have (polish pós-P0)

#### R1-1 — Consolidar banners informativos

**Comportamento:** No card assistente, no máximo **2** blocos informativos empilhados antes do conteúdo acionável (banner roxo de config + um de readonly/IA off).

**Aceite:**

- [x] Com `aiModuleEnabled === false`, banner readonly substitui hint redundante no CTA quando possível
- [x] Banner “Ambiente de configuração” oculto quando `iaAtiva === true`

#### R1-2 — Badge de status canônico

**Comportamento:** Um único badge por estado:

| Estado | Badge | Cor |
|--------|-------|-----|
| Não configurado | Não configurado | neutro |
| Configurado, pausado | Pronto para ativar | verde suave |
| Ativo | Ativo | roxo surface |
| Ativo + WA offline | Ativo — WhatsApp desconectado | warning |

**Aceite:**

- [x] Remover copy “Atendimento automático pausado” que existia ao lado do toggle antigo
- [x] Badge e CTA não repetem a mesma frase

#### R1-3 — Setting-row reutilizável em outros módulos

**Comportamento:** Extrair padrão para `src/components/shared/SettingRow.jsx` + `.navi-setting-row` em `setting-row.css`.

**Aceite:**

- [x] `StockSettingsSection` e `AutomacoesSection` migram para o mesmo layout (sem mudar comportamento)

#### R1-4 — Testes de regressão UI

**Aceite:**

- [x] Teste RTL: card configurado + pausado renderiza botão ativar, sem switch de `iaAtiva`
- [x] Teste: `aiModuleEnabled` false desabilita botão ativar com hint correto

---

### P2 — Confirmações e status no header

#### R2-1 — Confirmação ao ativar

`ConfirmDialog` ao clicar “Ativar atendimento automático”: resumo (número WA, limite de threads se aplicável).

**Aceite:**

- [x] Diálogo com número WA quando disponível
- [x] Aviso quando limite de threads atingido no ciclo

#### R2-2 — Confirmação ao pausar

Evitar pausa acidental em produção.

**Aceite:**

- [x] `ConfirmDialog` antes de `handleToggleIa(false)`

#### R2-3 — Status compacto no `PageHeader` de `/agente-ia`

Chip “Assistente ativo” / “Pausado” visível ao rolar.

**Aceite:**

- [x] Chip em `PageHeader.actions` quando `promptConfigurado`
- [x] Variantes visualmente distintas (ativo roxo, pausado neutro)

#### R2-4 — Desligar “Recursos de IA” com assistente ativo

Desligar IA auto-pausa agente com toast explicativo.

**Aceite:**

- [x] `setIaAtiva(false)` ao desligar módulo
- [x] Toast info quando agente estava ativo: *"Recursos de IA desativados. O atendimento automático foi pausado."*

---

### P2 — Future considerations (arquivado)

Itens acima implementados em 2026-06-17. Sem P3 planejado nesta spec.

---

## Estados e edge cases

| Cenário | Comportamento esperado |
|---------|------------------------|
| Prompt incompleto | Sem CTA ativar; fluxo guiado ou editor |
| IA off | CTA ativar disabled + hint “Ative os recursos de IA acima” |
| WA desconectado | CTA ativar disabled + hint conectar card 1 |
| `togglingIa` | Botões com loading (“Ativando…” / “Pausando…”) |
| Limite de threads atingido | Warning abaixo do status; não remove botão pausar |
| Wizard / editor / teste abertos | `renderServiceControl` oculto |
| Member readonly | Vê badge de status; sem toggles de edição |

---

## Copy canônica

| Contexto | Texto |
|----------|-------|
| Banner config | Ambiente de configuração — nada aqui vai para alunos até ativar e conectar WhatsApp. |
| Setting IA label | Recursos de IA |
| Setting IA hint | Barra ⌘K, copilot, imports assistidos, sandbox |
| CTA ativar hint | Último passo: ative para o assistente responder automaticamente no WhatsApp. |
| CTA ativar | Ativar atendimento automático |
| CTA pausar | Pausar atendimento automático |
| Badge pronto | ● Pronto para ativar |
| Badge ativo | ● Ativo |
| Hint IA off no CTA | Ative os recursos de IA acima para ligar o atendimento automático. |

---

## Success metrics

### Leading (1–2 semanas pós-deploy)

| Métrica | Baseline | Meta |
|---------|----------|------|
| Tempo médio do passo “prompt salvo” → `ia_ativa=true` | medir via analytics / session replay | −20% |
| Cliques duplicados ativar (dois controles na mesma sessão) | esperado >0 hoje | 0 |
| Taxa de abandono na página com `promptConfigurado` e `!iaAtiva` | TBD | −15% |

### Lagging (30–60 dias)

| Métrica | Meta |
|---------|------|
| Tickets suporte “assistente ligado ou não?” | −30% |
| % academias com `ia_ativa` em 7 dias após primeiro prompt salvo | +10 pp |

---

## Validação manual

1. [ ] `/agente-ia` — prompt configurado, IA on, WA on: só botão roxo “Ativar”; sem toggle no header
2. [ ] Após ativar: badge “Ativo” + botão outline “Pausar”; sem toggle
3. [ ] IA off: toggle master off; CTA ativar disabled com hint correto
4. [ ] Toggles em Automacoes e Estoque: visual retangular roxo (regressão)
5. [ ] `AgentIAAdvancedOptions` → execução automática com setting-row
6. [ ] Teclado: Tab foca toggle; Space alterna; focus ring visível
7. [ ] Mobile: setting-row não quebra toggle para linha órfã

---

## Open questions

| # | Pergunta | Dono |
|---|----------|------|
| Q1 | Banner “Ambiente de configuração” some ao ativar ou permanece discreto? | Produto |
| Q2 | Pausar exige `ConfirmDialog`? | **Sim** — implementado P2 |
| Q3 | Desligar “Recursos de IA” deve auto-pausar agente? | Eng + Produto |
| Q4 | Extrair `SettingRow` shared agora ou só CSS? | Eng |

---

## Fases de entrega

| Fase | Escopo | Entregáveis |
|------|--------|-------------|
| **P0** | Redundância + toggle visual + setting-rows agente | Código ✓, fluxo doc ✓, validação manual staging |
| **P1** | Banners, badges, testes, setting-row shared | Implementado ✓ |
| **P2** | Confirmações, header chip, IA off auto-pausa | Implementado ✓ |

---

## Governança

Atualizar no mesmo PR que concluir P0:

- `docs/flows/atendimento/agente-ia-whatsapp.md` — mapa de telas passo 7
- `docs/flows/VALIDATION.md` — se checklist divergir após QA
