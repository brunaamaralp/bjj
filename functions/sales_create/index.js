import sdk from "node-appwrite";

export default async function (req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { aluno_id = null, forma_pagamento, itens } = body;
    if (!Array.isArray(itens) || itens.length === 0 || !forma_pagamento) {
      return res.json({ error: "invalid_payload" }, 400);
    }
    for (const it of itens) {
      if (!it.item_estoque_id || typeof it.quantidade !== "number" || it.quantidade <= 0 || typeof it.preco_unitario !== "number") {
        return res.json({ error: "invalid_item" }, 400);
      }
    }

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY);

    const databases = new sdk.Databases(client);
    const DB_ID = process.env.DB_ID;
    const STOCK_ITEMS_COL = process.env.STOCK_ITEMS_COL;
    const STOCK_MOVES_COL = process.env.STOCK_MOVES_COL;
    const SALES_COL = process.env.SALES_COL;
    const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL;
    if (!DB_ID || !STOCK_ITEMS_COL || !STOCK_MOVES_COL || !SALES_COL || !SALE_ITEMS_COL) {
      return res.json({ error: "missing_env" }, 500);
    }

    // 1) Disponibilidade
    const stockSnapshots = {};
    for (const it of itens) {
      const item = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id);
      const total = Number(item.quantidade_total || 0);
      const vendida = Number(item.quantidade_vendida || 0);
      const alugada = Number(item.quantidade_alugada || 0);
      const disponivel = total - vendida - alugada;
      if (disponivel < it.quantidade) {
        return res.json({ error: "no_stock", item_estoque_id: it.item_estoque_id, disponivel }, 409);
      }
      stockSnapshots[it.item_estoque_id] = { total, vendida, alugada };
    }

    // 2) Criar venda (rascunho)
    const totalVenda = itens.reduce((acc, it) => acc + (it.preco_unitario * it.quantidade), 0);
    const vendaId = sdk.ID.unique();
    const vendaDoc = await databases.createDocument(DB_ID, SALES_COL, vendaId, {
      aluno_id: aluno_id || null,
      total: totalVenda,
      forma_pagamento,
      status: "rascunho",
    });

    const createdItems = [];
    const createdMoves = [];
    const updatedStockIds = [];
    try {
      // 3) Criar itens da venda (snapshot) e baixar estoque
      for (const it of itens) {
        const saleItem = await databases.createDocument(DB_ID, SALE_ITEMS_COL, sdk.ID.unique(), {
          venda_id: vendaDoc.$id,
          item_estoque_id: it.item_estoque_id,
          quantidade: it.quantidade,
          preco_unitario: it.preco_unitario,
        });
        createdItems.push(saleItem.$id);

        const snap = stockSnapshots[it.item_estoque_id];
        const novaVendida = snap.vendida + it.quantidade;
        await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id, {
          quantidade_vendida: novaVendida
        });
        updatedStockIds.push(it.item_estoque_id);

        const move = await databases.createDocument(DB_ID, STOCK_MOVES_COL, sdk.ID.unique(), {
          item_estoque_id: it.item_estoque_id,
          tipo: "saida_venda",
          quantidade: it.quantidade,
          referencia_id: vendaDoc.$id,
          motivo: "venda",
          usuario_id: req.headers["x-user-id"] || "",
        });
        createdMoves.push(move.$id);
      }

      // 4) Finalizar venda
      await databases.updateDocument(DB_ID, SALES_COL, vendaDoc.$id, { status: "concluida" });
      return res.json({ ok: true, venda_id: vendaDoc.$id, total: totalVenda, status: "concluida" }, 200);
    } catch (err) {
      // Best-effort rollback
      for (const it of itens) {
        try {
          const snap = stockSnapshots[it.item_estoque_id];
          if (updatedStockIds.includes(it.item_estoque_id)) {
            const backVendida = Math.max(0, snap.vendida);
            await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id, { quantidade_vendida: backVendida });
          }
        } catch (e) {
          console.warn("rollback stock error", e);
        }
      }
      for (const id of createdItems) {
        try { await databases.deleteDocument(DB_ID, SALE_ITEMS_COL, id); } catch (e) { console.warn("rollback sale_item delete error", e); }
      }
      try { await databases.deleteDocument(DB_ID, SALES_COL, vendaDoc.$id); } catch (e) { console.warn("rollback sale delete error", e); }
      return res.json({ error: "create_failed", detail: String(err && err.message ? err.message : err) }, 500);
    }
  } catch (e) {
    return res.json({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}
