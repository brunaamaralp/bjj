# DEPRECATED — não usar em produção

A criação de vendas foi migrada para **Vercel**:

- Handler: `lib/server/salesCreateHandler.js`
- Rota: `POST /api/sales` (rewrite → `api/leads.js?hub=sales`)

O frontend (`useSalesStore.createSale`) **não** invoca esta function.

Esta pasta permanece apenas como referência histórica. Remoção no Appwrite Console após confirmação de zero invocações.

Ver: [2026-07-10-vendas-fluxo-correcoes-evolucao-TECH.md](../../docs/superpowers/specs/2026-07-10-vendas-fluxo-correcoes-evolucao-TECH.md) § 2.6
