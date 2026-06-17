# Conciliação — Evolução UX (onboarding, mobile, mensalidade inline, regras)

**Data:** 2026-06-16  
**Status:** rascunho — aguardando implementação  
**Contexto:** análise de usabilidade pós-refactor UX + pagadores conhecidos; fechar gaps entre “bom para academia BR” e “fácil para novatos”  
**TECH:** [2026-06-16-conciliacao-ux-evolucao-TECH.md](./2026-06-16-conciliacao-ux-evolucao-TECH.md)

**Fluxos relacionados:**

- [conciliacao-bancaria.md](../../flows/financeiro/conciliacao-bancaria.md)
- [a-receber-mensalidades.md](../../flows/financeiro/a-receber-mensalidades.md)

**Specs relacionadas:**

- [2026-06-15-conciliacao-ux-refactor-PRODUCT.md](./2026-06-15-conciliacao-ux-refactor-PRODUCT.md) *(Fases A–D entregues; Fase E parcial)*
- [2026-06-16-conciliacao-pagadores-conhecidos-PRODUCT.md](./2026-06-16-conciliacao-pagadores-conhecidos-PRODUCT.md) *(P0a/P0b/P1; R-10/R-11/R-12 parciais)*

---

## Problema

A conciliação já cobre import multi-formato, sugestões por valor/data/nome, pagadores conhecidos e hints de mensalidade pendente. Porém:

1. **Novatos abandonam** antes do primeiro vínculo — não entendem o gesto “selecionar linha → vincular à direita”.
2. **Busca manual fraca** — o seletor de lançamentos só filtra pelo `label` visível; não encontra por nome do pagador no extrato ou alias salvo.
3. **Confiança confusa** — linhas mostram `% confiança` e rótulo de tier ao mesmo tempo; candidatos múltiplos ainda exibem `%` cru.
4. **Context switching** — registrar mensalidade a partir de órfão exige sair da aba Conciliação (deep link para Mensalidades).
5. **Mobile denso** — colunas empilhadas sem navegação clara entre extrato e lançamentos.
6. **Repetição mensal** — mesmo PIX (“JOSE SANTOS”) exige confirmação manual todo mês, sem regra memorizada opcional.

**Quem é afetado:** owner (primário); recepção indiretamente (menos retrabalho quando o dono não precisa sair da conciliação).

**Custo de não resolver:** abandono da feature, erros em valores repetidos, conciliação só no desktop.

---

## Goals

| # | Meta |
|---|------|
| G1 | Owner novo completa **primeiro vínculo** sem documentação externa |
| G2 | Busca manual encontra lançamento por **nome do aluno, responsável ou pagador** |
| G3 | Confiança do match é **legível** (Alta/Média/Baixa), não só número |
| G4 | Registrar mensalidade pendente **sem sair** da aba Conciliação |
| G5 | Conciliação **usável em mobile** (≤900px) |
| G6 | Regras memorizadas opcionais aceleram meses seguintes **sem auto-match silencioso** |

---

## Non-Goals

- Open Finance / feed bancário contínuo (spec separada PagBank).
- Auto-conciliar sem revisão humana (mesmo com regra memorizada — regra só **pré-seleciona** sugestão).
- Drag-and-drop entre colunas.
- Delegar conciliação a admin/member (spec `financeiro-nav-non-owner` separada).
- Nova Serverless Function em `/api/` (rotas em `api/finance.js?route=`).
- Tour genérico de todo o Financeiro — escopo só Conciliação.

---

## Personas e user stories

### Owner — primeiro uso

**US-1**  
Como owner na primeira vez na Conciliação, quero um **guia curto** do que fazer (importar → abrir extrato → vincular), para não desistir na lista vazia.

**US-2**  
Como owner ao abrir o **primeiro extrato**, quero um **tour de ~30s** mostrando “clique na linha → vincule à direita”, para aprender o gesto principal.

### Owner — operação diária

**US-3**  
Como owner, ao buscar lançamento manualmente, quero digitar **“José”** ou **“Santos”** e achar o aluno certo mesmo quando o label do plano é genérico.

**US-4**  
Como owner, nas sugestões quero ver **“Alta (valor + data + nome)”** em vez de interpretar porcentagem.

