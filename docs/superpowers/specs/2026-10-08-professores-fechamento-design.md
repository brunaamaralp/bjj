# Professores — fechamento mensal — Design

**Data:** 2026-10-08  
**Status:** aprovado para implementação (brainstorming)  
**Abordagem:** página hub `/professores` (fechamento do mês)

**Specs / fluxos relacionados:**

- [2026-09-10-equipe-professor-instrutor-design.md](./2026-09-10-equipe-professor-instrutor-design.md) — catálogo roster
- [2026-09-08-confirmacao-staff-aula-design.md](./2026-09-08-confirmacao-staff-aula-design.md) — quem deu a aula
- [2026-09-10-multi-instrutores-aula-design.md](./2026-09-10-multi-instrutores-aula-design.md)
- [2026-09-24-experimental-professor-report-design.md](./2026-09-24-experimental-professor-report-design.md) — experimentais (contagem → aqui vira R$)
- [2026-06-16-contas-a-pagar-PRODUCT.md](./2026-06-16-contas-a-pagar-PRODUCT.md)
- [equipe-colaboradores.md](../../flows/config/equipe-colaboradores.md)
- [estoque-movimentacoes.md](../../flows/vendas/estoque-movimentacoes.md)
- [lancamentos-caixa.md](../../flows/financeiro/lancamentos-caixa.md)

---

## 1. Problem Statement

A academia precisa **fechar o mês por professor/instrutor**: somar o que a pessoa gerou (aulas confirmadas + experimentais compareceu), abater produtos que retirou, e **marcar como pago** com lançamento financeiro. Hoje existem confirmação de staff, relatório de experimentais (só contagem) e estoque genérico — **não** há página unificada, tabela de remuneração em R$, retirada “professor”, nem fechamento pago.

## 2. Goals

| # | Objetivo | Sucesso |
|---|----------|---------|
| G1 | Hub mensal com lista de professores e instrutores e totais | Owner/admin vê créditos, débitos, líquido e status por pessoa |
| G2 | Ficha de fechamento com breakdown (aulas, experimentais, retiradas) | Números batem com fontes operacionais do mês |
| G3 | Remuneração configurável: global por papel + override por pessoa | Cálculo usa override quando existe |
| G4 | Retirada de produto com débito = preço venda × (1 − % academia) | Default 30%; configurável por academia |
| G5 | Registrar retirada em Professores **e** Estoque (mesmo fluxo) | Uma movimentação; dois atalhos |
| G6 | Marcar pago → despesa liquidada no Financeiro + ficha travada | Snapshot imutável; link ao lançamento |
| G7 | Sem nova Serverless Function (Hobby 12/12) | Rotas em handlers existentes |

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Login / portal do professor | Fora do escopo Equipe roster |
| Rateio de valor entre vários instrutores na mesma aula | v1: cada staff no slot conta a própria aula (ver §5.3) |
| Comissão em R$ só no Relatórios Funil | Funil continua com contagens; R$ fica em Professores |
| Folha CLT / encargos / holerite | Só acordo interno academia ↔ colaborador |
| App mobile dedicado | Web no app atual |
| Recepcionista marcar fechamento como pago | Só owner/admin |

## 4. Decisões fechadas

1. **Job principal:** fechamento mensal (não operação contínua nem só auditoria).
2. **Fórmula:** créditos (aula + experimental) − débitos (retiradas com desconto %).
3. **Desconto produto:** sobre preço de venda; % por academia (default **30%**).
4. **Tabela:** valores globais **por papel** (professor ≠ instrutor) + **override por pessoa**.
5. **Marcar pago:** cria despesa na categoria de pagamento a professor/instrutor e **liquida no ato**.
6. **Retirada:** fluxo novo (não é venda PDV); atalhos em `/professores` e Loja → Estoque.
7. **Público da página:** professor e instrutor (roster + quem aparece como staff na confirmação); tabelas distintas por papel.
8. **Abordagem de produto:** página dedicada `/professores` (não só Relatórios nem só Financeiro).

## 5. Experiência (UX)

### 5.1 Navegação

- Rota canônica: `/professores`
- Menu: operação da academia (próximo de Equipe / Recepção — label exato no plano, alinhado a `naviMenu.js`)
- Personas: **owner/admin** fecham e configuram; **member** pode registrar retirada (se módulo estoque) mas **não** marca pago nem edita tabela de remuneração

