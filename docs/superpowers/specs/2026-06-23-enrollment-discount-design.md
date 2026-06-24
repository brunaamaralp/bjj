# Desconto individual por matricula — design

**Data:** 2026-06-23  
**Status:** rascunho - aguardando aprovacao  
**Origem:** conversa de produto sobre permitir desconto individual recorrente por aluno sem criar novo tipo de plano.

**Fluxos relacionados:**

- [a-receber-mensalidades.md](../../flows/financeiro/a-receber-mensalidades.md)
- [aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)
- [funil-lead-matricula.md](../../flows/crm/funil-lead-matricula.md)

**Arquivos-chave hoje:**

- `src/components/MatriculaModal.jsx`
- `src/lib/performEnrollment.js`
- `src/lib/leadStudentPayload.js`
- `src/lib/enrollmentPayment.js`
- `src/lib/collectionOverdue.js`
- `src/lib/paymentStatus.js`
- `src/lib/financeiroOverview.js`
- `src/lib/studentPayments.js`
- `lib/server/studentPaymentsHandler.js`

---

## 1. Resumo da decisao

O Nave passa a suportar desconto individual recorrente por aluno matriculado.

Em vez de criar um plano novo para cada excecao, o sistema salva um valor fixo no aluno:

- `discount_amount`

O valor financeiro recorrente do aluno passa a obedecer a regra:

- `valor_final = max(0, preco_do_plano - discount_amount)`

Essa regra vale para:

- pre-preenchimento da primeira cobranca no fluxo de matricula
- calculo de mensalidades futuras
- valor em aberto e inadimplencia
- projections e agregados financeiros que derivam do plano do aluno

Nao entram no escopo:

- alteracao retroativa de lancamentos ja criados
- integracao com Asaas
- desconto percentual
- historico de desconto por periodo

---

## 2. Problema

Hoje o valor de cobranca do aluno e derivado principalmente do preco do plano configurado em `financeConfig.plans`.

Isso gera atrito em casos comuns:

1. a academia precisa conceder um desconto recorrente para um aluno especifico
2. o workaround atual exige mudar o preco do plano ou criar planos duplicados
3. essa modelagem mistura regra global de produto com excecao individual
4. telas de mensalidades e cobranca nao conseguem refletir um valor customizado por aluno sem gambiarra operacional

O problema nao e o cadastro do plano em si. O problema e a ausencia de uma regra individual persistida no aluno que altere o valor recorrente esperado.

---

## 3. Goals

| ID | Meta |
|---|---|
| G1 | Permitir salvar um desconto fixo individual no aluno durante a matricula |
| G2 | Fazer a primeira cobranca usar o valor final com desconto |
| G3 | Fazer mensalidades futuras, valor em aberto e KPIs considerarem o desconto |
| G4 | Manter o plano como referencia de catalogo, sem criar planos duplicados por aluno |
| G5 | Preservar compatibilidade com pagamentos e lancamentos ja persistidos |

---

## 4. Non-goals

| Item | Motivo |
|---|---|
| Desconto percentual | fora do escopo desta entrega; o modelo aprovado e valor fixo |
| Historico de vigencia do desconto | a regra vale sobre o estado atual do aluno, sem timeline propria |
| Reprocessar mensalidades e caixa antigos | nao alterar valores ja persistidos |
| Novo endpoint em `/api/` | proibido pelo limite atual da Vercel Hobby |
| Alterar modelagem de planos globais | o desconto e individual, nao um atributo do plano |

---

## 5. Modelo de produto

### 5.1 Fonte de verdade

O desconto individual fica salvo no aluno, na colecao `students`, porque o Nave nao possui uma colecao operacional separada de `enrollments` para reger a cobranca recorrente.

Campo novo:

- `discount_amount: number`

Regra de persistencia:

- default `0`
- valor monetario em reais
- ausencia do campo equivale a `0`

### 5.2 Regra principal

Sempre que o sistema precisar derivar o valor financeiro esperado a partir do plano atual do aluno, deve aplicar:

```js
calcFinalPrice(planPrice, discountAmount) = Math.max(0, planPrice - discountAmount)
```

### 5.3 Precedencia de valores

Para evitar reescrever cobrancas antigas ou sobrescrever valores explicitos, a precedencia aprovada e:

1. `payment.expected_amount` persistido
2. `payment.amount` persistido, quando aplicavel
3. calculo derivado do plano atual do aluno com `discount_amount`

Isso garante que o desconto afete novos calculos recorrentes sem adulterar registros ja materializados.

### 5.4 Fallback seguro

