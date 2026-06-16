# Caixa — categorias gerenciais (não operacionais)

**Data:** 2026-06-15  
**Status:** Implementado  

## Problema

Movimentos patrimoniais/financeiros no extrato (aporte, empréstimo, rendimentos) não tinham categoria adequada no Caixa; a conciliação criava lançamentos como "Outras receitas/despesas", inflando métricas operacionais.

## Solução

Categorias gerenciais no mesmo fluxo do Caixa + conciliação, excluídas do saldo operacional nos relatórios.

## Categorias novas

**Entrada:** Receitas financeiras, Aporte de capital, Empréstimo recebido, Transferência recebida  
**Saída:** Pagamento de empréstimo, Transferência enviada  
**Plano de contas:** contas passivo/PL aparecem em "Fluxo patrimonial / financiamento"

## Critérios de aceite

- [x] Aporte conciliável sem entrar em receita operacional
- [x] Conciliação exige escolha de categoria
- [x] Mensalidade automática inalterada (4.1.1)
- [x] Espelho contábil D Caixa / C contrapartida correta