### 5.2 Hub do mês

- Seletor de mês (`YYYY-MM`)
- Lista de pessoas elegíveis (ativas no período / catálogo ativo + quem teve movimento no mês)
- Colunas: nome, papel, aulas, experimentais, retiradas, créditos, débitos, líquido, status (`aberto` | `pago`)
- Clique → ficha

### 5.3 Ficha de fechamento

1. Créditos — aulas: ocorrências do mês com staff confirmado em que a pessoa aparece (professor e/ou na lista de instrutores do slot)
2. Créditos — experimentais: leads com `attended_at` no mês e `experimental_professor_*` = essa pessoa
3. Débitos — retiradas do mês vinculadas ao `staff_ref`
4. Total líquido; CTA **Marcar como pago** com `ConfirmDialog` (valor, forma de pagamento / conta)
5. Após pago: somente leitura + link ao lançamento financeiro

**Contagem de aula (v1):** cada slot `confirmed` em que a pessoa está como professor **ou** instrutor conta **1 aula** para ela (não rateia o valor da aula entre vários). Se a mesma pessoa estiver nos dois campos no mesmo slot, conta **1** (dedupe por slot).

### 5.4 Configuração

Na página (seção/config colapsável) ou sub-rota:

| Campo | Escopo |
|-------|--------|
| R$ / aula | Global por papel (`professor`, `instructor`) |
| R$ / experimental compareceu | Global por papel |
| Override R$ aula / R$ experimental | Por `staff_ref` |
| % desconto produto | Global academia (default 30) |

### 5.5 Retirada de produto

Modal compartilhado:

- Pessoa (picker Equipe+roster)
- Produto + quantidade
- Preview: preço tabela, %, valor debitado
- Confirma → baixa estoque + registra movimento elegível ao fechamento do mês da data da retirada

## 6. Modelo de dados

### 6.1 Fontes existentes (somente leitura no agregador)

| Fonte | Uso |
|-------|-----|
| `class_slots` + lesson staff | Aulas confirmadas |
| `leads` (experimental professor + `attended_at`) | Experimentais |
| Equipe + `instructors` | Identidade / papel / picker |

### 6.2 Novo — config remuneração

Persistência por academia (documento único ou attrs em academy — detalhar no plano técnico). Campos lógicos:

```
compensation_config: {
  product_discount_pct: number, // default 30
  roles: {
    professor: { lesson_amount, experimental_amount },
    instructor: { lesson_amount, experimental_amount }
  },
  overrides: {
    [staff_ref]: { lesson_amount?, experimental_amount? }
  }
}
```

Refs estáveis: `login:<userId>` | `roster:<docId>` (mesmo padrão da confirmação de aula).

### 6.3 Novo — retirada professor (estoque)

Movimentação de inventário com tipo dedicado (ex.: `saida_professor`), **não** ajuste genérico e **não** venda.

Campos lógicos no movimento (ou payload JSON associado):

| Campo | Nota |
|-------|------|
| `staff_ref` | login/roster |
| `staff_name` | snapshot |
| `unit_price` | preço venda na hora |
| `discount_pct` | % aplicado |
| `debit_amount` | `qty * unit_price * (1 - discount_pct/100)` |
| `product_id` / nome | auditoria |

Baixa quantidade no estoque como saída. **Não** gera receita de loja.

### 6.4 Novo — fechamento mensal

Documento por `(academy_id, staff_ref, year_month)`:

| Campo | Nota |
|-------|------|
| `status` | `aberto` \| `pago` |
| `role` | papel usado na tabela |
| `counts` | aulas, experimentais, retiradas |
| `amounts` | credits_lessons, credits_experimental, debits_products, net |
| `rates_snapshot` | valores e % usados no pagamento |
| `finance_tx_id` | preenchido ao pagar |
| `paid_at`, `paid_by` | auditoria |

Ao **marcar pago**, gravar snapshot dos totais; eventos posteriores **não** alteram esse documento. Na v1, se houver movimento depois do pagamento no mesmo mês, a UI avisa “fora do fechamento”; ajuste automático fica para v2.

## 7. Cálculo