**US-5**  
Como owner, em linha órfã com hint de mensalidade pendente, quero **registrar o pagamento em modal leve** e voltar conciliado na mesma tela.

**US-6**  
Como owner no celular, quero alternar entre **Extrato** e **Lançamentos** sem rolar infinitamente.

### Owner — mês seguinte

**US-7**  
Como owner, após confirmar várias vezes o mesmo nome de PIX para o mesmo aluno, quero **criar uma regra** “sempre sugerir Pedro para JOSE SANTOS”, com revisão mensal.

---

## Fases e requisitos

### Fase 0 — P0 UX: Wizard + tour (~1 PR)

#### R0-1 — Wizard lista vazia (primeiro extrato)

| Campo | Valor |
|-------|-------|
| Gatilho | `statements.length === 0` e wizard não dispensado para esta academia |
| UI | Card no topo da aba (padrão `AutomacoesSetupWizard`: passos numerados, CTA, “Pular guia”) |
| Passos | 1) Importar extrato · 2) Revisar sugestões · 3) Vincular pendentes · 4) Finalizar |
| CTA passo 1 | Abre `ImportStatementModal` |
| Dispensar | `localStorage` por `academyId`; reabrir via link “Ver guia” no intro banner |
| Query debug | `?recon_wizard=1` força exibição |

**Aceite:** owner novo vê o wizard antes de importar; após importar o primeiro extrato, o wizard marca passo 1 completo e some ou avança.

#### R0-2 — Tour workspace (primeiro detalhe de extrato)

| Campo | Valor |
|-------|-------|
| Gatilho | Primeira abertura de **detalhe** de extrato (`selectedId` set) e tour não visto |
| Duração | ≤4 passos, ~30s total; usuário pode “Pular tour” a qualquer momento |
| Passos do tour | ① KPI / pendentes · ② “Clique numa linha do extrato” (highlight coluna esquerda) · ③ “Escolha o lançamento à direita e toque Vincular” · ④ “Confirme sugestões em lote aqui” (se houver botão Confirmar todos) |
| Implementação | Overlay leve próprio (sem lib externa); `aria-live="polite"` ao mudar passo |
| Não repetir | `localStorage` `navi_recon_tour_seen_{academyId}` |

**Aceite:** tour não bloia scroll permanente; ESC e “Pular” fecham; não reaparece após concluir.

#### R0-3 — Métricas de onboarding

- Evento interno opcional (console/analytics futuro): `recon_wizard_dismissed`, `recon_tour_completed`, `recon_first_match_within_session`.
- Sucesso qualitativo: ≥80% task success em teste com 5 owners novos (ver §7).

---

### Fase 1 — P1: Busca + confiança (R-11, R-12) (~1 PR)

#### R1-1 — Busca por pagador no seletor manual (R-11)

| Campo | Valor |
|-------|-------|
| Onde | `SearchableSelect` em linha `unmatched` + lista de órfãos Nave (se aplicável) |
| Campos indexados | `lead_name`, `responsavel`, `payer_search_text` (aliases normalizados concatenados), texto do `label` existente |
| Origem dos dados | Server enriquece `navi_unmatched` em `handleDetail` com `search_keywords: string[]` **ou** client monta índice a partir de campos já no payload |
| Comportamento | Busca case-insensitive por substring em qualquer keyword |
| Empty | “Nenhum lançamento encontrado.” |

**Aceite:** dado lançamento de Pedro com alias “José Santos”, buscar “josé” retorna a opção.

#### R1-2 — Rótulos de confiança (R-12)

| Situação | Exibir |
|----------|--------|
| `match_tier` presente | **Somente** rótulo: `Alta (valor + data + nome)` / `Média (valor + data)` / `Baixa (valor aproximado)` |
| Sem `match_tier`, score 50–99 | `Confiança média (N%)` — fallback legado |
| Score 100 ou matched | Sem badge de confiança |
| Lista multi-candidatos | Tier por candidato; **sem** `%` isolado quando tier existir |

**Aceite:** nenhuma linha mostra `%` e tier redundantes ao mesmo tempo.

---

### Fase 2 — P1: Mensalidade inline (~1–2 PRs)

#### R2-1 — Modal “Registrar e conciliar”

Substitui o CTA que hoje navega para Mensalidades (`buildBankReconPaymentHintPath`).

