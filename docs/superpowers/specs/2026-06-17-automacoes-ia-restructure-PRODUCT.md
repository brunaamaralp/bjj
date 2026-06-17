# Reestruturação de informação — Automações, Tarefas e WhatsApp do funil

**Data:** 2026-06-17  
**Status:** aprovada (Opção A) — implementado (P4.1)  
**TECH:** [2026-06-17-automacoes-ia-restructure-TECH.md](./2026-06-17-automacoes-ia-restructure-TECH.md)  
**IMPLEMENTATION:** [2026-06-17-automacoes-ia-restructure-IMPLEMENTATION.md](./2026-06-17-automacoes-ia-restructure-IMPLEMENTATION.md)

**Specs anteriores:** [2026-06-16-automacoes-ux-onboarding-PRODUCT.md](./2026-06-16-automacoes-ux-onboarding-PRODUCT.md) · [2026-06-17-automacoes-ux-clareza-PRODUCT.md](./2026-06-17-automacoes-ux-clareza-PRODUCT.md)

**Fluxos afetados:**

- [automacoes-funil.md](../../flows/atendimento/automacoes-funil.md)
- [agente-ia-automacoes.md](../../flows/atendimento/agente-ia-automacoes.md)
- [tarefas-operacao.md](../../flows/crm/tarefas-operacao.md)

**Mock Figma:** não disponível — hierarquia, copy e mapa de rotas abaixo.

---

## Problema

O rótulo **“Automações”** virou um guarda-chuva para coisas que o usuário não percebe como um só produto:

| Conteúdo atual | O que o usuário acha que é | O que realmente é |
|----------------|---------------------------|-------------------|
| Aba **Processos** | “Automação” genérica | **Configuração** de templates de tarefa + playbook — equipe executa em **Tarefas** |
| Abas **Modelos** + **Configurações** | Parte do mesmo fluxo ✓ | Mensagens **automáticas** do funil via WhatsApp |
| Menu **Agente IA** | Outro módulo | **Infraestrutura** (número + assistente) usada por funil e inbox |
| Link em readiness → **Financeiro** | “Também é automação?” | Cobrança de mensalidade — domínio **Financeiro** |

**Sintoma:** mesmo após P0–P3 (banners, wizard contextual), ainda é preciso **explicar em voz alta** que “Automações tem duas partes”. Isso indica falha de **arquitetura de informação**, não só de copy.

**Custo:** suporte (“onde ligo o lembrete de aula?”), medo de spam, abandono do wizard, Processos como landing default quando o usuário quer WhatsApp.

---

## Princípios da nova estrutura

1. **Um lugar = uma intenção** — operar tarefas ≠ configurar processos ≠ configurar envios do funil ≠ conectar WhatsApp.
2. **Configuração junto da operação** — quem usa **Tarefas** todo dia encontra **Processos da equipe** no mesmo módulo (como “Configurar processos” já sugere hoje).
3. **Funil WhatsApp é um produto nomeável** — Modelos + Gatilhos + wizard formam **“Mensagens do funil”** (nome de trabalho), sem misturar checklist interno.
4. **Agente IA = conexão e cérebro** — permanece rota própria; funil **linka** para lá, não duplica.
5. **Financeiro fica no Financeiro** — sem menção de cobrança na tela de gatilhos do funil.
6. **URLs estáveis** — redirects 301/replace para links legados e bookmarks.

---

## Abordagens consideradas

### A — Separar de verdade (recomendada)

- **Tarefas** absorve a configuração hoje em `?tab=processos`.
- **`/automacoes`** vira hub **só WhatsApp do funil** (2 abas).
- Menu reorganizado em **CRM** vs **WhatsApp do funil**.

| Prós | Contras |
|------|---------|
| Mapa mental claro | Mais arquivos de rota/redirect |
| Alinha com link existente em Tarefas | Migração de bookmarks `?tab=processos` |
| Wizard só onde faz sentido | Playbook com passos mistos fica em “Processos” até fase 2 |

### B — Manter uma URL, duas trilhas visuais

- `/automacoes` continua com 3 abas, mas **segment control** no topo: `Equipe | WhatsApp`.
- Abas filtradas por trilha; default WhatsApp se funil incompleto.

| Prós | Contras |
|------|---------|
| Menos mudança de rota | Ainda um módulo “Automações” ambíguo |
| Implementação menor | Menu lateral continua listando 3 itens + Agente |

### C — Eliminar `/automacoes` do menu

- Processos → Tarefas; Modelos + Gatilhos → subitens de Agente IA ou Empresa.

| Prós | Contras |
|------|---------|
| Poucos nomes no menu | Agente IA vira “depósito” de tudo de WhatsApp |
| | Confunde **assistente conversacional** com **gatilhos de funil** |

