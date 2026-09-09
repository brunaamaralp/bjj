# Lançamentos — pendente vs. confirmado no caixa (UX)

**Data:** 2026-08-24  
**Status:** Implementado  
**Contexto:** Operadores criavam lançamentos manuais que ficavam pendentes sem intenção, confundindo “pendente” com “a prazo” (vendas).

## Problema

- Default `receive_now: false` invertia o caso de uso mais comum (PIX/dinheiro na hora).
- Checkbox “Recebido/Pago agora” era fácil de ignorar.
- Termo “Liquidar” é jargão contábil.
- Entrada pendente não pedia data de previsão.

## Solução

1. Default **já no caixa** (`receive_now: true`) para lançamento manual avulso.
2. Segmented control **Já no caixa** | **A receber/pagar depois**.
3. Terminologia: **Confirmar recebimento/pagamento**, badges **Recebido/Pago**.
4. Data obrigatória para pendente (entrada e saída).
5. Lembrar última escolha por academia (`localStorage`).

## Exceções (sem mudança)

- Template de recorrência → sempre pendente.
- Contas a pagar → `receive_now: false`.
- Import CSV → conforme coluna/status.

## Critérios de aceite

- [ ] Novo lançamento manual sem alterar modo → status `settled`.
- [ ] Modo “A receber/pagar depois” → `pending` + data.
- [ ] Ações e badges sem “Liquidar” na UI principal.
- [ ] Recorrência força modo pendente.
