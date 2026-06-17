# Mensagens do funil — Hub unificado (texto + gatilho na mesma tela)

**Data:** 2026-06-17  
**Status:** proposta (aguardando aprovação) — **detalhamento Ondas 1–2** da spec mestre  
**Spec mestre (roadmap):** [2026-06-17-comunicacao-automatica-evolucao-PRODUCT.md](./2026-06-17-comunicacao-automatica-evolucao-PRODUCT.md)

**Origem:** feedback de produto — configurar mensagem e ativar envio automático no mesmo lugar; opção explícita de “só manual”; **personalizar ao máximo** para não enviar mensagem errada ao público errado.

**Specs relacionadas:**

- [2026-06-17-automacoes-ia-restructure-PRODUCT.md](./2026-06-17-automacoes-ia-restructure-PRODUCT.md) (estado atual P4.1)
- [2026-06-17-automacoes-ux-clareza-PRODUCT.md](./2026-06-17-automacoes-ux-clareza-PRODUCT.md)
- [2026-06-16-automacoes-ux-onboarding-PRODUCT.md](./2026-06-16-automacoes-ux-onboarding-PRODUCT.md)

**Fluxo afetado:** [automacoes-funil.md](../../flows/atendimento/automacoes-funil.md)

**Arquivos-chave hoje:** `src/pages/Automacoes.jsx`, `AutomacoesModelosTab.jsx`, `AutomacoesConfigTab.jsx`, `AutomacoesSection.jsx`, `automacoesSettingsSections.js`, `automacoesHub.js`

---

## Problema

O hub `/automacoes` separa **Modelos** (biblioteca de textos) e **Gatilhos** (liga/desliga + timing). Isso reflete a arquitetura técnica (`whatsappTemplates` vs `automationsConfig`), mas **não reflete a intenção do usuário**:

> “Quero configurar a mensagem de aniversário e já decidir se ela sai sozinha ou só quando eu mandar.”

**Sintomas observados:**

1. Usuário edita o texto em Modelos e não sabe onde ativar o envio (link cruzado no card de aniversário é um band-aid).
2. “Modelo configurado” é confundido com “vai enviar automaticamente” — na prática, gatilho off + texto salvo já é “só manual”, mas a UI não nomeia isso.
3. Dois lugares para a mesma jornada aumentam abandono do wizard e perguntas de suporte (“onde ligo o lembrete?”).
4. Power users que só querem ligar/desligar tudo precisam navegar por abas diferentes da sidebar.

**Impacto:** fricção na primeira configuração, medo de spam (ativar sem perceber), retrabalho ao ajustar texto + gatilho — e **risco reputacional** de WhatsApp inadequado (cobrança para quem já paga no cartão, funil para aluno matriculado, texto genérico com variável errada).

---

## Norte do produto

> **Comunicação automática só quando a academia entende e controla o quê, para quem, quando e em que modo** — com caminho seguro para testar antes de “armar” o envio.

Personalização máxima **não** significa dezenas de telas: significa **um card por mensagem** com quatro decisões explícitas antes de qualquer disparo:

| Decisão | Pergunta do usuário | Default seguro |
|---------|---------------------|----------------|
| **O quê** | Qual texto exatamente? | Preview com lead/aluno de exemplo; variáveis validadas |
| **Para quem** | Quais planos / quem excluir? | Audiência estreita; excluir cartão automático em cobrança |
| **Quando** | Imediato, X h antes, N dias? | Opções fechadas (não horário livre no v1) |
| **Como** | Desligado · Só manual · Automático | **Desligado** ou **Só manual** até o usuário optar por Automático |

**Postura:** o sistema **não presume** que a academia quer tudo ligado. Opt-in por mensagem, por público e por modo.

---

## Princípio de design

**Uma mensagem = um card.** Cada card reúne:

| Camada | O que o usuário vê |
|--------|-------------------|
| **Texto** | Editor, variáveis, preview, testar no WhatsApp |
| **Para quem** | Planos, excluir recorrente cartão, estimativa de alcance |
| **Modo de envio** | Desligado · Só manual · Automático |
| **Quando** (se Automático) | Regra do gatilho + antecedência/atraso quando aplicável |
| **Transparência** | Quem recebe, quando dispara, o que pode bloquear o envio |