**Recomendação:** **Abordagem A** — separação real com redirects; B como fallback se quiserem entrega mais rápida sem mover Processos.

---

## Estado alvo (Abordagem A)

### Mapa mental para o usuário

```mermaid
flowchart TB
  subgraph crm [CRM — equipe executa]
    T["/tarefas — Operar pendências"]
    P["/tarefas?tab=processos — Processos da equipe"]
    T --> P
  end

  subgraph funil [WhatsApp do funil — sistema envia]
  direction TB
    M["/automacoes?tab=modelos — Modelos"]
    G["/automacoes?tab=gatilhos — Gatilhos"]
    W[Wizard: modelos → conectar → ativar]
    M --> G
    W --> M
  end

  subgraph infra [Infraestrutura WhatsApp]
    A["/agente-ia — Conexão + Assistente IA"]
  end

  subgraph fin [Financeiro]
    F["/financeiro — Lembretes de mensalidade"]
  end

  G --> A
  P -.->|playbook pode referenciar template| M
  F -.x|sem link na tela de gatilhos| G
```

### Nomenclatura canônica

| Antes | Depois | Notas |
|-------|--------|-------|
| Menu **Automações** (accordion) | **Mensagens do funil** | Ícone/metáfora: funil + WhatsApp, não “engrenagem genérica” |
| Aba **Processos** em `/automacoes` | **Processos da equipe** em `/tarefas?tab=processos` | Configuração, não operação |
| Aba **Configurações** | **Gatilhos** | `tab=gatilhos` (alias `configuracoes` redirect) |
| Aba **Modelos de Mensagem** | **Modelos** | Mantém |
| Item **Agente de Atendimento** | **Agente IA** (inalterado) | Subtítulo no menu: “Conexão e assistente” |

### Menu lateral (Atendimento)

```
Tarefas                    → /tarefas
Processos da equipe        → /tarefas?tab=processos   [owner/admin; member leitura se aplicável]
Mensagens do funil         → /automacoes?tab=modelos  [default inteligente — ver abaixo]
Agente IA                  → /agente-ia
Conversas                  → /inbox
```

**Removido do accordion “Automações”:** item **Processos** e o rótulo guarda-chuva “Automações”.

**Agrupamento opcional (fase 2 visual):** subheader “WhatsApp” com Mensagens do funil + Agente IA + Conversas; subheader “Equipe” com Tarefas + Processos.

### Hub `/automacoes` — só funil WhatsApp

| Camada | Conteúdo |
|--------|----------|
| `PageHeader` | Título: **Mensagens do funil** · Subtitle: *Textos e gatilhos que enviam WhatsApp automaticamente quando o número está conectado.* |
| Abas | **Modelos** · **Gatilhos** |
| Wizard | Só neste hub; **nunca** em Tarefas |
| Scope banner | **Removido** (não há mais duas trilhas no mesmo hub) |
| Readiness | Só na aba Gatilhos; **sem** link para lembretes financeiros |

**Default da rota `/automacoes`:**

- Wizard incompleto → `?tab=modelos`
- Wizard completo → `?tab=gatilhos` (último lugar de ajuste frequente)
- `?tab=processos` → redirect **`/tarefas?tab=processos`**

### Hub `/tarefas` — operação + configuração da equipe

| `tab` (query) | Conteúdo |
|---------------|----------|
| *(omitido)* | Operação atual (por aluno, lista, kanban, calendário) — **sem mudança** |
| `processos` | Migrar `AutomacoesProcessosTab`: templates de tarefa, playbook, follow-up legado |

**Header em `?tab=processos`:**

- Título: **Processos da equipe**
- Subtitle: *Checklists e rotinas que a equipe executa no CRM — não enviam WhatsApp sozinhos.*
- Link secundário: “Ir para Tarefas” → `/tarefas`

**Link existente** em Tarefas (“Configurar processos automáticos”) passa a ser **`/tarefas?tab=processos`** (mesma página, aba config).

### Agente IA (`/agente-ia`)

Sem mudança de escopo. Na UI de **Mensagens do funil**:

- Card fixo ou banner **“Conexão WhatsApp”** com status (online/offline) + CTA **Abrir Agente IA**
- Substitui passo solto do wizard como “lugar estranho” — wizard mantém passo 2, mas a **home do funil** sempre mostra status da conexão

### Financeiro

- **Remover** passo `finance_reminders` do `AutomacoesReadinessBanner` na tela de gatilhos.
- Lembretes de mensalidade permanecem apenas em **Financeiro → Configurações → Lembretes WhatsApp** (rota atual).
- Se necessário cross-sell: uma linha na documentação/help, não na checklist de infra do funil.

### Playbook pós-aula (decisão faseada)

O playbook mistura `whatsapp_template`, `task` e `manual`.

