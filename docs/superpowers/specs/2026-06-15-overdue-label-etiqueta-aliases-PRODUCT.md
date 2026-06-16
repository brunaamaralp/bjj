# Etiqueta de inadimplência (`overdueLabel`) + cleanup de aliases de pagamento — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado  
**TECH:** [2026-06-15-overdue-label-etiqueta-aliases-TECH.md](./2026-06-15-overdue-label-etiqueta-aliases-TECH.md)  
**Relacionado:** [taxas-cartao-metodos-canonicos](./2026-06-15-taxas-cartao-metodos-canonicos-PRODUCT.md) (canonicalização para taxas — já implementado)

---

## 1. Problem Statement

Dois gaps independentes, mesma área (config financeira + consistência de métodos de pagamento):

### 1.1 `overdueLabel` sem UI

A academia pode configurar a **régua de cobrança**, mas não consegue editar a **etiqueta de inadimplência** exibida no badge do aluno (`StudentOverdueBadge`). O valor é persistido em `financeConfig.overdueLabel` (padrão `"Inadimplente"`), copiado pelo cron para `student.overdue_label`, e usado em listagens — porém **não há campo** em Minha Academia → Financeiro → Régua.

O hint da seção fala em “etiquetas após vencimento”, mas a única etiqueta configurável (inadimplência) está inacessível. O estado já existe em `useFinanceConfigState` (`overdueLabel` / `setOverdueLabel`) e entra no digest de dirty/save — só falta a superfície de UI.

### 1.2 Aliases de método de pagamento fragmentados

Após centralizar `canonicalPaymentMethodKey` em `paymentMethods.js` para **taxas**, o codebase ainda mantém **5+ mapas duplicados** de aliases (`useNlAction`, `financeExpense`, `salePayments`, `studentNlUpdates`, `paymentMethodLabels`). Risco: nova variante adicionada em um lugar e esquecida em outro; comportamento divergente entre Mensalidades, Vendas, NL e despesas.

**Quem sofre:** owner (não personaliza etiqueta); engenharia e suporte (bugs silenciosos de normalização).

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Owner edita etiqueta de inadimplência na régua | Campo visível, salva em `financeConfig`, dirty tracking funciona |
| G2 | Etiqueta reflete no badge após novo ciclo de cobrança | Cron grava `overdue_label` com valor da academia |
| G3 | Uma fonte de verdade para aliases → canônico | `PAYMENT_METHOD_ALIASES` único em `paymentMethods.js` |
| G4 | Normalizadores legados delegam ao módulo central | Zero mapas `cartão_crédito` duplicados fora de `paymentMethods.js` |
| G5 | Matriz de testes cobre variantes conhecidas | CI verde com ≥20 casos de entrada → saída esperada |

---

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Regravar `overdue_label` em alunos já marcados ao mudar config | Operação em massa cara; só novos marks do cron |
| Migrar `method` histórico no banco para `cartao_credito` | Escopo grande; v1 unifica **lógica**, não dados |
| Trocar valores do modal Mensalidades (`cartão_crédito`) | UI/storage dialect legado; canonical só para cálculo |
| Unificar dialect de **persistência** (acentuado vs snake_case) entre módulos | Vendas já salva canônico; Mensalidades acentuado — aceito em v1 |
| Remover `ConfigTab.jsx` legado | Cleanup separado |
| Taxa PIX / parcelas Mensalidades | Specs futuras |

---

## 4. Comportamento esperado — `overdueLabel`

### 4.1 Onde aparece na UI de config

- **Seção:** Minha Academia → Financeiro → **Régua de cobrança** (`section=regua`)
- **Acesso:** owner only (igual às etapas da régua)
- **Posição:** acima da lista de etapas D+N, dentro de `CollectionRulesSection` (embedded ou não)

### 4.2 Campo

