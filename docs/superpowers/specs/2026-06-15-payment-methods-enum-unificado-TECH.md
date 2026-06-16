# Enum unificado métodos de pagamento — TECH Spec

**Data:** 2026-06-15  
**PRODUCT:** [2026-06-15-payment-methods-enum-unificado-PRODUCT.md](./2026-06-15-payment-methods-enum-unificado-PRODUCT.md)  
**Status:** Implementado (2026-06-15)

---

## Novos exports (`paymentMethods.js`)

- `STORAGE_CREDIT_METHOD`, `STORAGE_DEBIT_METHOD`
- `STORAGE_DIALECT_MODAL_ORDER`
- `storageDialectPaymentMethodOptions({ labelStyle })`
- `orderedStorageDialectMethodsForModal()`
- `storageDialectMethodLabelsMap()` / `storageDialectMethodLabel()`
- `isStorageCreditMethod()`
- `normalizeToStorageDialect()`

## Refatorados

| Arquivo | Mudança |
|---------|---------|
| `MensalidadesPanel.jsx` | Usa helpers centralizados |
| `TransacoesTab.jsx` | Select + parcelas via `isStorageCreditMethod` |
| `MonthlyClosingTab.jsx` | `storageDialectPaymentMethodOptions({ labelStyle: 'full' })` |
| `StudentProfile.jsx` | Select + labels map centralizados |
| `NlCommandBar.jsx` | `formatPaymentMethod` |
| `mensalidadesPaymentForm.js` | Delega a `paymentMethods.js` |
| `financeExpense.js`, `studentNlUpdates.js` | `normalizeToStorageDialect` |