| Fase | Decisão |
|------|---------|
| **P4.1** | Playbook **inteiro** move com Processos para `/tarefas?tab=processos` |
| **P4.2** (opcional) | Passos `whatsapp_template` ganham UI em Mensagens do funil (“Sequências”) ou link contextual “este template é usado no playbook X” |

Não bloquear P4.1 pela split do playbook.

---

## Rotas e compatibilidade

| Rota legada | Destino |
|-------------|---------|
| `/automacoes?tab=processos` | `/tarefas?tab=processos` |
| `/automacoes?tab=configuracoes` | `/automacoes?tab=gatilhos` |
| `/automacoes` (sem tab) | `/automacoes?tab=modelos` ou tab do wizard |
| Empresa `?tab=tarefas` (legacy) | `/tarefas?tab=processos` (atualizar `empresaLegacyRedirects`) |
| Empresa `?tab=automacoes` (legacy) | `/automacoes?tab=gatilhos` |
| Onboarding `setup_automations` | `/automacoes?wizard=1` (mantém) |

Aliases `configuracoes` ↔ `gatilhos` válidos por **6 meses** mínimo nos redirects.

---

## Wizard de primeira configuração

Permanece em **Mensagens do funil** apenas:

1. Revisar modelos  
2. Conectar WhatsApp → `/agente-ia`  
3. Ativar gatilhos → aba Gatilhos  

**Não aparece** em `/tarefas`. Member sem permissão de edição: sem wizard (como P3).

---

## Personas

| Papel | Tarefas | Processos da equipe | Mensagens do funil | Agente IA |
|-------|---------|---------------------|--------------------|-----------|
| Owner/admin | Operar + configurar | Editar | Editar modelos e gatilhos | Configurar |
| Member | Operar | Leitura (templates) | Leitura gatilhos/modelos | Conforme `canConfigureAgenteIa` |

---

## Critérios de aceite

1. Nenhuma tela combina **checklist da equipe** e **gatilho WhatsApp** no mesmo hub sem separador de nível de rota.
2. Usuário que clica **Mensagens do funil** nunca vê templates de tarefa CRM.
3. Usuário que clica **Tarefas → Processos** nunca vê wizard de WhatsApp.
4. **Configurações** deixa de existir como label; **Gatilhos** é o nome em menu, aba e links internos.
5. Readiness de gatilhos **não** menciona Financeiro.
6. Todos os links internos atualizados (`Tasks.jsx`, `LeadProfile`, `Dashboard`, `StudentsSection`, etc.).
7. `npm test -- automacoesHub automacoesSetupWizard naviMenu empresaLegacyRedirects` verde.
8. Fluxos em `docs/flows/` atualizados no mesmo PR.

---

## Entrega em fases

### P4.1 — Separação estrutural (1–1,5 PR)

- Mover `AutomacoesProcessosTab` → `Tasks.jsx` com `?tab=processos`
- `/automacoes` só Modelos + Gatilhos; renomear copy e menu
- Redirects legados
- Remover scope banner do hub funil
- Tirar finance do readiness

### P4.2 — Menu e polish (0,5 PR)

- Accordion Atendimento com subheaders ou ordem CRM → WhatsApp
- Status WhatsApp no header de Mensagens do funil
- Atualizar onboarding strings e mobile nav

### P4.3 — Playbook avançado (opcional, spec futura)

- Split ou espelhamento de passos `whatsapp_template` no hub funil

---

## Non-goals

- Unificar Agente IA e Mensagens do funil numa única página
- Mudar `lib/automationCore.js`, cron ou Zapster
- Nova Serverless Function
- Renomear rota física `/automacoes` → `/funil` (pode ser fase futura; esta spec mantém URL por compatibilidade)

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Bookmarks `?tab=processos` em Automações | Redirect permanente + toast único “Processos mudou para Tarefas” (session) |
| Confusão “Processos” vs “Tarefas” | Subtitle explícito; breadcrumb Tarefas › Processos |
| Duplicar header de hub em Tasks | Reutilizar `HubTabBar` secundário: Operação \| Processos da equipe |

---

## Validação manual (pós-P4.1)

1. [ ] Sidebar: **Mensagens do funil** abre só Modelos/Gatilhos  
2. [ ] **Tarefas → Configurar processos** abre mesma UI que antes em Automações/Processos  
3. [ ] `/automacoes?tab=processos` redireciona para Tarefas  
4. [ ] Wizard completo sem aparecer em Tarefas  
5. [ ] Gatilhos sem linha de Financeiro no readiness  
6. [ ] Demo 30 s: “Tarefas é o que faço; Mensagens do funil é o que o sistema manda no WhatsApp”

---

## Histórico

| Data | Mudança |
|------|---------|
| 2026-06-17 | Spec inicial — reestrutura IA pós-auditoria P3 |
