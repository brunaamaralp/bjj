# Planos isentos / bolsista — design

**Data:** 2026-06-19  
**Status:** rascunho — aguardando aprovação

**Contexto:** a academia precisa cadastrar alunos bolsistas sem cobrança mensal. A decisão de produto validada nesta conversa é modelar isso no **plano**, não no aluno: planos marcados como isentos não geram cobrança automática e fazem o aluno aparecer como **Isento** em Mensalidades.

**Fluxos relacionados:**

- [a-receber-mensalidades.md](../../flows/financeiro/a-receber-mensalidades.md)
- [aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)
- [funil-lead-matricula.md](../../flows/crm/funil-lead-matricula.md)
- [config-inicial-financeiro.md](../../flows/financeiro/config-inicial-financeiro.md)

**Arquivos mais impactados:**

- `src/components/finance/settings/FinanceSettingsPlansSection.jsx`
- `src/components/finance/MensalidadesPanel.jsx`
- `src/components/finance/MensalidadesListTable.jsx`
- `src/lib/financeiroOverview.js`
- `src/lib/collectionOverdue.js`
- `src/hooks/useStudentsCreateForm.js`
- `src/pages/StudentProfile.jsx`
- `src/lib/mapAppwriteStudentDoc.js`

---

## 1. Resumo da decisão

O sistema passa a tratar cobrança mensal a partir de um atributo do **plano**:

- plano comum: gera cobrança normalmente
- plano isento / bolsista: **não gera cobrança**

Na UI, o owner/admin configura isso em **Minha academia → Financeiro → Planos** por meio de um controle explícito, com copy simples como:

- `Este plano não gera cobrança mensal`

O aluno continua com plano, turma, matrícula, presença e perfil normais. A diferença é apenas o comportamento financeiro.

---

## 2. Problema

Hoje o sistema assume que todo plano gera mensalidade. Isso cria três problemas:

1. alunos bolsistas precisam de workaround operacional fora do fluxo padrão
2. a aba Mensalidades mistura alunos que devem pagar com alunos que são isentos
3. a régua de cobrança e os KPIs financeiros podem sugerir inadimplência onde não existe débito

O problema não está no cadastro do aluno em si, e sim em uma ausência de semântica no plano.

---

## 3. Goals

| ID | Meta |
|---|---|
| G1 | Permitir cadastrar planos que não geram cobrança mensal |
| G2 | Fazer alunos desses planos aparecerem como `Isento` em Mensalidades |
| G3 | Remover alunos isentos da fila de cobrança e dos indicadores de inadimplência |
| G4 | Manter o fluxo de matrícula/cadastro simples, sem campo extra de bolsista no aluno |
| G5 | Permitir múltiplos planos isentos, não apenas um plano chamado “Bolsista” |

---

## 4. Non-goals

| Item | Motivo |
|---|---|
| Bolsa parcial / desconto percentual | escopo futuro; esta entrega cobre apenas isenção total |
| Vigência de bolsa por período | escopo futuro; por ora a regra é o plano atual do aluno |
| Histórico de troca entre pagante e bolsista | a troca de plano resolve a mudança de comportamento sem criar trilha nova |
| Nova function em `/api/` | proibido pelo limite atual da Vercel Hobby |
| Renomear planos existentes automaticamente para “Bolsista” | a regra será um atributo técnico do plano, não o nome |

---

## 5. Modelo de produto

### 5.1 Novo atributo no plano

Cada plano ganha um atributo explícito de cobrança. O nome técnico definido para esta entrega é:

- `isExempt`

Valores:

- `false` = gera cobrança mensal
- `true` = isento / bolsista

Na linguagem de produto, `isExempt = true` equivale a um plano isento.

### 5.2 Regra principal

Se `student.plan` aponta para um plano cujo `isExempt === true`, então:

- o aluno aparece em Mensalidades com status `Isento`
- o aluno não entra em cobrança
- o aluno não conta como atraso
- o aluno não compõe total esperado, total recebido ou total em aberto
- o aluno não mostra CTA de registrar mensalidade

### 5.3 Regra de fallback

Se o plano do aluno:

- não existir mais na config, ou
- não tiver o novo atributo persistido

então o sistema assume:

- `isExempt = false`

Isso evita quebrar academias existentes e impede que um plano fique isento por acidente.

---

## 6. UX por superfície

### 6.1 Minha academia → Financeiro → Planos

Adicionar um controle no editor de plano:

- checkbox `Este plano não gera cobrança mensal`

Comportamento:

- ao marcar como isento, o preço do plano continua podendo existir
- o preço não gera mensalidade enquanto o plano for isento
- a copy deve deixar claro que a isenção afeta **Mensalidades e Cobrança**

Copy de apoio recomendada:

`Alunos deste plano aparecem como isentos em Mensalidades e ficam fora da cobrança automática.`

### 6.2 Cadastro rápido de aluno

Nenhum novo campo no aluno.

Fluxo:

- operador escolhe o plano normalmente
- se o plano escolhido for isento, o aluno já nasce com comportamento financeiro isento

### 6.3 Perfil do aluno

O perfil deve comunicar a situação com clareza:

- no cabeçalho ou bloco financeiro, mostrar um badge/linha como `Plano isento`
- não adicionar um campo `Bolsista` editável no aluno
- a origem da regra deve ficar visualmente vinculada ao plano

### 6.4 Mensalidades

Quando o aluno tiver plano isento:

- status exibido: `Isento`
- valor exibido: `Isento` ou `R$ 0,00`
- ação: sem botão `Registrar`
- vencimento: vazio neutro (`—`) ou label consistente de isenção; não mostrar atraso nem previsão de vencimento