| Propriedade | Valor |
|-------------|--------|
| Label | **Etiqueta de inadimplência** |
| Hint | Texto exibido no badge do aluno quando a mensalidade entra na régua. Alunos já marcados mantêm a etiqueta até a próxima marcação pelo sistema. |
| Placeholder | `Inadimplente` |
| Max length | 30 caracteres (já enforced em `mergeCollectionIntoFinanceConfig`) |
| Default | `Inadimplente` (`DEFAULT_OVERDUE_LABEL`) |
| Vazio no blur/save | Normaliza para default via `parseOverdueLabel` |

### 4.3 Pipeline (inalterado na lógica)

```
financeConfig.overdueLabel
  → cron collection-overdue → student.overdue_label (novos/reativados)
  → resolveStudentOverdueBadgeLabel(student, financeConfig)
      prioridade: label do aluno > label da academia > default
```

### 4.4 Save / dirty

- Alterar só a etiqueta marca `dirty.collection` e habilita sticky save (já suportado pelo hook).
- Salvar persiste via `persistAcademyFinanceConfig` junto com `collectionRules`.

---

## 5. Comportamento esperado — cleanup de aliases

### 5.1 Camadas (modelo mental)

| Camada | Formato exemplo | Uso |
|--------|-----------------|-----|
| **Canônico** | `cartao_credito`, `pix` | Taxas, conta padrão por método, comparações, Vendas (save) |
| **Storage dialect (legado UI)** | `cartão_crédito`, `transferência` | Valores gravados em mensalidades, transações manuais, perfil aluno |
| **Display** | `Cartão de crédito` | Labels em tabelas, PDFs, NL |

v1 **não** funde storage dialects — apenas garante que **toda normalização para canônico** passa por `canonicalPaymentMethodKey`.

### 5.2 Funções que devem delegar (v1)

| Módulo atual | Função | Destino após cleanup |
|--------------|--------|----------------------|
| `salePayments.js` | `normalizePaymentForma` | `canonicalPaymentMethodKey` (+ trim/replace espaços se necessário) |
| `useNlAction.js` | `normalizePaymentMethod` | helper `toLegacyStorageMethod` ou manter acentuado via mapa derivado |
| `financeExpense.js` | `normalizeExpenseMethod` | delegar |
| `lib/studentNlUpdates.js` | `normalizePreferredMethod` | delegar |
| `paymentMethodLabels.js` | mapa inline | derivar labels de `PAYMENT_METHODS` + aliases |

**Nota:** NL e despesas historicamente **persistem** dialect acentuado; o cleanup valida equivalência, não força snake_case no save desses fluxos (ver TECH §3).

### 5.3 Matriz mínima de equivalência (aceite)

Todas as entradas abaixo devem produzir `canonicalPaymentMethodKey(input) ===` coluna **Canônico**:

| Entrada | Canônico |
|---------|----------|
| `cartão_crédito`, `cartao_credito`, `credito`, `credit` | `cartao_credito` |
| `cartão_débito`, `cartao_debito`, `debito`, `debit` | `cartao_debito` |
| `transferência`, `transferencia` | `transferencia` |
| `pix`, `dinheiro`, `outro` | igual |
| `cartão crédito` (espaço) | *P1* — adicionar alias se NL usar |

---

## 6. User Stories

### Owner — régua

- **US1:** Como owner, quero definir como aparece o badge de inadimplência (ex.: “Em atraso”), para alinhar à linguagem da academia.
- **US2:** Como owner, quero ver o valor default “Inadimplente” quando nunca personalizei.

### Recepção / listagens

- **US3:** Como equipe, ao ver um aluno inadimplente, quero o badge com a etiqueta configurada pela academia (após o cron marcar).

### Engenharia / qualidade

- **US4:** Como mantenedor, quero um único mapa de aliases para não corrigir taxas em um arquivo e esquecer o NL em outro.

### Edge cases — overdueLabel