| Campo | Valor |
|-------|-------|
| Gatilho | Botão em `pending_payment_hints` na linha órfã |
| Modal | `ModalShell` compacto; título “Registrar mensalidade e conciliar” |
| Campos mínimos | Aluno (readonly), mês referência (readonly), valor (prefill hint), data pagamento (prefill data extrato), método (default PIX), conta bancária (extrato ou default) |
| Validação | Reutilizar `validateMensalidadesPaymentForm` / regras existentes |
| Sucesso | Toast “Mensalidade registrada e linha conciliada”; refresh do detalhe; linha sai de pendentes |
| Erro | `PaymentFormErrorBanner` / `FieldError` — sem navegar para outra aba |

#### R2-2 — Fluxo atômico server

Uma ação server-side (nova rota `recon-register-payment`) que, em sequência:

1. Cria/atualiza `student_payment` como pago  
2. Gera espelho em `financial_transactions` (liquidado)  
3. Confirma vínculo `bank_statement_item` ↔ TX  
4. Opcional: retorna `learn_payer` como em `confirm-match`

**Invariante:** se qualquer passo falhar, nenhum estado parcial visível (rollback ou ordem que permita retry idempotente).

#### R2-3 — Deep link legado

Manter deep link para Mensalidades como **fallback** (link secundário “Abrir em Mensalidades” no modal ou menu ⋯) para casos complexos (pacote, parcelas, desconto).

---

### Fase 3 — P1 mobile (~1 PR)

#### R3-1 — Abas Extrato / Lançamentos

| Campo | Valor |
|-------|-------|
| Breakpoint | `max-width: 900px` (alinhado a `recon.css`) |
| UI | Tabs sticky abaixo do KPI: `Extrato` · `Lançamentos` |
| Comportamento | Ao selecionar linha no Extrato, tab muda para Lançamentos **ou** badge “1 selecionada” na tab |
| Desktop | Layout duas colunas inalterado |

#### R3-2 — Barra “Próximo pendente” (alternativa complementar)

Em mobile, rodapé fixo quando `unmatched.length > 0`:

- Botão **Próximo pendente** → seleciona próxima linha `unmatched` e scroll ao topo da lista  
- Contador `3 de 12 pendentes`

**Default de produto:** implementar **R3-1 + R3-2** juntos (tabs para contexto, rodapé para velocidade).

#### R3-3 — A11y mobile (complemento Fase E)

- `aria-live="polite"` na `BankReconSelectionBar` ao mudar seleção  
- Área de toque ≥44px (já parcial em `recon.css` — validar nos novos controles)

---

### Fase 4 — P2: Regras memorizadas (~2 PRs)

#### R4-1 — Conceito

| Termo | Definição |
|-------|-----------|
| **Regra de pagador** | Mapeamento `nome_normalizado_extrato → lead_id` com flag `auto_suggest: true` |
| **Escopo** | Por academia; não substitui confirmação humana |
| **Efeito** | Matcher trata como `amount_date_name` com bônus máximo; item aparece em **Sugestões** com badge “Regra salva” |

#### R4-2 — Criação de regra

Gatilhos (qualquer um):

1. Após `confirm-match` + prompt “Lembrar pagador?” → checkbox adicional **“Sempre sugerir este vínculo”**  
2. Menu na linha conciliada: “Criar regra a partir desta linha”  
3. Perfil do aluno → Pagadores conhecidos → toggle “Sugerir automaticamente na conciliação” por alias

**Limite:** máx. 50 regras ativas por academia (configurável); dedupe por `(normalized_name, lead_id)`.

#### R4-3 — Revisão mensal

| Campo | Valor |
|-------|-------|
| Onde | Topo do detalhe do extrato, banner info colapsável |
| Conteúdo | “N regras aplicadas neste extrato” + lista (nome extrato → aluno) + link “Gerenciar regras” |
| Gerenciar | Modal ou sub-rota `?tab=conciliacao&recon_rules=1` — tabela desativar/editar |
| Segurança | Owner only; regra errada pode ser desativada sem apagar alias do aluno |

#### R4-4 — Non-goals da fase

- Regras para **despesas** / CNPJ fornecedor (R-13 spec pagadores).  
- Aplicar regra retroativamente a extratos já finalizados.

---

## Wireframes (ASCII)

### Lista vazia + wizard