```
lesson_rate = override.lesson ?? roles[papel].lesson
exp_rate    = override.experimental ?? roles[papel].experimental

créditos = (n_aulas × lesson_rate) + (n_exp_compareceu × exp_rate)
débitos  = Σ debit_amount das retiradas com data no mês
líquido  = créditos − débitos
```

- Experimental **faltou** não gera crédito.
- Aula `cancelled` / “não houve” não gera crédito.
- Líquido negativo: permitido com confirmação explícita no dialog de pagar.

## 8. Financeiro (marcar pago)

1. Validar status `aberto` e permissão owner/admin.
2. Recalcular totais, persistir snapshot no documento de fechamento.
3. Criar despesa liquidada:
   - categoria: pagamento a professor/instrutor (taxonomia tipo **Salários e encargos** / despesa operacional — **nunca** pró-labore de sócio);
   - valor da despesa = `max(líquido, 0)`;
   - se `líquido < 0`: dialog confirma que débitos excedem créditos; marca fechamento `pago` com despesa **0** (débitos já saíram só do estoque).
4. Gravar `finance_tx_id`, `status=pago`.
5. Estorno: fluxo explícito (reabre fechamento + estorna/cancela lançamento) — detalhar no plano; não editar calado.

## 9. API / limites Vercel

Sem novo arquivo em `/api/`. Preferência:

| Capacidade | Onde (orientativo) |
|------------|--------------------|
| Agregar fechamento do mês | `api/agent.js?route=…` ou `api/finance.js` / padrão bookings report |
| Marcar pago + lançamento | `api/finance.js` |
| Config remuneração | route academy/agent existente ou client Appwrite (padrão Equipe) |
| Retirada estoque | fluxo inventory existente + tipo novo |

## 10. Arquitetura de código (orientação)

| Unidade | Responsabilidade |
|---------|------------------|
| Domínio puro | Cálculo, status, snapshot, desconto |
| Agregador server | Busca slots/leads/moves → DTO do hub/ficha |
| UI hub + ficha | `/professores` |
| Modal retirada compartilhado | Usado em Professores e Estoque |
| Hook marcar pago | Orquestra finance + update fechamento |

## 11. Bordas e erros

| Caso | Comportamento |
|------|----------------|
| Sem confirmações no mês | Créditos 0; débitos podem existir |
| Módulo estoque off | Hub/ficha sem retiradas; config % oculta |
| Estoque insuficiente | Bloqueia retirada |
| Fechamento pago + nova aula | Não altera snapshot; UI avisa movimento fora do fechamento |
| Agregador falha | `ErrorBanner` + retry |
| Ações OK/erro pontuais | `useToast` |
| Marcar pago / estorno | `ConfirmDialog` |

## 12. Testes (harness)

- Domínio: fórmula, override, desconto %, dedupe aula, snapshot imutável
- Retirada: baixa estoque + `debit_amount` + mês correto
- Marcar pago: cria/liquida despesa, trava status, rejeita member
- Agregador: aulas/experimentais batem com fixtures de lesson staff + experimental professor

## 13. Fluxos a atualizar (mesmo PR de implementação)

- Novo: `docs/flows/…/professores-fechamento.md` (copiar `_template.md`)
- [estoque-movimentacoes.md](../../flows/vendas/estoque-movimentacoes.md) — tipo retirada professor
- [equipe-colaboradores.md](../../flows/config/equipe-colaboradores.md) — link para Professores
- [lancamentos-caixa.md](../../flows/financeiro/lancamentos-caixa.md) ou A pagar — origem do lançamento
- `docs/flows/README.md` + `VALIDATION.md` se necessário
- `naviMenu.js` / `App.jsx` — rota e item de menu

## 14. Critérios de aceite (resumo)

1. Owner abre `/professores`, escolhe mês, vê lista com líquidos.
2. Abre ficha: breakdown coerente com Recepção (aulas) e Funil (experimentais compareceu).
3. Registra retirada (pela página ou Estoque); débito = venda × (1 − %).
4. Ajusta % academia e override de um professor; recálculo reflete antes de pagar.
5. Marca pago → despesa liquidada + ficha travada.
6. Member não consegue marcar pago.

---

**Aprovado pelo usuário** (job A, mix C, produtos novos, desconto % academia default 30, tabela global+override, pago→despesa liquidada, retirada nos dois lugares, professor≠instrutor nas tabelas, abordagem página dedicada).
