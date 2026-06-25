# Precedência de valor manual em mensalidades — design

**Data:** 2026-06-23  
**Status:** aprovado para implementacao  
**Origem:** bug onde valor manual digitado no lancamento do aluno volta ao valor padrao do plano apos save/re-render.

**Arquivos-chave hoje:**

- `src/components/student/StudentPaymentModal.jsx`
- `lib/server/studentPaymentsHandler.js`
- `src/lib/collectionOverdue.js`
- `src/components/finance/MensalidadesPanel.jsx`

---

## 1. Resumo da decisao

Valor explicitamente informado pelo usuario sempre vence.

Isso vale para:

- `amount`
- `expected_amount`
- inclusive quando o valor explicito for `0`

O plano do aluno continua existindo apenas como fallback quando o campo estiver genuinamente ausente (`null` ou `undefined`).

---

## 2. Problema

Hoje o fluxo mistura duas fontes de valor:

1. valor manual digitado no modal
2. valor derivado do plano do aluno

Quando o valor manual nao fica materializado com firmeza no documento de pagamento, re-renders e recalculos posteriores caem no fallback do plano e o usuario percebe o valor como "sobrescrito".

Os sintomas principais sao:

- `amount` pode nao chegar de forma explicita em todos os saves
- `buildPayload()` recalcula pelo plano quando interpreta o valor como "falso" ou invalido
- o upsert por `lead_id + reference_month` pode preservar o valor antigo e ignorar o novo valor manual
- leituras de aberto/painel podem voltar ao plano quando `amount = 0`

---

## 3. Goals

| ID | Meta |
|---|---|
| G1 | Garantir que o modal sempre envie `amount` explicitamente |
| G2 | Garantir que `buildPayload()` preserve `amount` e `expected_amount` explicitos, incluindo `0` |
| G3 | Garantir que o upsert mensal respeite o novo valor manual recebido |
| G4 | Garantir que leitura de aberto/painel use `payment.amount` sempre que o campo existir |
| G5 | Eliminar qualquer fallback para plano quando o usuario informou valor manual |

---

## 4. Regra central

### 4.1 Ausente vs explicito

Para esta entrega:

- `undefined` e `null` = campo ausente
- `0` = valor explicito do usuario

### 4.2 Precedencia aprovada

1. `amount` explicito do request/documento
2. `expected_amount` explicito do request/documento
3. valor persistido existente no lancamento
4. valor derivado do plano do aluno

O item 4 nunca pode sobrescrever qualquer um dos itens 1 a 3.

---

## 5. Design por arquivo

### 5.1 `StudentPaymentModal.jsx`

- O submit deve sempre passar `amount` explicitamente ao handler de save
- `amount` nao pode ser omitido por depender de condicao truthy/falsy
- se o usuario digitou `0`, esse `0` deve seguir no payload

### 5.2 `studentPaymentsHandler.js`

- `buildPayload()` deve distinguir campo ausente de campo explicito
- se `amount` vier no request, ele deve ser persistido mesmo quando for `0`
- se `expected_amount` vier no request, ele deve ser persistido mesmo quando for `0`
- o calculo `expectedAmountWithCardFee(...)` so entra quando `expected_amount` estiver ausente
- o payload nao deve reconstruir `amount` a partir do plano quando `amount` estiver presente

### 5.3 Upsert por `lead_id + reference_month`

- se o request trouxer `amount` explicito, o upsert nao pode reaplicar o valor antigo do lancamento
- se o request trouxer `expected_amount` explicito, o upsert nao pode reaplicar o valor antigo do lancamento
- a preservacao do valor antigo so vale quando o request nao informou novo valor manual

### 5.4 `collectionOverdue.js`

- se `payment.amount` existir no documento, usar esse valor inclusive quando for `0`
- fallback para plano apenas quando `payment.amount` for `null` ou `undefined`

### 5.5 `MensalidadesPanel.jsx`

- ao abrir modal e ao montar exibicoes derivadas, respeitar `preset.amount`/`payment.amount` quando o campo existir
- usar plano apenas quando o valor estiver ausente

---

## 6. Testes

Cobertura minima:

1. modal/fluxo envia `amount: 0`
2. `buildPayload()` preserva `amount: 0`
3. `buildPayload()` preserva `expected_amount: 0`
4. upsert por `reference_month` respeita novo valor explicito
5. `openAmountForStudent()` usa `payment.amount = 0` e nao cai no plano

---

## 7. Criterios de aceite

Considerar a correcao pronta quando:

1. um valor manual digitado pelo usuario fica persistido no Appwrite em `amount` e/ou `expected_amount`
2. `0` continua sendo tratado como valor manual valido
3. salvar novamente o perfil ou reabrir telas nao reverte o valor para o plano
4. os testes focados de handler, painel e helpers passam
