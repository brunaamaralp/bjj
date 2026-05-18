import sdk from "node-appwrite";
import { resolveCurrentQuantity, itemDisplayName } from "../stockBalance.mjs";

export default async function (req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const {
      aluno_id = null,
      forma_pagamento,
      itens,
      idempotency_key = null,
      academy_id = null,
      canal = "presencial",
      cliente_nome = null,
      cliente_telefone = null,
    } = body;
    if (!Array.isArray(itens) || itens.length === 0 || !forma_pagamento) {
      return res.json({ error: "invalid_payload" }, 400);
    }
    for (const it of itens) {
      const quantidade = Number(it.quantidade);
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        return res.json({ error: "quantidade_invalida" }, 400);
      }
      if (!it.item_estoque_id || typeof it.preco_unitario !== "number") {
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
    const FINANCIAL_TX_COL = process.env.FINANCIAL_TX_COL;
    if (!DB_ID || !STOCK_ITEMS_COL || !STOCK_MOVES_COL || !SALES_COL || !SALE_ITEMS_COL) {
      return res.json({ error: "missing_env" }, 500);
    }

    async function mirrorSaleToFinancialTx(vendaId, totalVenda) {
      if (!FINANCIAL_TX_COL || !vendaId) return null;
      try {
        const existing = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
          sdk.Query.equal("saleId", vendaId),
          sdk.Query.limit(1),
        ]);
        if (existing.total > 0) return existing.documents[0].$id;
      } catch (e) {
        console.warn("sale mirror lookup failed", e?.message || e);
      }

      const parts = [];
      for (const it of itens) {
        try {
          const stock = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id);
          const name = itemDisplayName(stock);
          parts.push(it.quantidade > 1 ? `${name} x${it.quantidade}` : name);
        } catch {
          parts.push(it.quantidade > 1 ? `Produto x${it.quantidade}` : "Produto");
        }
      }
      const description = parts.join(", ") || "Venda de produtos";
      const settledAt = new Date().toISOString();
      const payload = {
        academyId: academy_id || "",
        saleId: vendaId,
        lead_id: aluno_id || "",
        method: forma_pagamento,
        installments: 1,
        type: "product",
        planName: description,
        gross: totalVenda,
        fee: 0,
        net: totalVenda,
        status: "settled",
        settledAt,
        note: description,
      };
      try {
        const doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, sdk.ID.unique(), payload);
        return doc.$id;
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("Unknown attribute")) {
          delete payload.lead_id;
          const doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, sdk.ID.unique(), payload);
          return doc.$id;
        }
        console.warn("sale financial_tx mirror failed", msg);
        return null;
      }
    }

    if (idempotency_key) {
      try {
        const existing = await databases.listDocuments(DB_ID, SALES_COL, [
          sdk.Query.equal("idempotency_key", idempotency_key),
          sdk.Query.limit(1),
        ]);
        if (existing.total > 0) {
          const doc = existing.documents[0];
          if (String(doc.status || "") === "concluida") {
            await mirrorSaleToFinancialTx(doc.$id, Number(doc.total || 0));
          }
          console.log(JSON.stringify({ level: "info", action: "sales_create_idempotent_hit", venda_id: doc.$id, status: doc.status }));
          return res.json({ ok: true, venda_id: doc.$id, total: Number(doc.total || 0), status: String(doc.status || "") }, 200);
        }
      } catch (e) {
        console.warn("idempotency lookup failed", e?.message || e);
      }
    }

    const stockSnapshots = {};
    for (const it of itens) {
      const item = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id);
      const disponivel = resolveCurrentQuantity(item);
      if (disponivel < it.quantidade) {
        return res.json(
          {
            error: "no_stock",
            item_estoque_id: it.item_estoque_id,
            disponivel,
            nome: itemDisplayName(item),
          },
          409
        );
      }
      stockSnapshots[it.item_estoque_id] = { current_quantity: disponivel };
    }

    const totalVenda = itens.reduce((acc, it) => acc + it.preco_unitario * it.quantidade, 0);
    const vendaId = sdk.ID.unique();
    const salePayload = {
      academyId: academy_id || null,
      aluno_id: aluno_id || null,
      total: totalVenda,
      forma_pagamento,
      status: "rascunho",
      idempotency_key: idempotency_key || null,
      canal: String(canal || "presencial").slice(0, 32),
    };
    if (cliente_nome) salePayload.cliente_nome = String(cliente_nome).slice(0, 128);
    if (cliente_telefone) salePayload.cliente_telefone = String(cliente_telefone).slice(0, 20);

    let vendaDoc;
    try {
      vendaDoc = await databases.createDocument(DB_ID, SALES_COL, vendaId, salePayload);
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.includes("Unknown attribute")) {
        delete salePayload.canal;
        delete salePayload.cliente_nome;
        delete salePayload.cliente_telefone;
        vendaDoc = await databases.createDocument(DB_ID, SALES_COL, vendaId, salePayload);
      } else {
        throw e;
      }
    }

    const createdItems = [];
    const createdMoves = [];
    const updatedStockIds = [];
    try {
      for (const it of itens) {
        const saleItem = await databases.createDocument(DB_ID, SALE_ITEMS_COL, sdk.ID.unique(), {
          venda_id: vendaDoc.$id,
          item_estoque_id: it.item_estoque_id,
          quantidade: it.quantidade,
          preco_unitario: it.preco_unitario,
        });
        createdItems.push(saleItem.$id);

        const snap = stockSnapshots[it.item_estoque_id];
        const itemDoc = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id);
        const prevQty = resolveCurrentQuantity(itemDoc);
        const newQty = Math.max(0, prevQty - it.quantidade);

        await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id, {
          current_quantity: newQty,
          last_updated: new Date().toISOString(),
        });
        updatedStockIds.push(it.item_estoque_id);

        const move = await databases.createDocument(DB_ID, STOCK_MOVES_COL, sdk.ID.unique(), {
          item_estoque_id: it.item_estoque_id,
          tipo: "saida_venda",
          quantidade: it.quantidade,
          referencia_id: vendaDoc.$id,
          motivo: "venda",
          usuario_id: req.headers["x-user-id"] || "",
          academy_id: academy_id || itemDoc.academy_id || null,
        });
        createdMoves.push(move.$id);
        snap.current_quantity_after = newQty;
      }

      await databases.updateDocument(DB_ID, SALES_COL, vendaDoc.$id, { status: "concluida" });
      await mirrorSaleToFinancialTx(vendaDoc.$id, totalVenda);
      console.log(JSON.stringify({
        level: "info",
        action: "sales_create",
        venda_id: vendaDoc.$id,
        items_count: itens.length,
        total: totalVenda,
        user_id: req.headers["x-user-id"] || "",
        idempotency_key: idempotency_key || null,
      }));
      return res.json({ ok: true, venda_id: vendaDoc.$id, total: totalVenda, status: "concluida" }, 200);
    } catch (err) {
      for (const it of itens) {
        try {
          const snap = stockSnapshots[it.item_estoque_id];
          if (updatedStockIds.includes(it.item_estoque_id) && snap) {
            await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id, {
              current_quantity: snap.current_quantity,
              last_updated: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.warn("rollback stock error", e);
        }
      }
      for (const id of createdItems) {
        try {
          await databases.deleteDocument(DB_ID, SALE_ITEMS_COL, id);
        } catch (e) {
          console.warn("rollback sale_item delete error", e);
        }
      }
      try {
        await databases.deleteDocument(DB_ID, SALES_COL, vendaDoc.$id);
      } catch (e) {
        console.warn("rollback sale delete error", e);
      }
      console.error(JSON.stringify({
        level: "error",
        action: "sales_create_failed",
        venda_id: vendaDoc?.$id || null,
        error: String(err && err.message ? err.message : err),
      }));
      return res.json({ error: "create_failed", detail: String(err && err.message ? err.message : err) }, 500);
    }
  } catch (e) {
    console.error(JSON.stringify({
      level: "error",
      action: "sales_create_server_error",
      error: String(e && e.message ? e.message : e),
    }));
    return res.json({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}
