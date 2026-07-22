# Cobertura histórica (sem Caixa) — design

**Data:** 2026-07-22  
**Status:** aprovado — implementação  
**Natureza:** funcionalidade **provisória** de migração (planos já pagos fora do Nave)

**Fluxos relacionados:**

- [aluno-perfil-presenca.md](../../flows/crm/aluno-perfil-presenca.md)
- [a-receber-mensalidades.md](../../flows/financeiro/a-receber-mensalidades.md)

**Specs relacionadas:**

- [2026-06-25-student-payment-caixa-mirror-correction-PRODUCT.md](./2026-06-25-student-payment-caixa-mirror-correction-PRODUCT.md) — `covered` não espelha no Caixa

---

## 1. Problema

Operadores precisam liquidar planos anuais (ou N meses) **já pagos no passado**, marcando o aluno como coberto, **sem** gerar lançamento no Caixa nem poluir DRE/relatórios. O “Plano com cobertura” atual sempre espelha o valor da âncora no Caixa.

---

## 2. Decisões de produto

| Tema | Decisão |
|------|----------|
| Onde | Só no **perfil do aluno** |
| Quem | **Owner / admin** |
| Valor | **R$ 0** — zero rastros financeiros |
| Duração | Número livre **1–24** meses |
| Conflito com pago/parcial | **Pular** esses meses |
| Modelo | Reaproveitar `bundle` + `covered_reason: historical` |

---

## 3. UX

1. No perfil, área financeira: ação discreta **“Cobertura histórica”** (visível só owner/admin).
2. Modal: início (mês), duração (1–24), nota opcional. Sem valor, método ou conta.
3. Preview: quantos meses serão cobertos e quantos pulados (já pagos/parciais).
4. Confirmar → toast; grade Mensalidades e timeline mostram **Coberto**.
5. Timeline/grupo: rótulo claro de histórico (não parecer pagamento real).

---

## 4. Modelo de dados

Para cada mês do intervalo (exceto skip):

| Campo | Valor |
|-------|--------|
| `payment_category` | `bundle` |
| `status` | `covered` (âncora e filhos) |
| `amount` | `0` |
| `covered_reason` | `historical` |
| `bundle_months` | N (só na âncora / primeiro mês criado) |
| `bundle_origin_id` | id da âncora |
| `paid_at` | `null` |
| `note` | padrão “Cobertura histórica — migração” (+ nota do usuário se houver) |

**Caixa:** nenhum espelho (`skipMirror` / status `covered` → `shouldMirrorPaymentToCaixa` = false). Reconciliação não repara.

**Upsert:** igual ao pacote — `paid`/`partial` → skip; demais → upsert para `covered`.

---

## 5. API / servidor

- Endpoint via handler existente de `student_payments` (sem nova function Vercel): ação/flag `historical_coverage` (ou `covered_reason: historical` + validação dedicada).
- Validar: academy, permissão owner/admin, `lead_id`, `coverage_start_month` (`YYYY-MM`), `bundle_months` ∈ [1, 24].
- Resposta: âncora + `monthsCreated` / `monthsSkipped` / lista de meses.

---

## 6. Erros e edge cases

| Situação | Comportamento |
|----------|----------------|
| Sem permissão | 403; CTA oculto na UI |
| Duração fora de 1–24 | `FieldError` |
| Todos os meses já pagos | Toast/aviso; nada criado |
| Âncora pulada (mês 1 pago) | Próximo mês elegível vira âncora com `bundle_months` |
| Cancelar cobertura | Reusar fluxo existente de cancelar cobertura de pacote a partir de um mês, quando aplicável |

---

## 7. Testes

- Unit: `buildHistoricalCoverageMonthSpecs` (ou equivalente) — todos `covered`, amount 0, reason historical; skip paid/partial.
- Unit/handler: create não chama mirror; monthsSkipped correto.
- UI smoke opcional: modal só owner/admin.

---

## 8. Non-goals

- Não aparece em Mensalidades como tipo de pagamento no modal da grade.
- Não armazena valor “real” para auditoria financeira.
- Não é substituto de plano isento/bolsista.
- Remoção futura da feature após migração (provisória).

---

## 9. Arquivos impactados (esperado)

- `src/lib/bundleCoverage.js` — specs históricas
- `src/lib/studentPayments.js` / `lib/server/studentPaymentBundleCreate.js` / `lib/server/studentPaymentsHandler.js`
- `src/pages/StudentProfile.jsx` + modal dedicado ou extensão leve
- `src/lib/studentFinancialTimeline.js` / `StudentPaymentsList.jsx` — rótulo histórico
- `docs/flows/crm/aluno-perfil-presenca.md` + `VALIDATION.md`
- Testes em `src/test/` e/ou `lib/server/__tests__/`

---

## Histórico

| Data | Mudança |
|------|---------|
| 2026-07-22 | Design aprovado na conversa (perfil, R$0, 1–24, skip paid, owner/admin, abordagem bundle+historical) |
