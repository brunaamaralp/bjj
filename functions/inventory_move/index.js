import sdk from "node-appwrite";
import { resolveCurrentQuantity, quantityDeltaForMoveType, itemDisplayName } from "../stockBalance.mjs";

const RESTOCK_MARKER = "[stock_restock]";

const itemName = itemDisplayName;

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
    const delta = quantityDeltaForMoveType(tipo, quantidade);
    const prevQty = resolveCurrentQuantity(item);
    if (delta < 0 && prevQty + delta < 0) {
      return res.json({ error: "no_stock" }, 409);
    }

    const known = ["entrada", "ajuste", "saida_venda", "saida_aluguel", "devolucao", "reversao_venda", "avulso"];
    if (!known.includes(String(tipo || "").toLowerCase())) {
      return res.json({ error: "invalid_tipo" }, 400);
    }
    if (["entrada", "saida_venda", "saida_aluguel", "devolucao", "reversao_venda"].includes(tipo) && quantidade < 0) {
      return res.json({ error: "invalid_quantity" }, 400);
    }

    const updates = { last_updated: new Date().toISOString() };
    if (tipo === "avulso") {
      updates.status_par = status_par || item.status_par || "completo";
    } else {
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

    return res.json(
      {
        ok: true,
        movimento_id: move.$id,
        financial_tx_id,
        saldos: {
          current_quantity: newQty,
        },
      },
      200
    );
  } catch (e) {
    return res.json({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}