O backend **não muda o modelo de dados** na fase 1: o card apenas **orquestra** `whatsappTemplates[key]` e `automationsConfig[triggerKey]` na mesma superfície.

### Camadas anti-erro (RU-SAFE)

| Camada | Comportamento |
|--------|----------------|
| **S1 — Opt-in explícito** | Nenhuma mensagem em Automático sem texto válido + confirmação na primeira ativação (“Entendo que isso envia para N alunos”) |
| **S2 — Preview obrigatório** | Antes de Automático: preview renderizado visível; link “Testar no WhatsApp” destacado |
| **S3 — Audiência visível** | Resumo “~12 alunos · exclui 8 (cartão auto)” no card; mudança de plano no Financeiro invalida cache com aviso |
| **S4 — Modo Só manual** | Texto salvo e usável no Inbox **sem** disparo cron/evento — padrão recomendado no wizard |
| **S5 — Gate WhatsApp** | Sem conversa recente (30 dias): envio proativo bloqueado; card mostra “pode não entregar” em vez de falhar silenciosamente |
| **S6 — Resumo armado** | Seção Resumo lista só mensagens em Automático; um clique desliga todas (pânico operacional) |
| **S7 — Ativação gradual** (P2) | Opcional: primeira semana só manual + log “teria enviado para X” antes de Automático real |

**Non-goal ajustado:** aprovação humana **por envio** (P2, RU-16) permanece futura; **S7 dry-run** cobre medo de “liguei errado” sem bloquear operação diária.

---

## Goals

| # | Meta |
|---|------|
| G1 | Usuário configura texto e modo de envio **sem trocar de aba** |
| G2 | Modo **Só manual** explícito e compreensível (gatilho off, texto disponível no Inbox) |
| G3 | Casos 1:1 (aniversário) configuráveis em **um único card** |
| G4 | Casos N:1 (um template, vários gatilhos) permanecem claros — sem duplicar texto |
| G5 | Visão resumo: quantas mensagens automáticas estão ativas + status WhatsApp |
| G6 | Wizard simplificado para refletir a tela unificada |
| G7 | URLs legadas (`?tab=modelos`, `?tab=gatilhos`) continuam funcionando via redirect |
| G8 | Lembretes de mensalidade (hoje em Financeiro) configuráveis na seção **Rotinas**, com mesmo padrão de card |
| G9 | **Audiência por plano** — incluindo excluir alunos de plano com cobrança automática no cartão |
| G10 | **Segurança operacional** — preview, estimativa de público, opt-in por mensagem, resumo do que está “armado” |

---

## Non-Goals

- Criar novos templates ou novos gatilhos além dos 7 + 8 atuais do funil (financeiro: 2 cards fixos).
- Mesclar `financeConfig` com `automationsConfig` no banco na fase 1 (ver **Rotinas financeiras**).
- Alterar cron, fila `pending_automations` ou lógica Zapster do funil.
- Nova Serverless Function em `/api/`.
- Playbook / Processos da equipe (`/tarefas?tab=processos`).
- Modo “semi-automático” com aprovação humana antes de cada envio (futuro).

---

## Estado alvo — arquitetura de informação

### Remover a split Modelos | Gatilhos

Substituir as 5 entradas atuais da sidebar (`Modelos · Captação`, `Modelos · Rotinas`, `Gatilhos · …`) por **3 seções operacionais** + **1 resumo**:

| Nav (sidebar) | Slug `?section=` | Conteúdo |
|---------------|------------------|----------|
| **Resumo** | `resumo` | Status WA, contagem ativa, atalhos, wizard |
| **Captação** | `captacao` | 6 cards de mensagem do funil |
| **Pós-matrícula** | `pos-matricula` | 1 card |
| **Rotinas** | `rotinas` | Aniversário + lembretes de mensalidade (se módulo financeiro ativo) |

**Rota canônica:** `/automacoes?section=captacao` (default `resumo` se wizard incompleto; `captacao` se wizard completo — ver RU-8).

**Redirects:**

