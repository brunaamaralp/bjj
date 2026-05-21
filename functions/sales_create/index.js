import sdk from "node-appwrite";
import { resolveCurrentQuantity, itemDisplayName } from "../stockBalance.mjs";
import {
  normalizePagamentosInput,
  validatePagamentosAgainstTotal,
  buildFormaPagamentoResumo,
  roundMoney,
} from "../salePayments.mjs";

const CAT_VENDA = { type: "product", label: "Vendas de produtos" };
const CAT_TROCO = { type: "expense_operational", label: "Outras despesas" };

export default async function (req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const {
      aluno_id = null,
      forma_pagamento,
      pagamentos: pagamentosRaw,
      itens,
      idempotency_key = null,
      academy_id = null,
      canal = "presencial",
      cliente_nome = null,
      cliente_telefone = null,
    } = body;

    const hasPagamentos = Array.isArray(pagamentosRaw) && pagamentosRaw.length > 0;
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.json({ error: "invalid_payload" }, 400);
    }
    if (!hasPagamentos && !forma_pagamento) {
      return res.json({ error: "invalid_payload" }, 400);
    }
    for (const it of itens) {
      const quantidade = Number(it.quantidade);
      if (!Number.isInteger(quantidade) || quantidade < 1) {
        return res.json({ error: "quantidade_invalida" }, 400);
      }
      const stockId = it.product_variant_id || it.item_estoque_id;
      if (!stockId || typeof it.preco_unitario !== "number") {
        return res.json({ error: "invalid_item" }, 400);
      }
      it._stock_id = stockId;
    }

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY);

    const databases = new sdk.Databases(client);
    const DB_ID = process.env.DB_ID;
    const STOCK_ITEMS_COL = process.env.STOCK_ITEMS_COL;
    const PRODUCT_VARIANTS_COL =
      process.env.PRODUCT_VARIANTS_COL || process.env.VITE_APPWRITE_PRODUCT_VARIANTS_COLLECTION_ID || "";
    const STOCK_MOVES_COL = process.env.STOCK_MOVES_COL;
    const SALES_COL = process.env.SALES_COL;
    const SALE_ITEMS_COL = process.env.SALE_ITEMS_COL;
    const FINANCIAL_TX_COL = process.env.FINANCIAL_TX_COL;
    const ACADEMIES_COL =
      process.env.ACADEMIES_COL || process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || "";
    if (!DB_ID || !STOCK_ITEMS_COL || !STOCK_MOVES_COL || !SALES_COL || !SALE_ITEMS_COL) {
      return res.json({ error: "missing_env" }, 500);
    }

    async function buildSaleDescription() {
      const parts = [];
      for (const it of itens) {
        try {
          const stockId = it._stock_id || it.product_variant_id || it.item_estoque_id;
          const stock = (await getStockDocument(stockId)).doc;
          const name = itemDisplayName(stock);
          parts.push(it.quantidade > 1 ? `${name} x${it.quantidade}` : name);
        } catch {
          parts.push(it.quantidade > 1 ? `Produto x${it.quantidade}` : "Produto");
        }
      }
      return parts.join(", ") || "Venda de produtos";
    }

    async function listSaleFinancialTx(vendaId) {
      if (!FINANCIAL_TX_COL || !vendaId) return [];
      try {
        const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
          sdk.Query.equal("saleId", vendaId),
          sdk.Query.limit(25),
        ]);
        return res.documents || [];
      } catch (e) {
        console.warn("sale financial_tx list failed", e?.message || e);
        return [];
      }
    }

    async function createFinancialTx(payload) {
      try {
        return await databases.createDocument(DB_ID, FINANCIAL_TX_COL, sdk.ID.unique(), payload);
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("Unknown attribute")) {
          delete payload.lead_id;
          return await databases.createDocument(DB_ID, FINANCIAL_TX_COL, sdk.ID.unique(), payload);
        }
        throw e;
      }
    }

    async function mirrorLegacySingleTx(vendaId, totalVenda, method, description) {
      if (!FINANCIAL_TX_COL || !vendaId) return { warnings: [] };
      const existing = await listSaleFinancialTx(vendaId);
      if (existing.some((d) => String(d.type || "") === "product")) {
        return { warnings: [] };
      }
      const settledAt = new Date().toISOString();
      try {
        await createFinancialTx({
          academyId: academy_id || "",
          saleId: vendaId,
          lead_id: aluno_id || "",
          method: method || "pix",
          installments: 1,
          type: CAT_VENDA.type,
          category: CAT_VENDA.label,
          planName: description,
          gross: totalVenda,
          fee: 0,
          net: totalVenda,
          direction: "in",
          status: "settled",
          settledAt,
          note: description,
          origin_type: "sale",
          origin_id: vendaId,
        });
      } catch (e) {
        console.warn("sale financial_tx mirror failed", e?.message || e);
      }
      return { warnings: [] };
    }

    async function mirrorMixedPayments(vendaId, pagamentosNorm, description) {
      const warnings = [];
      if (!FINANCIAL_TX_COL || !vendaId) return { warnings };

      const existing = await listSaleFinancialTx(vendaId);
      const settledAt = new Date().toISOString();
      const shortId = String(vendaId).slice(-4).toUpperCase();

      for (const p of pagamentosNorm) {
        const gross = roundMoney(p.valor);
        const already = existing.some(
          (d) =>
            String(d.type || "") === "product" &&
            String(d.method || "") === p.forma &&
            Math.abs(Number(d.gross || 0) - gross) < 0.01
        );
        if (already) continue;
        try {
          const doc = await createFinancialTx({
            academyId: academy_id || "",
            saleId: vendaId,
            lead_id: aluno_id || "",
            method: p.forma,
            installments: 1,
            type: CAT_VENDA.type,
            category: CAT_VENDA.label,
            planName: description,
            gross,
            fee: 0,
            net: gross,
            direction: "in",
            status: "settled",
            settledAt,
            note: description,
            origin_type: "sale",
            origin_id: vendaId,
          });
          existing.push(doc);
        } catch (e) {
          console.warn("sale payment mirror failed", p.forma, e?.message || e);
          warnings.push(`Não foi possível registrar no caixa: ${p.forma}`);
        }
      }

      for (const p of pagamentosNorm) {
        const troco = roundMoney(p.troco || 0);
        if (troco <= 0) continue;
        const formaTroco = p.forma_troco || "pix";
        const note = `Troco — venda #${shortId}`;
        const already = existing.some(
          (d) =>
            String(d.type || "") === "expense" &&
            String(d.method || "") === formaTroco &&
            Math.abs(Number(d.gross || 0) - troco) < 0.01
        );
        if (already) continue;
        try {
          const doc = await createFinancialTx({
            academyId: academy_id || "",
            saleId: vendaId,
            lead_id: aluno_id || "",
            method: formaTroco,
            installments: 1,
            type: CAT_TROCO.type,
            category: CAT_TROCO.label,
            planName: note,
            gross: troco,
            fee: 0,
            net: troco,
            status: "settled",
            settledAt,
            note,
          });
          existing.push(doc);
        } catch (e) {
          console.warn("sale troco mirror failed", e?.message || e);
          warnings.push(`Troco (${formaTroco}) não registrado no caixa — confira manualmente.`);
        }
      }

      return { warnings };
    }

    async function mirrorSaleFinancials(vendaId, totalVenda, pagamentosNorm, formaLegacy, description) {
      if (pagamentosNorm?.length) {
        return mirrorMixedPayments(vendaId, pagamentosNorm, description);
      }
      return mirrorLegacySingleTx(vendaId, totalVenda, formaLegacy, description);
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
            const description = await buildSaleDescription();
            let pagamentosNorm = [];
            if (doc.pagamentos_json) {
              try {
                pagamentosNorm = normalizePagamentosInput(JSON.parse(doc.pagamentos_json));
              } catch {
                pagamentosNorm = [];
              }
            }
            await mirrorSaleFinancials(
              doc.$id,
              Number(doc.total || 0),
              pagamentosNorm,
              doc.forma_pagamento,
              description
            );
          }
          console.log(JSON.stringify({ level: "info", action: "sales_create_idempotent_hit", venda_id: doc.$id, status: doc.status }));
          return res.json({ ok: true, venda_id: doc.$id, total: Number(doc.total || 0), status: String(doc.status || "") }, 200);
        }
      } catch (e) {
        console.warn("idempotency lookup failed", e?.message || e);
      }
    }

    async function getStockDocument(stockId) {
      if (PRODUCT_VARIANTS_COL) {
        try {
          return { col: PRODUCT_VARIANTS_COL, doc: await databases.getDocument(DB_ID, PRODUCT_VARIANTS_COL, stockId) };
        } catch {
          void 0;
        }
      }
      return { col: STOCK_ITEMS_COL, doc: await databases.getDocument(DB_ID, STOCK_ITEMS_COL, stockId) };
    }

    const stockSnapshots = {};
    for (const it of itens) {
      const stockId = it._stock_id;
      const { col, doc: item } = await getStockDocument(stockId);
      const disponivel = resolveCurrentQuantity(item);
      if (disponivel < it.quantidade) {
        return res.json(
          {
            error: "no_stock",
            item_estoque_id: stockId,
            product_variant_id: stockId,
            disponivel,
            nome: itemDisplayName(item),
          },
          409
        );
      }
      stockSnapshots[stockId] = { current_quantity: disponivel, col };
    }

    const totalVenda = itens.reduce((acc, it) => acc + it.preco_unitario * it.quantidade, 0);
    const totalRounded = roundMoney(totalVenda);

    let pagamentosNorm = [];
    let formaFinal = String(forma_pagamento || "").trim();
    let pagamentosJson = null;

    if (hasPagamentos) {
      pagamentosNorm = normalizePagamentosInput(pagamentosRaw);
      if (!pagamentosNorm.length) {
        return res.json({ error: "invalid_pagamentos" }, 400);
      }
      const check = validatePagamentosAgainstTotal(pagamentosNorm, totalRounded);
      if (!check.ok) {
        return res.json(
          {
            error: "pagamentos_total_mismatch",
            expected: totalRounded,
            received: check.net,
          },
          400
        );
      }
      formaFinal = buildFormaPagamentoResumo(pagamentosNorm);
      pagamentosJson = JSON.stringify(pagamentosNorm);
      if (pagamentosJson.length > 1024) {
        return res.json({ error: "pagamentos_json_too_large" }, 400);
      }
    }

    const vendaId = sdk.ID.unique();
    const salePayload = {
      academyId: academy_id || null,
      aluno_id: aluno_id || null,
      total: totalRounded,
      forma_pagamento: formaFinal,
      status: "rascunho",
      idempotency_key: idempotency_key || null,
      canal: String(canal || "presencial").slice(0, 32),
    };
    if (pagamentosJson) salePayload.pagamentos_json = pagamentosJson;
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
        if (msg.includes("pagamentos_json")) delete salePayload.pagamentos_json;
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
        const stockId = it._stock_id || it.product_variant_id || it.item_estoque_id;
        const saleItemPayload = {
          venda_id: vendaDoc.$id,
          item_estoque_id: stockId,
          quantidade: it.quantidade,
          preco_unitario: it.preco_unitario,
        };
        let saleItem;
        try {
          saleItem = await databases.createDocument(DB_ID, SALE_ITEMS_COL, sdk.ID.unique(), {
            ...saleItemPayload,
            product_variant_id: stockId,
          });
        } catch (e) {
          const msg = String(e?.message || "");
          if (msg.includes("Unknown attribute")) {
            saleItem = await databases.createDocument(DB_ID, SALE_ITEMS_COL, sdk.ID.unique(), saleItemPayload);
          } else {
            throw e;
          }
        }
        createdItems.push(saleItem.$id);

        const snap = stockSnapshots[stockId];
        const stockCol = snap?.col || STOCK_ITEMS_COL;
        const itemDoc = await databases.getDocument(DB_ID, stockCol, stockId);
        const prevQty = resolveCurrentQuantity(itemDoc);
        const newQty = Math.max(0, prevQty - it.quantidade);

        await databases.updateDocument(DB_ID, stockCol, stockId, {
          current_quantity: newQty,
          last_updated: new Date().toISOString(),
        });
        updatedStockIds.push(stockId);

        const move = await databases.createDocument(DB_ID, STOCK_MOVES_COL, sdk.ID.unique(), {
          item_estoque_id: stockId,
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
      const description = await buildSaleDescription();
      const mirrorResult = await mirrorSaleFinancials(
        vendaDoc.$id,
        totalRounded,
        pagamentosNorm,
        formaFinal,
        description
      );

      console.log(JSON.stringify({
        level: "info",
        action: "sales_create",
        venda_id: vendaDoc.$id,
        items_count: itens.length,
        total: totalRounded,
        payments_count: pagamentosNorm.length || 1,
        user_id: req.headers["x-user-id"] || "",
        idempotency_key: idempotency_key || null,
      }));
      return res.json(
        {
          ok: true,
          venda_id: vendaDoc.$id,
          total: totalRounded,
          status: "concluida",
          troco_warnings: mirrorResult.warnings || [],
        },
        200
      );
    } catch (err) {
      for (const it of itens) {
        try {
          const snap = stockSnapshots[it.item_estoque_id];
          const stockId = it._stock_id || it.product_variant_id || it.item_estoque_id;
          if (updatedStockIds.includes(stockId) && snap) {
            const stockCol = snap.col || STOCK_ITEMS_COL;
            await databases.updateDocument(DB_ID, stockCol, stockId, {
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