```
┌─ Conciliação ─────────────────────────────────────┐
│ [Guia] Importar → Revisar → Vincular → Finalizar │
│ Passo 1 de 4 · Importe seu primeiro extrato       │
│ [Importar extrato]              [Pular guia]      │
├───────────────────────────────────────────────────┤
│ Empty: Nenhum extrato importado ainda             │
└───────────────────────────────────────────────────┘
```

### Workspace + tour (passo 2)

```
┌─ KPI: 8 pendentes · R$ 1.600 · 3 órfãos ─────────┐
├─ Extrato ──────────────┬─ Lançamentos Nave ───────┤
│ ╔══════════════════╗   │  (dimmed até selecionar) │
│ ║ Clique na linha  ║   │                          │
│ ╚══════════════════╝   │                          │
│ PIX JOSE SANTOS 200    │                          │
└────────────────────────┴──────────────────────────┘
        [Pular tour]  [Próximo →]
```

### Mobile tabs + rodapé

```
[ Extrato | Lançamentos ●1 ]
… lista …
┌─────────────────────────────────────┐
│ Próximo pendente (3/12)    [Vincular]│
└─────────────────────────────────────┘
```

---

## Success metrics

| Métrica | Baseline | Alvo pós-Fase 0–2 |
|---------|----------|-------------------|
| Tempo até 1º víncio (owner novo) | ~8–15 min estimado | ≤5 min |
| Task success sem ajuda (n=5) | não medido | ≥80% |
| % vínculos via busca manual que usam nome pagador | 0 | ≥30% dos manuais |
| Saídas da aba para registrar mensalidade | 100% dos hints | ≤20% (fallback) |
| Conciliação em viewport ≤900px sem abandono | não medido | ≥70% completam ≥1 vínculo |

---

## Critérios de aceitação (resumo)

### P0

- [ ] Wizard na lista vazia; dispensável; reabre via “Ver guia”
- [ ] Tour 4 passos no primeiro detalhe; não repete após concluir/pular
- [ ] `?recon_wizard=1` força wizard

### P1 busca/confiança

- [ ] Busca “josé” encontra TX com alias José Santos
- [ ] Sugestão com `match_tier` não mostra `%` redundante

### P1 mensalidade inline

- [ ] Registrar hint concilia linha sem mudar `tab=conciliacao`
- [ ] Falha de validação mantém usuário no modal
- [ ] Deep link Mensalidades permanece como fallback

### P1 mobile

- [ ] Em ≤900px, tabs Extrato/Lançamentos visíveis
- [ ] Rodapé “Próximo pendente” percorre fila unmatched

### P2 regras

- [ ] Regra criada eleva sugestão com badge “Regra salva”
- [ ] Owner desativa regra sem remover pagador do perfil
- [ ] Banner de revisão mensal lista regras usadas no extrato

---

## Open questions (defaults)

| # | Pergunta | Default |
|---|----------|---------|
| Q1 | Tour antes ou depois do wizard na lista? | Wizard na lista; tour só no detalhe |
| Q2 | Modal inline suporta pacote/parcelas? | Não v1 — só mensalidade simples; fallback Mensalidades |
| Q3 | Regras P2 em JSON na academia vs coleção? | Ver TECH — preferir extensão de aliases + flag `auto_suggest` |
| Q4 | Tabs mobile mudam automaticamente ao selecionar linha? | Sim, com animação leve |
| Q5 | Limite de regras por academia | 50 ativas |

---

## Ordem de implementação sugerida

| PR | Fase | Entrega |
|----|------|---------|
| PR1 | P0 | Wizard + tour + storage keys + testes hook |
| PR2 | P1a | R-11 busca + R-12 polish confiança |
| PR3 | P1b | Modal inline + rota `recon-register-payment` |
| PR4 | P1c | Mobile tabs + rodapé próximo pendente |
| PR5 | P2 | Regras memorizadas + revisão mensal |

---

## Governança

Ao implementar, atualizar no mesmo PR:

- [conciliacao-bancaria.md](../../flows/financeiro/conciliacao-bancaria.md) — mapa de telas, checklist Seção A  
- [VALIDATION.md](../../flows/VALIDATION.md) — se divergir código vs fluxo  
- Spec pagadores conhecidos — nota de que R-10 evoluiu para modal inline (R2 desta spec)