| Legado | Redirect |
|--------|----------|
| `?tab=modelos&section=captacao` | `?section=captacao` |
| `?tab=modelos&section=rotinas` | `?section=rotinas` |
| `?tab=gatilhos&section=*` | `?section=<mesmo slug>` |
| `?tab=configuracoes` | `?section=captacao` (já existe alias parcial) |

`tab` deixa de ser parâmetro canônico; se presente, apenas para redirect 301/replace.

### PageHeader (ampliado)

- **Título:** Mensagens automáticas *(alinha ao menu lateral; substitui “Mensagens do funil”)*  
- **Subtitle:** Textos e envios automáticos de WhatsApp — funil, rotinas e cobrança — quando o número está conectado no Agente IA.

---

## Modelo de card — tipos

### Tipo A — Card gatilho (trigger-led)

Um card por entrada em `AUTOMATION_LABELS`, exceto quando Tipo B se aplica.

**Estrutura:**

```
┌─────────────────────────────────────────────────────────────┐
│ Lembrete de aula                    [ Automático ▾ ]  (•)   │
│ Cron → antes do horário da aula                               │
├─────────────────────────────────────────────────────────────┤
│ ▼ Texto da mensagem                                          │
│   [editor]  variáveis  preview  Testar no WhatsApp           │
│   Modelo: Lembrete (recomendado) ▾   Antecedência: 2h ▾      │
│   ⚠ Este texto é compartilhado com: Matrícula realizada      │  ← só se template compartilhado
└─────────────────────────────────────────────────────────────┘
```

**Campos:**

| Campo | Comportamento |
|-------|---------------|
| **Modo de envio** | Select ou segmented control (ver RU-1) |
| **Texto** | Edita `whatsappTemplates[templateKey]`; salvar no card ou auto-save debounced |
| **Modelo vinculado** | Select quando `templateKey` ≠ default 1:1 ou usuário quer trocar template |
| **Timing** | Select de `delayMinutes` quando `AUTOMATION_DELAY_OPTIONS[key]` existe |
| **Preview** | Lead de exemplo (picker global da seção ou por card) |

**Mapeamento card → dados:**

| Card (gatilho) | `templateKey` default | Timing |
|----------------|----------------------|--------|
| Agendamento confirmado | `confirm` | Imediato |
| Presença confirmada | `post_class` | Imediato |
| Não compareceu | `missed` | Imediato |
| Aguardando decisão | `recovery` | 12h / 1d / 2d / 3d |
| Retorno D+1 (compareceu) | `dashboard_contact` | Imediato (cron) |
| Lembrete de aula | `reminder` | 2h / 4h / 24h antes |
| Matrícula realizada | `confirm` | Imediato |

### Tipo B — Card mensagem (template-led, 1:1)

Quando **um único gatilho** usa **um único template** de forma estável e o usuário pensa na “mensagem”, não no “evento”:

| Card | Gatilho | Template |
|------|---------|----------|
| Aniversário do aluno | `birthday` | `birthday` |

**Diferença:** sem select de modelo; toggle/modo diretamente no header. Timing fixo: “Diário ~9h (Brasília)” — somente leitura.

**Critério para Tipo B:** `recommendedTemplateKeyForAutomation(key) === templateKey` **e** nenhum outro gatilho ativo usa o mesmo `templateKey` por padrão **e** produto confirma mental model 1:1. Fase 1: **apenas `birthday`**. Fase 2: avaliar `missed`, `post_class`.

### Tipo D — Card financeiro (rotina de cobrança)

Lembretes hoje em `Empresa → Financeiro → Lembretes WhatsApp` (`financeConfig.whatsappReminders`), enviados pelo cron `finance-whatsapp-alerts`.

| Card | Chave config | Quando dispara |
|------|--------------|----------------|
| **Lembrete de vencimento** | `dueSoon` | Cron diário — mensalidade vence em N dias (1–7) |
| **Lembrete de atraso** | `overdue` | Cron diário — mensalidade venceu há N dias (1–7) |

**Estrutura do card (igual ao hub unificado):**