Se o plano do aluno nao existir mais na configuracao ou estiver sem preco valido:

- o sistema continua com fallback para `0`
- o desconto nao gera valor negativo

Se `discount_amount` for invalido, nulo ou ausente:

- tratar como `0`

---

## 6. UX por superficie

### 6.1 Modal de matricula

No fluxo de matricula, abaixo do campo `Plano`, adicionar:

- input monetario `Desconto (R$)`

Comportamento:

- default vazio ou `0`, tratado como zero
- preview em tempo real com:
  - valor do plano
  - desconto
  - valor cobrado final
- se o plano for isento ou tiver preco `0`, o desconto fica desabilitado ou zerado

Copy operacional esperada:

- `Valor do plano`
- `Desconto`
- `Valor cobrado`

### 6.2 Validacoes

Bloquear envio quando:

- `discount_amount < 0`
- `discount_amount > plan.price`

Observacao:

- o helper financeiro continua protegendo contra valor negativo com `Math.max(0, ...)`
- a UI nao deve permitir desconto maior que o plano para evitar erro operacional

### 6.3 Perfil do aluno

Quando `discount_amount > 0`, o perfil do aluno deve mostrar claramente:

- valor original do plano
- desconto aplicado
- valor final cobrado

Essa exibicao e informativa e reflete a regra atual do aluno. Ela nao recalcula visualmente cobrancas antigas ja persistidas com outro valor.

### 6.4 Mensalidades

Telas que projetam ou mostram valor esperado por aluno devem exibir o valor final com desconto, desde que nao exista valor explicito persistido na mensalidade.

Isso inclui:

- grade/lista de mensalidades
- cards de recepcao e cobranca
- timeline/resumo financeiro do aluno

---

## 7. Regras de negocio

### 7.1 Primeira cobranca da matricula

Ao abrir a etapa de pagamento apos matricula, o valor pre-preenchido deve usar o preco liquido do plano:

- `plan.price - student.discount_amount`

O operador ainda pode editar manualmente o valor no formulario, como ja faz hoje.

### 7.2 Mensalidades futuras

Quando o sistema deriva valor esperado do aluno a partir do plano, deve usar o helper central com desconto.

Essa regra precisa valer tanto no frontend quanto no fallback do backend para evitar divergencia entre telas e criacao server-side.

### 7.3 Inadimplencia e aberto

O valor em aberto do aluno deve considerar o desconto individual quando nao houver uma mensalidade persistida com valor proprio.

Consequencias:

- total em aberto reflete o valor liquido
- overdue nao cobra o bruto do plano
- fila de cobranca e recepcao nao superestimam o debito

### 7.4 KPIs e projections

KPIs e projections que hoje derivam do plano do aluno devem passar a refletir o valor esperado com desconto.

Exemplos:

- total esperado
- total em aberto
- fechamento mensal
- forecast de entradas

### 7.5 Nao retroatividade

Nenhuma rotina deve reprocessar:

- `student_payments` antigos
- `financial_tx` antigos

O desconto vale daqui para frente nos pontos que calculam valor a partir do plano atual do aluno.

---

## 8. Design tecnico

### 8.1 Helper central

Criar helper unico no dominio de cobranca de alunos, preferencialmente em `src/lib/planBilling.js`, com duas responsabilidades:

- normalizar leitura de `discount_amount`
- calcular valor final a partir do plano

Helpers propostos:

- `getStudentDiscountAmount(student)`
- `calcFinalPrice(planPrice, discountAmount = 0)`

Opcionalmente, pode existir um helper mais semantico para o dominio:

- `resolveStudentPlanPrice(student, financeConfig, payment)`

Objetivo:

- impedir logica duplicada em UI, KPIs e backend

### 8.2 Pontos centrais de integracao

Em vez de substituir todo acesso bruto a `plan.price` no codebase, a entrega deve priorizar os pontos centrais que irradiam a regra:

1. `src/lib/enrollmentPayment.js`
2. `src/lib/collectionOverdue.js`
3. `src/lib/paymentStatus.js`
4. `src/lib/studentPayments.js`
5. `lib/server/studentPaymentsHandler.js`

Ao corrigir esses pontos-base, a maioria das telas consumidoras herda o comportamento novo sem duplicacao.

### 8.3 Persistencia na matricula

O fluxo de matricula deve passar `discount_amount` no mesmo payload em que hoje salva:

- `plan`
- `due_day`
- `preferred_payment_method`
- `preferred_payment_account`

Isso cobre:

- matricula de lead para aluno
- possivel cadastro direto de aluno, se reutilizar a mesma estrutura