Recomendação:

- status badge `Isento`
- coluna valor com `Isento`
- coluna vencimento com `—`

Isso evita sugerir que existe uma obrigação financeira.

### 6.5 Cobrança

Alunos com plano isento:

- não aparecem na fila
- não contam em cards/resumos
- não recebem estágio de régua

---

## 7. Regras de negócio

### 7.1 Mensalidades

Para cada aluno ativo:

1. resolver o plano atual pelo nome salvo no aluno
2. se o plano for `exempt`, classificar a linha como `isento`
3. ignorar cálculo de due day, pending, soon e overdue
4. impedir CTA de pagamento nessa linha

### 7.2 Cobrança e inadimplência

Alunos `isento` não podem ser considerados:

- overdue
- due today
- due week
- pending receivable
- collection candidate

### 7.3 KPIs

Alunos `isento` ficam fora de:

- total esperado do mês
- total recebido do mês
- total em aberto
- contadores de pagos, pendentes e em atraso

Observação:

- a exclusão é do KPI financeiro de mensalidade; o aluno continua existindo em CRM, presença e relatórios de cadastro

### 7.4 Mudança de plano

Quando o aluno troca de plano:

- plano novo `chargeable`: volta ao fluxo normal de mensalidade
- plano novo `exempt`: passa ao fluxo isento

A regra vale para o plano atual no momento da visualização/cálculo. Esta entrega não cria histórico financeiro retroativo especial.

---

## 8. Impacto técnico

### 8.1 Persistência da config de planos

Cada item de `financeConfig.plans` deve persistir o novo atributo.

Exemplo conceitual:

```json
{
  "name": "Bolsista infantil",
  "price": 0,
  "description": "",
  "isExempt": true
}
```

### 8.2 Normalização recomendada

Criar helper único para o domínio do plano, algo como:

- `isExemptPlan(plan)`
- `resolveStudentPlanMeta(student, financeConfig)`

Esses helpers devem ser usados por:

- Mensalidades
- KPIs
- Cobrança
- Perfil do aluno

Objetivo: evitar duplicação de `String(plan.name) === ...` ou lógica espalhada.

### 8.3 Status novo em Mensalidades

Adicionar o estado `isento`/`exempt` à camada de apresentação:

- resolução de status
- badge
- contadores

Recomendação de v1:

- exibir badge `Isento`
- não criar filtro próprio nesta entrega

---

## 9. Migração e compatibilidade

### 9.1 Planos existentes

Todos os planos existentes devem ser tratados como:

- `isExempt = false`

até que o usuário marque explicitamente a isenção.

### 9.2 Alunos existentes

Nenhuma migração em massa em alunos é necessária.

O comportamento novo nasce da leitura do plano atual configurado no `financeConfig`.

### 9.3 Segurança operacional

Não inferir isenção pelo nome do plano.

Exemplos que **não** devem ter comportamento especial só pelo nome:

- `Bolsista`
- `Professor`
- `Atleta`

Somente o atributo explícito define a isenção.

---

## 10. Critérios de aceite

| ID | Critério |
|---|---|
| A1 | Owner/admin consegue marcar um plano como isento na configuração de planos |
| A2 | Aluno com plano isento aparece em Mensalidades com status `Isento` |
| A3 | Linha do aluno isento não mostra botão de registrar pagamento |
| A4 | Aluno isento não entra na régua de cobrança |
| A5 | KPIs de mensalidades não contam alunos isentos em esperado, aberto ou atraso |
| A6 | Cadastro rápido e perfil do aluno continuam sem campo adicional de bolsista |
| A7 | Planos antigos continuam cobrando normalmente até configuração explícita |

---

## 11. Testes recomendados

### Unitários

- helper de plano isento retorna `true/false` corretamente
- resolução de status mensalidade retorna `isento` para plano `exempt`
- agregações financeiras ignoram alunos isentos
- fila de cobrança ignora alunos isentos

### Integração / UI

- editar plano e marcar como isento persiste na config
- aluno com plano isento renderiza badge `Isento` em Mensalidades
- aluno com plano comum continua no fluxo atual sem regressão
- perfil do aluno sinaliza que o plano atual é isento

---

## 12. Riscos e decisões explícitas

### Risco 1 — preço do plano isento gerar interpretação errada

Decisão:

- o plano pode continuar armazenando preço, mas a cobrança mensal ignora esse valor enquanto `isExempt = true`

Motivo:

- evita perda de contexto comercial do plano
- reduz necessidade de limpar preço ao alternar o tipo de cobrança

### Risco 2 — aluno em plano isento continuar aparecendo como atraso por lógica legada

Decisão:

- a checagem de isenção deve acontecer antes de qualquer cálculo de vencimento, atraso ou bucket de cobrança

### Risco 3 — ambiguidade entre “bolsista” e “isento”

Decisão:

- semanticamente a regra é `isento`
- na UI, pode aparecer como `Isento / bolsista` para aderir ao vocabulário do usuário

---

## 13. Rollout recomendado

1. adicionar atributo de cobrança na configuração de planos
2. propagar leitura para helpers de domínio
3. ajustar Mensalidades
4. ajustar Cobrança e KPIs
5. atualizar docs de fluxo

Sem feature flag separada, desde que o default dos planos existentes seja `chargeable`.

---

## 14. Fora de ambiguidade

Esta spec fixa os seguintes pontos:

- bolsista é modelado no **plano**, não no aluno
- isenção não depende do nome do plano
- plano isento continua aparecendo em Mensalidades como `Isento`
- plano isento não gera cobrança nem inadimplência
- esta entrega cobre **isenção total**, não bolsa parcial