```
┌─────────────────────────────────────────────────────────────┐
│ Lembrete de vencimento              [ Automático ▾ ]          │
│ Cron diário · mensalidades próximas do vencimento           │
├─────────────────────────────────────────────────────────────┤
│ ▼ Texto da mensagem                                          │
│   [editor]  {{nome}}, {{valor}}, …  preview                  │
│   Enviar: [ 3 ] dias antes do vencimento                     │
│   ℹ Não cria conversa no Inbox. Não altera a régua de tarefas.│
│   🔗 Ver mensalidades em Financeiro                          │
└─────────────────────────────────────────────────────────────┘
```

**Persistência (fase 1 — adapter UI):**

- Leitura/escrita continua em `academy.financeConfig.whatsappReminders` via API/patch financeiro existente.
- **Não** mover para `whatsappTemplates` / `automationsConfig` no P0/P1.
- Cards Tipo D reutilizam componente visual dos cards Tipo B; lógica em `FinanceReminderMessageCard` que delega a `normalizeWhatsappRemindersConfig`.

**Modo de envio (mapeamento):**

| Modo UI | `dueSoon.enabled` / `overdue.enabled` |
|---------|--------------------------------------|
| Desligado | `false` (mensagem pode ser apagada ou mantida — igual hoje) |
| Só manual | `false` + badge “Cobrar manualmente pelo Inbox ou WhatsApp” |
| Automático | `true` |

**Gates e diferenças vs funil:**

| Aspecto | Funil (Tipo A/B) | Financeiro (Tipo D) |
|---------|------------------|---------------------|
| Dados | `whatsappTemplates` + `automationsConfig` | `financeConfig.whatsappReminders` |
| Placeholders | `{primeiroNome}`, `{dataAula}`, … | `{{nome}}`, `{{valor}}`, `{{vencimento}}`, … |
| Cron | `automations-frequent` + eventos funil | `reset-usage?action=finance-whatsapp-alerts` |
| Destinatário | Lead / aluno (funil) | Aluno com mensalidade elegível |
| Inbox | Pode abrir conversa (funil) | **Não** cria conversa (comportamento atual) |
| Módulo | Sempre visível | Card só se `academyHasFinanceModule` |
| Preview | Lead de exemplo do funil | Aluno fictício com valor/vencimento de exemplo |

**Seção Rotinas — hierarquia visual:**

1. **Rotinas da academia** — Aniversário (Tipo B)  
2. **Cobrança** *(subheader, se financeiro ativo)* — Vencimento + Atraso (Tipo D)  
3. Se financeiro desativado: subheader omitido + link “Ativar módulo financeiro” → `/empresa?tab=financeiro`

**Redirect legado:**

- `/empresa?tab=financeiro&section=lembretes-whatsapp` → `/automacoes?section=rotinas#financeiro` (replace) + toast único na sessão: “Lembretes de mensalidade agora ficam em Mensagens automáticas → Rotinas.”
- Manter entrada **fantasma** ou link “Configurar em Mensagens automáticas” na sidebar do Financeiro por 1 release (deprecação suave).

**Por que Rotinas e não Captação/Pós-matrícula:**

- Não dependem de evento no funil (igual aniversário).
- Disparo por **data** (vencimento) via cron diário.
- Usuário pensa “rotina que roda sozinha”, não “etapa do lead”.

### Tipo C — Template compartilhado (meta-card opcional, P2)

Quando o usuário edita `confirm` a partir do card “Agendamento confirmado”, outro card (“Matrícula realizada”) que aponta para o mesmo `templateKey` deve:

1. Mostrar banner **“Texto compartilhado”** com link para o outro card.
2. Oferecer **“Usar texto diferente”** → troca só o `templateKey` daquele gatilho para outro modelo existente (não duplica storage).

Não criar editor duplicado do mesmo `confirm` em dois cards expandidos ao mesmo tempo (accordion: um aberto por templateKey).

---

## Modo de envio (RU-1)

Três estados explícitos na UI; mapeamento técnico:

