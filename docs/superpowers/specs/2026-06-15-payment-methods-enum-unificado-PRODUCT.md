# Enum unificado de métodos de pagamento — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado (2026-06-15)  
**TECH:** [2026-06-15-payment-methods-enum-unificado-TECH.md](./2026-06-15-payment-methods-enum-unificado-TECH.md)  
**Origem:** auditoria gaps Financeiro #6

---

## Problema

Listas duplicadas de formas de pagamento (`PAY_METHODS`, labels, constantes de crédito) espalhadas em Mensalidades, Transações, Fechamento, Perfil do aluno e NL — com risco de divergência após centralização dos aliases.

## Decisão v1

**Uma fonte em `paymentMethods.js`**, duas camadas:

| Camada | Uso |
|--------|-----|
| **Canônico** (`PAYMENT_METHODS`) | Vendas, taxas, conta padrão por método |
| **Storage dialect** (`storageDialectPaymentMethodOptions`) | Mensalidades, transações, perfil aluno |

Sem migração de dados históricos no banco.

## Acceptance criteria

- [x] Zero arrays locais `PAY_METHODS` duplicados nos fluxos operacionais
- [x] `STORAGE_CREDIT_METHOD` / `isStorageCreditMethod` centralizados
- [x] `normalizeToStorageDialect` usado em despesas e NL
- [x] Testes de paridade dialect + canônico
