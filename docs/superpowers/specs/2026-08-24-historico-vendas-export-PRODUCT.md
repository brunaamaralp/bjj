# Exportação CSV/PDF — Histórico de vendas

## Objetivo

Permitir exportar o Histórico de vendas (Loja → Histórico) em **CSV** e **PDF**, com todas as vendas do período (paginação completa) e filtros ativos (status, canal, busca).

## Decisão

Modelo **híbrido**:

| Formato | Onde | Motivo |
|--------|------|--------|
| CSV | Cliente | Reusa `downloadCsv`; mesma lista que a tela |
| PDF | Servidor (`/api/sales?action=history_export&format=pdf`) | Mesmo padrão do fechamento do dia; sem nova Serverless Function |

## Comportamento

- Botões na toolbar do Histórico: **Exportar CSV** e **Exportar PDF**
- Escopo: período `from`/`to` + filtros status/canal/busca
- Conteúdo: totais (iguais aos KPIs da tela) + linhas espelhando a tabela (data, ID, cliente, canal, itens, total, pagamento, status)
- Cap de páginas no fetch (igual relatório diário); se truncar, avisar no toast / nota no PDF
- Lista vazia após filtros → toast de aviso, sem baixar arquivo vazio “útil”

## Fora de escopo

- Exportar mensalidades no mesmo arquivo
- Alterar Relatórios → Loja