| Modo (UI) | `automationsConfig[key].active` | Texto salvo | Uso no Inbox / manual |
|-----------|--------------------------------|-------------|------------------------|
| **Desligado** | `false` | pode estar vazio ou salvo | templates **não** sugeridos como “ativos” no card; Inbox ainda lista se texto existir |
| **Só manual** | `false` | obrigatório não-vazio para salvar modo | Badge “Disponível no Inbox”; gatilho off |
| **Automático** | `true` | obrigatório não-vazio + WA conectado | Dispara por regra/cron |

**Regras:**

- Trocar para **Automático** sem texto válido → bloquear com mensagem inline (não toast genérico).
- Trocar para **Automático** com WA offline → permitir salvar intenção, badge **“Pendente: conectar WhatsApp”** + link `/agente-ia`.
- **Desligado** vs **Só manual**: ambos `active: false`; diferença é **copy + badge** (Só manual deixa claro que o texto serve para envio pela equipe).

**Decisão de copy (proposta):**

| Modo | Label | Hint |
|------|-------|------|
| Desligado | Desligado | Não envia e não aparece como atalho prioritário |
| Só manual | Só manual | Equipe envia pelo Inbox ou WhatsApp Web |
| Automático | Automático | Envia sozinho quando a regra disparar |

---

## Audiência — para quem enviar (RU-AUD)

Hoje o sistema **não permite** escolher plano ou tipo de cobrança na UI de mensagens automáticas. A elegibilidade é fixa no backend (matriculado, pendência, dias sem check-in, etc.).

**Requisito de produto:** cada card com modo **Automático** (ou **Só manual** para preview de escopo) expõe bloco **“Para quem”**, para a academia direcionar mensagens — inclusive **excluir** alunos de plano recorrente com cartão automático.

### Dimensões de audiência

| Dimensão | Descrição | Fonte de dados |
|----------|-----------|----------------|
| **Planos** | Multi-select dos planos em `financeConfig.plans` (nome canônico = `student.plan`) | Já existe no cadastro do aluno |
| **Modo de cobrança do plano** | Manual (PIX/balcão/link avulso) vs **Recorrente automático** (cartão em assinatura) | **Novo** em definição do plano + metadado no aluno quando integração PagBank/Asaas aluno estiver ativa |
| **Status do aluno** | Ativo (default), opcional incluir inativos | `studentStatus` |
| **Forma de pagamento habitual** | Filtro auxiliar (ex.: só `preferredPaymentMethod = cartao_credito`) | Campo existente; **não** substitui “recorrente automático” |

### Modo de cobrança no plano (novo em Financeiro → Planos)

Estender cada item de `financeConfig.plans[]`:

```ts
type AcademyStudentPlan = {
  name: string;
  price: number;
  // … campos atuais …
  billingMode?: 'manual' | 'recurring_card'; // default 'manual'
};
```

| `billingMode` | Significado para o usuário |
|---------------|----------------------------|
| `manual` | Mensalidade registrada manualmente, link avulso, PIX na recepção, etc. |
| `recurring_card` | Cobrança automática no cartão (assinatura PagBank / gateway recorrente) |

**Resolução no aluno (runtime):**

1. `student.plan` → lookup do plano na academia.  
2. Se plano `recurring_card` **ou** aluno com assinatura ativa no gateway → tratar como **recorrente automático**.  
3. Plano legado sem `billingMode` → `manual` (retrocompat).

### UI “Para quem” no card

```
┌─ Para quem ─────────────────────────────────────────┐
│ ○ Todos os alunos elegíveis (padrão do gatilho)     │
│ ● Filtrar por plano                                 │
│     ☑ Mensal básico                                 │
│     ☑ Mensal premium                                │
│     ☐ Anual                                         │
│ ○ Excluir planos com cobrança automática no cartão  │
│ Estimativa: ~42 alunos · 3 excluídos (cartão auto)  │
└─────────────────────────────────────────────────────┘
```

**Presets sugeridos:**

| Preset | Uso |
|--------|-----|
| **Planos manuais** | Todos com `billingMode !== recurring_card` |
| **Plano X** | Multi-select explícito |
| **Excluir recorrente cartão** | Default em **Lembrete de vencimento** |

### Audiência por tipo de card

