# Checkout misto (produto + mensalidade/pacote + taxa)

**Data:** 2026-08-12  
**Status:** aprovado para implementação  
**Esforço:** M

## Problema

No balcão, o cliente muitas vezes paga **produto + mensalidade/taxa** num único valor na maquininha (ex.: divide no cartão). Hoje o sistema força dois fluxos exclusivos (PDV vs `student_payments`), então o operador precisa lançar duas vezes ou o total da máquina não bate com um único lançamento.

## Decisão de produto

- **Um fluxo de UI** (perfil do aluno + Loja/PDV / Nova venda).
- **No sistema:** várias linhas/origens OK (`sale` + `student_payment`(s)), desde que a **soma = valor cobrado**.
- Carrinho pode misturar **produto/aluguel + mensalidade + pacote + taxa** no mesmo checkout.
- **Fora de escopo v1:** entidade fatura, cancelamento unificado num clique, nova Serverless Function.

## Arquitetura

Checkout compartilhado orquestra APIs existentes (Hobby 12/12):

1. `POST /api/sales` — itens de estoque (`sale` + `sale_items`)
2. `POST /api/student-payments` — plan / bundle / fee

Um bloco de pagamento (método, split ≤3, parcelas) cobre o total do carrinho. Pagamentos são **alocados por gross** entre venda e cobranças (reuso de `splitPagamentosByGrossShares`). Cada `student_payment` recebe um método único (maior fatia alocada) + metadados de captura/parcelas.

**Aluno:** obrigatório se houver cobrança de aluno; na Loja, sem aluno só produto (como hoje).

**Commit:** venda primeiro (com idempotency_key); depois cobranças; se cobrança falhar após venda criada → compensar com `cancelSale` da venda dessa tentativa.

**Caixa:** espelhos separados por categoria (`VENDA_PRODUTO` / `ALUGUEL_RECEITA` / `MENSALIDADE` / `OUTROS_RECEITA`).

## UX

- Carrinho unificado com badge por tipo; total = soma.
- Antes de confirmar: resumo “R$ X na máquina · no sistema: venda + mensalidade + taxa”.
- Pós-sucesso: toast + resumo com links/ids das origens criadas.
- Histórico continua separado (vendas vs a receber).

## Não-metas v1

- Cancelar/estornar o pacote misto inteiro.
- Nova coleção `checkout` / invoice.
- Multi-método completo por linha de mensalidade (apenas método dominante por cobrança).
