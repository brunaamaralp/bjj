import sdk from "node-appwrite";

/** Espelho simplificado do handler Vercel (Appwrite Function). */
function legacyAvailable(item) {
  const total = Number(item.quantidade_total || 0);
  const vendida = Number(item.quantidade_vendida || 0);
  const alugada = Number(item.quantidade_alugada || 0);
  return total - vendida - alugada;
}

function resolveCurrentQuantity(item) {
  const raw = item.current_quantity;
  if (raw !== undefined && raw !== null && raw !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return legacyAvailable(item);
}

function quantityDelta(tipo, quantidade) {
  const q = Number(quantidade);
  if (!Number.isFinite(q) || q === 0) return 0;
  switch (String(tipo || "").toLowerCase()) {
    case "entrada":
    case "devolucao":
    case "reversao_venda":
      return q > 0 ? q : 0;
    case "ajuste":
      return q;
    case "saida_venda":
    case "saida_aluguel":
      return q > 0 ? -q : 0;
    default:
      return 0;
  }
}

const RESTOCK_MARKER = "[stock_restock]";

function itemName(item) {
  return String(item.nome || item.name || item.descricao || item.$id || "").trim() || "Item";
}

function parseItemIdFromDesc(desc) {
  const m = String(desc || "").match(/^item_id:\s*(\S+)/m);
  return m ? m[1] : "";
}

function academyHasFinance(doc) {
  try {
    const mods = typeof doc?.modules === "string" ? JSON.parse(doc.modules) : doc?.modules;
    return mods?.finance === true;
  } catch {
    return false;
  }
}

function parseSettings(raw) {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

export default async function (req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const {
      item_estoque_id,
      tipo,
      quantidade,
      motivo,
      referencia_id,
      usuario_id,
      status_par,
      purchase_price,
      payment_method,
      academy_id,
    } = body;
    if (!item_estoque_id || !tipo || typeof quantidade !== "number" || quantidade === 0) {
      return res.json({ error: "invalid_payload" }, 400);
    }
    if (tipo === "ajuste" && !String(motivo || "").trim()) {
      return res.json({ error: "motivo_required" }, 400);
    }

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY);

    const databases = new sdk.Databases(client);
    const DB_ID = process.env.DB_ID;
    const STOCK_ITEMS_COL = process.env.STOCK_ITEMS_COL;
    const STOCK_MOVES_COL = process.env.STOCK_MOVES_COL;
    const TASKS_COL = process.env.TASKS_COL || process.env.APPWRITE_TASKS_COLLECTION_ID;
    const FINANCIAL_TX_COL = process.env.FINANCIAL_TX_COL;
    const ACADEMIES_COL = process.env.ACADEMIES_COL;
    if (!DB_ID || !STOCK_ITEMS_COL || !STOCK_MOVES_COL) {
      return res.json({ error: "missing_env" }, 500);
    }

    const item = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, item_estoque_id);
    const academyId = String(academy_id || item.academy_id || "").trim();
    const delta = quantityDelta(tipo, quantidade);
    const prevQty = resolveCurrentQuantity(item);
    if (delta < 0 && prevQty + delta < 0) {
      return res.json({ error: "no_stock" }, 409);
    }

    const total = Number(item.quantidade_total || 0);
    const vendida = Number(item.quantidade_vendida || 0);
    const alugada = Number(item.quantidade_alugada || 0);
    const disponivel = total - vendida - alugada;
    let updates = { last_updated: new Date().toISOString() };

    if (tipo === "entrada") {
      if (quantidade < 0) return res.json({ error: "invalid_quantity" }, 400);
      updates.quantidade_total = total + quantidade;
    } else if (tipo === "ajuste") {
      updates.quantidade_total = total + quantidade;
    } else if (tipo === "saida_venda") {
      if (quantidade < 0) return res.json({ error: "invalid_quantity" }, 400);
      if (disponivel < quantidade) return res.json({ error: "no_stock" }, 409);
      updates.quantidade_vendida = vendida + quantidade;
    } else if (tipo === "saida_aluguel") {
      if (quantidade < 0) return res.json({ error: "invalid_quantity" }, 400);
      if (disponivel < quantidade) return res.json({ error: "no_stock" }, 409);
      updates.quantidade_alugada = alugada + quantidade;
    } else if (tipo === "devolucao") {
      if (quantidade < 0) return res.json({ error: "invalid_quantity" }, 400);
      const novaAlugada = alugada - quantidade;
      if (novaAlugada < 0) return res.json({ error: "invalid_return" }, 409);
      updates.quantidade_alugada = novaAlugada;
    } else if (tipo === "reversao_venda") {
      if (quantidade < 0) return res.json({ error: "invalid_quantity" }, 400);
      const novaVendida = vendida - quantidade;
      if (novaVendida < 0) return res.json({ error: "invalid_reversal" }, 409);
      updates.quantidade_vendida = novaVendida;
    } else if (tipo === "avulso") {
      updates.status_par = status_par || item.status_par || "completo";
    } else {
      return res.json({ error: "invalid_tipo" }, 400);
    }

    if (tipo !== "avulso") {
      updates.current_quantity = prevQty + delta;
    }

    const updated = await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, item_estoque_id, updates);

    const movePayload = {
      item_estoque_id,
      tipo,
      quantidade,
      referencia_id: referencia_id || null,
      motivo: motivo || "",
      usuario_id: usuario_id || req.headers["x-user-id"] || "",
    };
    if (purchase_price != null && purchase_price !== "") {
      movePayload.purchase_price = Number(purchase_price);
    }
    if (academyId) movePayload.academy_id = academyId;

    const move = await databases.createDocument(DB_ID, STOCK_MOVES_COL, sdk.ID.unique(), movePayload);

    const newQty = resolveCurrentQuantity(updated);
    const minLevel = Number(updated.minimum_level || 0);
    let financial_tx_id = null;

    if (academyId && TASKS_COL && minLevel > 0) {
      const ymd = new Date().toISOString().slice(0, 10);
      const tasksRes = await databases.listDocuments(DB_ID, TASKS_COL, [
        sdk.Query.equal("academy_id", academyId),
        sdk.Query.equal("status", "pending"),
        sdk.Query.limit(100),
      ]);
      const openRestock = (tasksRes.documents || []).filter(
        (t) =>
          String(t.description || "").includes(RESTOCK_MARKER) &&
          parseItemIdFromDesc(t.description) === item_estoque_id
      );

      if (newQty <= minLevel && openRestock.length === 0) {
        const unit = String(updated.unit || "unidade").trim() || "unidade";
        await databases.createDocument(DB_ID, TASKS_COL, sdk.ID.unique(), {
          academy_id: academyId,
          title: `Repor estoque: ${itemName(updated)}`,
          description: `${RESTOCK_MARKER}\nitem_id:${item_estoque_id}\nSaldo atual: ${newQty} ${unit}. Nível mínimo: ${minLevel}.`,
          status: "pending",
          due_date: ymd,
          assigned_to: "",
          lead_id: "",
          lead_name: "",
          created_by: "system",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else if (newQty > minLevel && openRestock.length > 0) {
        const ts = new Date().toISOString();
        for (const t of openRestock) {
          await databases.updateDocument(DB_ID, TASKS_COL, t.$id, { status: "done", updated_at: ts });
        }
      }
    }

    if (tipo === "entrada" && purchase_price != null && FINANCIAL_TX_COL && ACADEMIES_COL && academyId) {
      try {
        const acad = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (academyHasFinance(acad)) {
          const settings = parseSettings(acad.settings);
          const category =
            String(settings.stockPurchaseExpenseCategory || "").trim() || "Estoque / Insumos";
          const unit = String(updated.unit || "unidade").trim() || "unidade";
          const price = Number(purchase_price);
          if (Number.isFinite(price) && price > 0) {
            const fin = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, sdk.ID.unique(), {
              academyId,
              saleId: "",
              method: String(payment_method || "pix").trim() || "pix",
              installments: 1,
              type: "expense",
              planName: category,
              gross: price,
              fee: 0,
              net: price,
              status: "settled",
              note: `Compra de estoque: ${itemName(updated)} — ${quantidade} ${unit}`,
              settledAt: new Date().toISOString(),
            });
            financial_tx_id = fin.$id;
          }
        }
      } catch (e) {
        console.warn("finance expense skip", e?.message || e);
      }
    }

    const novoTotal = Number(updated.quantidade_total || 0);
    const novaVendida = Number(updated.quantidade_vendida || 0);
    const novaAlugada = Number(updated.quantidade_alugada || 0);

    return res.json(
      {
        ok: true,
        movimento_id: move.$id,
        financial_tx_id,
        saldos: {
          current_quantity: newQty,
          total: novoTotal,
          vendida: novaVendida,
          alugada: novaAlugada,
          disponivel: novoTotal - novaVendida - novaAlugada,
        },
      },
      200
    );
  } catch (e) {
    return res.json({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}
