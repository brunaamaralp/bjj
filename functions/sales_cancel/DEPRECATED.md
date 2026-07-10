# DEPRECATED — `sales_cancel` (Appwrite Function)

**Status:** legado — não usar em novos deploys.

O cancelamento de vendas foi migrado para a API Vercel:

- `PATCH /api/sales` com `action: cancelar`
- Handler: `lib/server/salesCancelHandler.js`

## Cliente

`useSalesStore.cancelSale` usa a API por padrão (`VITE_SALES_CANCEL_VIA_API` omitido ou `true`).

O fallback via `functions.createExecution(SALES_CANCEL_FN_ID)` permanece apenas se
`VITE_SALES_CANCEL_VIA_API=false` — previsto para remoção após período de observação em produção.

## Remoção planejada

1. Confirmar zero invocações da function em logs Appwrite por 30 dias
2. Remover `functions/sales_cancel/`
3. Remover `VITE_APPWRITE_SALES_CANCEL_FN_ID` do projeto Vercel
4. Remover fallback Appwrite em `useSalesStore.js`
5. Remover `npm run deploy:function:sales-cancel`

Até lá, **não redeployar** esta function exceto emergência crítica.