### 8.4 Valor esperado do pagamento

O backend ja aceita `expected_amount` e tambem recalcula fallback quando ele nao vem.

A entrega deve garantir:

- quando houver valor persistido, respeitar o persistido
- quando nao houver, usar o plano com desconto

### 8.5 Exibicao e rastreabilidade

Nao e necessario adicionar novo campo em `financial_tx`.

O valor liquido deve emergir naturalmente do pagamento/espelhamento ja existente. Se houver necessidade futura de auditoria detalhada do desconto no caixa, isso vira evolucao separada.

---

## 9. Arquivos com impacto esperado

### Frontend

- `src/components/MatriculaModal.jsx`
- `src/components/MatriculaPaymentStep.jsx`
- `src/lib/performEnrollment.js`
- `src/lib/leadStudentPayload.js`
- `src/lib/enrollmentPayment.js`
- `src/lib/collectionOverdue.js`
- `src/lib/paymentStatus.js`
- `src/lib/financeiroOverview.js`
- `src/lib/financeForecastInflows.js`
- `src/lib/studentFinancialTimeline.js`
- `src/pages/StudentProfile.jsx`

### Backend

- `lib/server/studentPaymentsHandler.js`
- `lib/server/studentPaymentFinancialTxMirror.js`

### Testes

- `src/test/paymentStatus.test.js`
- testes do modal de matricula e/ou mensalidades, conforme cobertura existente

---

## 10. Requisitos de aceite

### P0 - Must ship

#### R1 - Persistir desconto individual no aluno

**Aceite:**

- [ ] O fluxo de matricula salva `discount_amount` em `students`
- [ ] Ausencia do campo equivale a `0`
- [ ] O valor continua associado ao aluno apos recarregar a pagina

#### R2 - Primeira cobranca usa o valor com desconto

**Aceite:**

- [ ] O valor inicial da etapa de pagamento apos matricula usa o valor liquido
- [ ] O preview visual mostra plano, desconto e valor final
- [ ] Desconto invalido bloqueia o envio

#### R3 - Calculo recorrente usa o valor com desconto

**Aceite:**

- [ ] `openAmountForStudent` considera `discount_amount`
- [ ] `expectedAmountForStudent` herda a regra sem duplicacao
- [ ] valor em aberto e indicadores nao usam o bruto do plano para alunos com desconto

#### R4 - Backend respeita a regra

**Aceite:**

- [ ] Quando o backend deriva `expected_amount`, ele considera `discount_amount`
- [ ] Quando existe valor explicito persistido, ele continua tendo precedencia
- [ ] O espelhamento financeiro segue o valor do pagamento sem recalc retroativo

#### R5 - Perfil do aluno comunica o desconto

**Aceite:**

- [ ] Quando `discount_amount > 0`, o perfil mostra plano original, desconto e valor final
- [ ] Quando `discount_amount = 0`, a UI continua simples, sem ruido visual extra

---

## 11. Testes recomendados

### Unitarios

- `calcFinalPrice` com desconto zero, parcial, igual ao preco e valores invalidos
- `getStudentDiscountAmount` com `undefined`, `null`, string e numero
- `openAmountForStudent` usando plano com desconto
- `expectedAmountForStudent` respeitando `expected_amount` persistido

### Integracao / componente

- modal de matricula com preview em tempo real
- bloqueio quando desconto excede o preco do plano
- pre-preenchimento da primeira cobranca com valor liquido

### Regressao

- aluno sem desconto continua com comportamento atual
- mensalidade ja persistida com valor proprio nao e recalculada

---

## 12. Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| Logica duplicada em varios arquivos | concentrar o calculo em helpers centrais e pontos-base |
| Divergencia entre frontend e backend | aplicar a regra tambem no fallback server-side |
| UI permitir desconto invalido | validar contra o preco do plano antes de enviar |
| Plano alterado depois da matricula mudar a expectativa financeira do aluno | aceito nesta entrega; o sistema continua referenciando o plano atual mais o desconto individual |

---

## 13. Perguntas encerradas nesta conversa

- O desconto deve ser recorrente ou apenas na primeira cobranca?  
  Recorrente.

- O desconto deve ser modelado no plano ou no aluno?  
  No aluno, como excecao individual.

- O desconto deve ser valor fixo ou percentual?  
  Valor fixo.

---

## 14. Proximo passo

Se a spec for aprovada, o proximo artefato deve ser um plano de implementacao enxuto, com etapas por arquivo e checkpoints de verificacao antes de editar os calculos financeiros centrais.