| Card | Default proposto | Configurável |
|------|------------------|--------------|
| Funil (Tipo A) | Lead no evento | Não |
| Aniversário | Ativos com aniversário hoje | **Sim** — planos + excluir recorrente |
| Aluno sumido / Novato | Regra de frequência | **Sim** — planos |
| Lembrete vencimento / atraso | Pendência financeira | **Sim** — default **excluir** `recurring_card` |

### Persistência

```ts
type AutomationAudience = {
  mode: 'default' | 'plans' | 'exclude_recurring_card';
  planNames?: string[];
  excludeRecurringCard?: boolean;
  includeInactive?: boolean;
};
```

Crons consultam `matchesAutomationAudience(student, audience, financeConfig)` antes de enviar.

### Requisitos (audiência)

| ID | Requisito | Fase |
|----|-----------|------|
| RU-AUD-1 | Multi-select de planos no card + estimativa | P1 |
| RU-AUD-2 | `billingMode` em Financeiro → Planos | P1 |
| RU-AUD-3 | Preset “excluir cobrança automática no cartão”; default em lembretes | P1 |
| RU-AUD-4 | Engine `matchesAutomationAudience` + testes | P1 |
| RU-AUD-5 | Flag assinatura gateway no aluno (PagBank) | P2 |

---

## Seção Resumo (`?section=resumo`)

Painel compacto para onboarding e power check:

| Bloco | Conteúdo |
|-------|----------|
| **Conexão** | Status Zapster + CTA Agente IA (reusa `computeAutomationReadiness`) |
| **Ativação** | “3 de 8 mensagens automáticas ativas” + lista com toggle rápido |
| **Wizard** | Se incompleto: passos restantes inline (não full-page obrigatório) |
| **Atalhos** | Ir para Captação / Rotinas; link Financeiro **não** incluído |

Toggle rápido no resumo: altera só `active`; não expande editor (evita UI pesada).

---

## Wizard (simplificado)

| Antes (3 passos) | Depois (2 passos) |
|------------------|-------------------|
| 1. Revisar modelos | 1. **Revisar mensagens** — percorrer seções; ack por academia ou “personalizei ao menos um texto” |
| 2. Conectar WhatsApp | 2. **Conectar WhatsApp** — inalterado (`/agente-ia`) |
| 3. Ativar gatilhos | *(absorvido pelo passo 1 — modos nos cards)* |

**Ack do passo 1:** checkbox global no resumo ou ao dispensar wizard: “Revisei as mensagens do funil”.

**Conclusão do wizard:** pelo menos um card em **Automático** **ou** ack + WA conectado + usuário explicitamente deixou tudo manual (toast: “Você pode ativar envio automático quando quiser em cada mensagem”).

---

## Permissões

| Papel | Ver hub | Editar texto | Alterar modo / timing |
|-------|---------|--------------|------------------------|
| owner | Sim | Sim | Sim |
| admin | Sim | Sim | Sim |
| member | Sim | Não | Não |

Member vê cards em leitura com modos e textos; sem wizard forçado (mantém regra P3).

---

## Requisitos

### P0 — Must-have (MVP hub unificado)

#### RU-1 — Modo de envio três estados
- Cada card Tipo A/B expõe Desligado / Só manual / Automático.
- Persistência em `automationsConfig` + `whatsappTemplates` como hoje.

#### RU-2 — Sidebar por seção operacional
- 4 itens: Resumo, Captação, Pós-matrícula, Rotinas.
- Remover entradas `Modelos ·` e `Gatilhos ·` da sidebar.

#### RU-3 — Cards Tipo A na Captação
- Os 6 gatilhos de `AUTOMATION_GROUPS.captacao` como cards trigger-led com texto embutido.

#### RU-4 — Card Tipo B Aniversário
- Texto + modo no mesmo card; sem select de modelo.

#### RU-5 — Card Pós-matrícula
- `converted` como Tipo A (template default `confirm` com banner compartilhado).

#### RU-6 — Salvar unificado
- Auto-save debounced (300–500 ms) para texto e toggles, ou botão “Salvar” por seção se dirty — **uma** estratégia escolhida no TECH; não misturar feedback na mesma tela.
- Guard ao sair da página se dirty (reusa `ConfirmDialog`).