- **US5:** Label com 31+ caracteres → truncar/salvar 30 (comportamento existente).
- **US6:** Aluno com `overdue_label` antigo + academia muda etiqueta → badge mostra label do **aluno** até cron atualizar.
- **US7:** Discard changes restaura etiqueta do servidor.

### Edge cases — aliases

- **US8:** `normalizePaymentForma('cartão_crédito')` === `normalizePaymentForma('cartao_credito')` após cleanup.
- **US9:** `formatPaymentMethod` continua exibindo label legível para dialect acentuado.

---

## 7. Requirements

### P0 — Must have

| ID | Requisito | Aceite |
|----|-----------|--------|
| R1 | Campo `overdueLabel` na UI da régua (owner) | Input ligado a `setOverdueLabel`; valor inicial de `readCollectionSettingsFromFinanceConfig` |
| R2 | Wire em `FinanceiroConfigTab` | `FinanceSettingsCollectionSection` recebe `overdueLabel` + `onOverdueLabelChange` |
| R3 | Persistência | Salvar grava `overdueLabel` em `financeConfig`; reload mostra valor |
| R4 | Dirty | Alterar só etiqueta habilita save |
| R5 | Aliases únicos | Remover mapas duplicados de `cartão_*` / `credito` / `debito` fora de `paymentMethods.js` |
| R6 | Delegação | `normalizePaymentForma`, `normalizeExpenseMethod`, `normalizePreferredMethod` usam helpers centrais |
| R7 | Testes aliases | `tests/unit/finance/paymentMethodCanonical.test.js` com matriz §5.3 |
| R8 | Testes overdueLabel | RTL ou unit: campo renderiza, onChange propaga, `parseOverdueLabel` no save |

### P1 — Nice to have

| ID | Requisito | Aceite |
|----|-----------|--------|
| R9 | Resumo na sidebar régua | `buildFinanceSettingsSummaries` inclui etiqueta: `3 etapas · Em atraso` |
| R10 | Aliases com espaço (`cartão crédito`) | Entrada NL normalizada |
| R11 | `useNlAction.normalizePaymentMethod` refatorado | Usa `toStorageDialectMethod` exportado |

### P2 — Futuro

- Job para sincronizar `overdue_label` em massa quando academia muda etiqueta
- Migração global para `cartao_credito` no banco
- Remover `ConfigTab.jsx`

---

## 8. QA Checklist manual

**Etiqueta**

- [ ] Owner abre Régua → vê campo “Etiqueta de inadimplência”
- [ ] Altera para “Devedor” → sticky save → recarrega → persiste
- [ ] Membro não-owner não vê seção régua (comportamento atual) ou vê read-only — *manter owner-only*
- [ ] Badge em aluno recém-marcado pelo cron usa nova etiqueta

**Aliases**

- [ ] `npm test -- paymentMethodCanonical` verde
- [ ] Registrar mensalidade cartão crédito → taxa OK (regressão spec anterior)
- [ ] NL registra pagamento com “cartão crédito” → método aceito
- [ ] Venda com forma `cartão_crédito` salva e exibe corretamente

---

## 9. Success Metrics

- 100% testes P0 em CI
- Zero mapas `METHOD_ALIASES` / `FORMA_ALIASES` duplicados (grep audit no PR)
- QA checklist §8 completo em staging

---

## 10. Open Questions

| # | Pergunta | Dono | Default v1 |
|---|----------|------|------------|
| Q1 | Preview do badge ao lado do input? | Design | Não — só hint texto |
| Q2 | NL deve continuar salvando `cartão_crédito` ou migrar para canônico? | Produto | Manter acentuado (sem breaking) |
| Q3 | Truncar etiqueta na UI com contador 0/30? | UX | Sim (P1) |

---

## 11. Timeline

| Fase | Entrega | Esforço |
|------|---------|---------|
| v1 | overdueLabel UI + alias cleanup + testes | ~1 dia |
| v2 | Sync em massa overdue_label | spec futura |
