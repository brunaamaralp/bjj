import sdk from "node-appwrite";
import { resolveCurrentQuantity, itemDisplayName } from "../stockBalance.mjs";

export default async function (req, res) {
  let venda_id;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const {
      venda_id: _venda_id,
      motivo = "cancelamento_venda",
      idempotency_key = null,
      academy_id = null,
    } = body;
    venda_id = _venda_id;
    if (!venda_id) return res.json({ error: "invalid_payload" }, 400);
    if (!String(motivo || "").trim()) return res.json({ error: "motivo_required" }, 400);

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

    const venda = await databases.getDocument(DB_ID, SALES_COL, venda_id);
    if (!venda) return res.json({ error: "not_found" }, 404);
    if (academy_id && venda.academyId && String(venda.academyId) !== String(academy_id)) {
      return res.json({ error: "forbidden_tenant" }, 403);
    }

    if (String(venda.status || "").toLowerCase() === "cancelada") {
      console.log(JSON.stringify({ level: "info", action: "sales_cancel_idempotent_hit", venda_id }));
      return res.json({
        ok: true,
        status: "cancelada",
        venda_id,
        cancelada_em: venda.cancelada_em || null,
        cancel_motivo: venda.cancel_motivo || motivo,
        refund_total: 0,
        items: [],
      }, 200);
    }

    if (venda.status !== "concluida") {
      return res.json({ error: "invalid_status" }, 400);
    }

    const itemsResp = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
      sdk.Query.equal("venda_id", venda_id),
      sdk.Query.limit(1000),
    ]);
    const itens = itemsResp.documents;
    const revertedItems = [];

    for (const it of itens) {
      const qty = Number(it.quantidade || 0);
      if (qty <= 0) continue;

      const itemStock = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id);
      const prevQty = resolveCurrentQuantity(itemStock);
      const newQty = prevQty + qty;

      await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id, {
        current_quantity: newQty,
        last_updated: new Date().toISOString(),
      });

      await databases.createDocument(DB_ID, STOCK_MOVES_COL, sdk.ID.unique(), {
        item_estoque_id: it.item_estoque_id,
        tipo: "reversao_venda",
        quantidade: qty,
        referencia_id: venda_id,
        motivo,
        usuario_id: req.headers["x-user-id"] || "",
        academy_id: academy_id || itemStock.academy_id || null,
      });

      revertedItems.push({
        item_estoque_id: it.item_estoque_id,
        display_label: itemDisplayName(itemStock),
        quantidade: qty,
      });
    }

    let refund_total = 0;
    const totalVenda = Number(venda.total || 0);
    const shortId = String(venda_id).slice(-4).toUpperCase();
    const estornoNote = `Estorno venda #${shortId}`;

    if (FINANCIAL_TX_COL) {
      try {
        const txList = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
          sdk.Query.equal("saleId", venda_id),
          sdk.Query.limit(20),
        ]);
        const docs = txList.documents || [];
        const original = docs.find((d) => String(d.type || "").toLowerCase() !== "refund");
        if (original) {
          await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, original.$id, {
            status: "cancelled",
          });
        }
        if (totalVenda > 0 && !docs.some((d) => String(d.type || "").toLowerCase() === "refund")) {
          const refundPayload = {
            academyId: academy_id || venda.academyId || "",
            saleId: venda_id,
            method: venda.forma_pagamento || "pix",
            installments: 1,
            type: "refund",
            planName: estornoNote,
            gross: -totalVenda,
            fee: 0,
            net: -totalVenda,
            status: "settled",
            settledAt: new Date().toISOString(),
            note: estornoNote,
          };
          try {
            await databases.createDocument(DB_ID, FINANCIAL_TX_COL, sdk.ID.unique(), refundPayload);
          } catch (e) {
            const msg = String(e?.message || e);
            if (msg.includes("Unknown attribute")) {
              delete refundPayload.lead_id;
              await databases.createDocument(DB_ID, FINANCIAL_TX_COL, sdk.ID.unique(), refundPayload);
            } else {
              throw e;
            }
          }
          refund_total = totalVenda;
        }
      } catch (e) {
        console.error(JSON.stringify({
          level: "error",
          action: "sales_cancel_financial_refund",
          venda_id,
          error: String(e?.message || e),
        }));
        return res.json({ error: "financial_refund_failed", detail: String(e?.message || e) }, 500);
      }
    }

    const cancelada_em = new Date().toISOString();
    await databases.updateDocument(DB_ID, SALES_COL, venda_id, {
      status: "cancelada",
      cancelada_em,
      cancel_motivo: String(motivo).trim().slice(0, 256),
      cancel_idempotency_key: idempotency_key || null,
    });

    console.log(JSON.stringify({ level: "info", action: "sales_cancel", venda_id, motivo, refund_total }));
    return res.json({
      ok: true,
      status: "cancelada",
      venda_id,
      cancelada_em,
      cancel_motivo: String(motivo).trim(),
      refund_total,
      items: revertedItems,
    }, 200);
  } catch (e) {
    console.error(JSON.stringify({
      level: "error",
      action: "sales_cancel_server_error",
      venda_id,
      error: String(e && e.message ? e.message : e),
    }));
    return res.json({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}