#### RU-7 — Redirects legados
- `?tab=modelos|gatilhos` → `?section=` equivalente; testes em `automacoesHub.test.js`.

#### RU-8 — Default de rota
- Wizard incompleto → `?section=resumo`.
- Wizard completo → `?section=captacao` (ou última seção visitada em `sessionStorage`).

#### RU-9 — Readiness e WA offline
- Banner Zapster no resumo e no topo das seções se offline.
- No máximo **2** banners empilhados (regra P3).

#### RU-17 — Cards financeiros em Rotinas (P0 se aprovado; senão P1)
- Dois cards Tipo D embutidos em `?section=rotinas`, persistindo em `financeConfig.whatsappReminders`.
- Visíveis apenas com módulo financeiro ativo.
- Redirect de `lembretes-whatsapp` no Financeiro.
- Contagem no Resumo: “X mensagens automáticas ativas” inclui funil **+** financeiro.

### P1 — Nice-to-have

#### RU-10 — Resumo com toggle rápido
- Lista dos 8 gatilhos com switch sem abrir card.

#### RU-11 — Banner “texto compartilhado”
- Entre cards que usam o mesmo `templateKey`.

#### RU-12 — Wizard 2 passos
- Migrar `automacoesSetupWizard.js` e testes.

#### RU-13 — Busca global
- Filtrar cards por nome do gatilho ou trecho do texto (uma busca no hub, não por aba).

### P2 — Futuro

#### RU-14 — Tipo B estendido
- `missed`, `post_class` se métricas mostrarem confusão remanescente.

#### RU-15 — “Sequências” / playbook WhatsApp
- Passos `whatsapp_template` do playbook com link bidirecional (spec P4.2 existente).

#### RU-16 — Aprovação antes do envio
- Fila de revisão para academias com medo de spam.

---

## Wireframe lógico (Captação e Rotinas)

```
[Mensagens automáticas]
Sidebar          │  Rotinas
─────────────────┼──────────────────────────────────
● Resumo         │  Rotinas da academia
  Captação       │  ┌─ Aniversário do aluno ────────────┐
  Pós-matrícula  │  │ Automático │ diário ~9h          │
  Rotinas        │  └─ texto / preview ───────────────┘
                 │
                 │  Cobrança (módulo financeiro)
                 │  ┌─ Lembrete de vencimento ────────┐
                 │  │ Automático │ 3 dias antes        │
                 │  └─ {{nome}} {{valor}} … ──────────┘
                 │  ┌─ Lembrete de atraso ─────────────┐
                 │  │ Desligado                        │
                 │  └─ ... ───────────────────────────┘
```

---

## User stories

### Dono da academia
- **US-1:** Quero editar o texto de aniversário e ligar o envio automático no mesmo lugar, para não perder tempo procurando outra aba.
- **US-2:** Quero deixar o lembrete de aula em “só manual” até testar o texto, para não assustar leads com mensagem errada.
- **US-3:** Quero ver em um resumo quantas mensagens automáticas estão ativas, para saber se o funil está “armado”.
- **US-6:** Quero configurar lembrete de mensalidade no mesmo lugar do aniversário, para não entrar em Financeiro só por causa do texto do WhatsApp.
- **US-7:** Quero enviar aniversário só para o plano “Social” e excluir quem já paga no cartão automaticamente.
- **US-8:** Quero lembrete de vencimento **apenas** para planos com cobrança manual, sem incomodar quem está no débito recorrente.

### Administrador
- **US-4:** Quero ajustar a antecedência do lembrete sem abrir outra tela, para mudar a operação rapidamente.

### Membro da equipe
- **US-5:** Quero ver quais mensagens automáticas estão ativas (somente leitura), para entender o que o sistema manda sozinho.

---

## Critérios de aceite (P0)

