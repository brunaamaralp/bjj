# Financeiro Minha Academia — nav non-owner — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado (2026-06-15)  
**TECH:** [2026-06-15-financeiro-nav-non-owner-TECH.md](./2026-06-15-financeiro-nav-non-owner-TECH.md)  
**Origem:** auditoria gaps Financeiro #7

---

## 1. Problem Statement

**Admin** (não titular) precisa configurar contas de recebimento, taxas e lembretes — links do hub Financeiro apontam para `/empresa?tab=financeiro&section=…`, mas a aba **Financeiro** em Minha Academia estava **bloqueada** para qualquer `role !== 'owner'`.

Quando `isOwner=false`, a sidebar listava **Planos** e **Régua** (sem `ownerOnly`), porém o conteúdo só renderizava para titular → **seção ativa com painel vazio**.

---

## 2. Decisão v1

| Papel | Acesso aba Financeiro (Empresa) | Seções na sidebar |
|-------|--------------------------------|-------------------|
| **owner** | Sim | Todas |
| **admin** | Sim | Taxas, Recebimento, WhatsApp, Exceções (sem planos, régua, contratos, plano de contas, razão) |
| **member** | Não | — |

Default de `?section=` para admin: **recebimento** (não `planos`).

---

## 3. Acceptance criteria

- [x] Admin acessa aba Financeiro em Minha Academia
- [x] Sidebar admin sem itens owner-only
- [x] Seção ativa sempre tem conteúdo
- [x] Deep link `?section=planos` para admin redireciona para seção permitida
- [x] Recepcionista continua sem acesso à aba
