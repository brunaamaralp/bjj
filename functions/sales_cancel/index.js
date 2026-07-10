import sdk from "node-appwrite";
import { resolveCurrentQuantity, itemDisplayName } from "../stockBalance.mjs";
import {
  buildCancelStockPatch,
  cancelStockMoveTipoForLineKind,
  normalizeLineKind,
} from "../../src/lib/saleLineKind.js";
import {
  getUserFromRequest,
  assertUserAcademyAccess,
  isAcademyOwnerOrAdminUser,
} from "../academyAuth.mjs";

const TRACE_ATTRS = [
  "movement_kind",
  "product_id",
  "sale_id",
  "sale_item_id",
  "lead_id",
  "unit_price",
  "line_total",
  "payment_status_at_move",
  "payment_method",
  "usuario_name",
  "cmv_unit",
  "source",
  "notes",
];

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function createStockMoveEnriched(databases, DB_ID, col, payload) {
  let doc = { ...payload };
  for (let i = 0; i < TRACE_ATTRS.length + 3; i++) {
    try {
      return await databases.createDocument(DB_ID, col, sdk.ID.unique(), doc);
    } catch (e) {
      const msg = String(e?.message || "");
      const m = msg.match(/Unknown attribute:\s*"?([^"\s]+)"?/i);
      if (!m) throw e;
      const next = { ...doc };
      delete next[m[1]];
      doc = next;
    }
  }
  return databases.createDocument(DB_ID, col, sdk.ID.unique(), {
    item_estoque_id: payload.item_estoque_id,
    tipo: payload.tipo,
    quantidade: payload.quantidade,
    referencia_id: payload.referencia_id,
    motivo: payload.motivo,
    usuario_id: payload.usuario_id,
    academy_id: payload.academy_id,
  });
}

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

    const me = await getUserFromRequest(req);
    if (!me) return res.json({ ok: false, error: "unauthorized" }, 401);

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

    const vendaAcademyId = String(venda.academyId || venda.academy_id || "").trim();
    if (!vendaAcademyId) return res.json({ ok: false, error: "academy_missing" }, 400);

    const bodyAcademyId = String(academy_id || "").trim();
    if (bodyAcademyId && String(bodyAcademyId) !== String(vendaAcademyId)) {
      return res.json({ ok: false, error: "forbidden" }, 403);
    }

    const accessCtx = await assertUserAcademyAccess(me, vendaAcademyId, databases);
    if (!accessCtx) return res.json({ ok: false, error: "forbidden" }, 403);

    const canCancel = await isAcademyOwnerOrAdminUser(accessCtx.academyDoc, me.$id, accessCtx.teamsApi);
    if (!canCancel) return res.json({ ok: false, error: "forbidden" }, 403);

    const academyId = vendaAcademyId;

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

    const st = String(venda.status || "").toLowerCase();
    if (!["concluida", "pendente", "parcial"].includes(st)) {
      return res.json({ error: "invalid_status" }, 400);
    }

    const itemsResp = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
      sdk.Query.equal("venda_id", venda_id),
      sdk.Query.limit(1000),
    ]);
    const itens = itemsResp.documents;
    const revertedItems = [];
    const canceladoPor = String(
      req.headers["x-user-name"] || venda.created_by_name || ""
    ).trim();
    const usuarioId = String(req.headers["x-user-id"] || venda.created_by || "").trim();
    const PRODUCT_VARIANTS_COL = process.env.PRODUCT_VARIANTS_COL || "";

    for (const it of itens) {
      const qty = Number(it.quantidade || 0);
      if (qty <= 0) continue;

      const stockId = String(it.product_variant_id || it.item_estoque_id || "").trim();
      let itemStock;
      let stockCol = STOCK_ITEMS_COL;
      try {
        itemStock = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, stockId);
      } catch {
        if (PRODUCT_VARIANTS_COL) {
          itemStock = await databases.getDocument(DB_ID, PRODUCT_VARIANTS_COL, stockId);
          stockCol = PRODUCT_VARIANTS_COL;
        } else {
          throw new Error("stock_item_not_found");
        }
      }
      const stockAcademyId = String(itemStock.academy_id || itemStock.academyId || "").trim();
      if (stockAcademyId && String(stockAcademyId) !== String(academyId)) {
        return res.json({ ok: false, error: "forbidden" }, 403);
      }
      const lineKind = normalizeLineKind(it.line_kind);
      const prevQty = resolveCurrentQuantity(itemStock);
      const stockPatch = buildCancelStockPatch(itemStock, qty, lineKind);

      await databases.updateDocument(DB_ID, stockCol, stockId, {
        ...stockPatch,
        last_updated: new Date().toISOString(),
      });

      const unitPrice = Number(it.preco_unitario) || 0;
      const isRental = lineKind === "rental";
      const movePayload = {
        item_estoque_id: stockId,
        tipo: cancelStockMoveTipoForLineKind(lineKind),
        quantidade: qty,
        referencia_id: venda_id,
        motivo: isRental ? "cancelamento_aluguel" : motivo,
        usuario_id: usuarioId,
        academy_id: academyId || itemStock.academy_id || null,
        movement_kind: isRental ? "rental" : "return",
        sale_id: venda_id,
        sale_item_id: it.$id || null,
        lead_id: venda.aluno_id || null,
        product_id: itemStock.product_id || null,
        unit_price: unitPrice > 0 ? roundMoney(unitPrice) : null,
        line_total: unitPrice > 0 ? roundMoney(unitPrice * qty) : null,
        payment_status_at_move: "cancelled",
        usuario_name: canceladoPor || null,
        notes: String(motivo || "").trim().slice(0, 512) || null,
        source: "pos",
      };

      await createStockMoveEnriched(databases, DB_ID, STOCK_MOVES_COL, movePayload);

      revertedItems.push({
        item_estoque_id: stockId,
        display_label: itemDisplayName(itemStock),
        quantidade: qty,
      });
    }

    let refund_total = 0;
    const shortId = String(venda_id).slice(-4).toUpperCase();
    const estornoNote = `Estorno venda #${shortId}`;

    if (FINANCIAL_TX_COL) {
      try {
        const txList = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
          sdk.Query.equal("saleId", venda_id),
          sdk.Query.limit(20),
        ]);
        const docs = txList.documents || [];
        const hasRefund = docs.some((d) => {
          const type = String(d.type || "").toLowerCase();
          const origin = String(d.origin_type || "").toLowerCase();
          return type === "refund" || origin === "reversal";
        });

        let primarySettledId = null;
        let settledRefundTotal = 0;

        for (const tx of docs) {
          const type = String(tx.type || "").toLowerCase();
          const origin = String(tx.origin_type || "").toLowerCase();
          if (type === "refund" || origin === "reversal") continue;
          if (String(tx.status || "").toLowerCase() === "cancelled") continue;

          const txStatus = String(tx.status || "").toLowerCase();
          if (txStatus === "settled") {
            settledRefundTotal += roundMoney(Number(tx.net) || Number(tx.gross) || 0);
            if (!primarySettledId) primarySettledId = tx.$id;
          }

          await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, tx.$id, {
            status: "cancelled",
            settledAt: "",
          });
        }

        settledRefundTotal = roundMoney(settledRefundTotal);
        if (settledRefundTotal > 0 && primarySettledId && !hasRefund) {
          const refundSettledAt = new Date().toISOString();
          const refundPayload = {
            academyId: academyId || venda.academyId || "",
            saleId: venda_id,
            method: venda.forma_pagamento || "pix",
            installments: 1,
            type: "refund",
            category: "Cancelamentos",
            competence_month: refundSettledAt.slice(0, 7),
            planName: estornoNote,
            gross: settledRefundTotal,
            fee: 0,
            net: settledRefundTotal,
            direction: "out",
            status: "settled",
            settledAt: refundSettledAt,
            note: estornoNote,
            origin_type: "reversal",
            origin_id: primarySettledId,
            reverses_id: primarySettledId,
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
          refund_total = settledRefundTotal;
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