1. `/automacoes?section=rotinas` — card Aniversário: editar texto e mudar para Automático sem navegar para outra aba.
2. Card em **Só manual**: `active === false`, texto persistido, badge visível; template usável no Inbox.
3. `?tab=gatilhos&section=captacao` redireciona para `?section=captacao` com mesmo conteúdo.
4. Dois cards usando `confirm`: editar texto em um reflete no outro após save (mesmo `templateKey`).
5. Member: cards visíveis, controles desabilitados, sem wizard bloqueante.
6. WA offline + modo Automático: badge pendente, sem envio real (comportamento atual preservado).
7. `npm test -- automacoesHub automacoesSettingsSections automacoesSetupWizard` verde após atualização.
8. [automacoes-funil.md](../../flows/atendimento/automacoes-funil.md) atualizado no mesmo PR.
9. Com financeiro ativo: cards vencimento/atraso em Rotinas persistem e cron continua enviando (sem regressão).
10. Redirect `lembretes-whatsapp` → `?section=rotinas#financeiro`.

---

## Métricas de sucesso

| Tipo | Métrica | Alvo (90 dias pós-release) |
|------|---------|----------------------------|
| Leading | % academias que ativam ≥1 gatilho na primeira sessão no hub | +15% vs baseline |
| Leading | Tempo médio até primeiro gatilho ativo (analytics) | −30% |
| Leading | Cliques menu ↔ aba cruzada Modelos↔Gatilhos | −80% (sidebar única) |
| Lagging | Tickets suporte “onde ativo mensagem” | −50% |
| Lagging | Taxa de desativação de gatilhos em 7 dias (spam medo) | não subir >5% |

---

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Cards longos demais em mobile | Accordion: só um card expandido; resumo com toggles |
| Edição simultânea texto compartilhado | Banner + um editor por `templateKey` |
| Regressão auto-save | Manter debounce e retry; testes de integração ConfigTab |
| Confusão Desligado vs Só manual | Copy + tooltip; user test com 3 donos de academia |

---

## Faseamento sugerido

| Fase | Escopo | Entrega |
|------|--------|---------|
| **F1** | RU-2, RU-4, RU-7, RU-8 — sidebar nova + card aniversário unificado + redirects | Valida hipótese 1:1 |
| **F2** | RU-1, RU-3, RU-5, RU-6 — Captação + Pós-matrícula + modos | MVP P0 |
| **F3** | RU-9, RU-10, RU-11, RU-12, **RU-17** — resumo, wizard, polish, **lembretes financeiros em Rotinas** | P1 |
| **F4** | **RU-AUD-1…4** — `billingMode` no plano, seletor por plano, excluir recorrente cartão, engine audiência | P1 |
| **F5** | **RU-AUD-5** — assinatura gateway no aluno (PagBank) | P2 |

TECH doc separado após aprovação deste PRODUCT (`2026-06-17-automacoes-hub-unificado-TECH.md`).

---

## Open questions

| # | Pergunta | Dono |
|---|----------|------|
| OQ-1 | Segmented control vs select para modo de envio? | Design |
| OQ-2 | Auto-save global ou botão Salvar por seção? | Eng + UX |
| OQ-3 | Default rota: `resumo` ou `captacao` para wizard completo? | Produto |
| OQ-4 | “Desligado” esconde template do Inbox ou só do card? | Produto (proposta: **não** esconde do Inbox) |
| OQ-5 | Header **“Mensagens automáticas”** (proposta) alinha menu + hub com financeiro em Rotinas — confirmar? | Produto |
| OQ-6 | RU-17 no mesmo release do MVP (F2) ou release financeiro separado (F3)? | Produto |
| OQ-7 | Unificar sintaxe de placeholders `{nome}` vs `{{nome}}` no longo prazo? | Eng |
| OQ-8 | `billingMode` no plano basta até PagBank aluno, ou exigir flag no aluno desde v1? | Produto + Eng |
| OQ-9 | Lembrete de **atraso** também exclui recorrente cartão por default? (proposta: **sim**) | Produto |

---

## Histórico

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-17 | — | Spec inicial — hub unificado texto + gatilho |
| 2026-06-17 | — | Rotinas: inclusão lembretes financeiros (Tipo D); título hub → Mensagens automáticas |
| 2026-06-17 | — | Audiência por plano + `billingMode` recorrente cartão; preset excluir débito automático |
| 2026-06-17 | — | Norte: personalização máxima + camadas RU-SAFE anti-envio indevido |
