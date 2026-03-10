import sdk from "node-appwrite";

export default async function (req, res) {
  let venda_id;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { venda_id: _venda_id, motivo = "cancelamento_venda", idempotency_key = null, academy_id = null } = body;
    venda_id = _venda_id;
    if (!venda_id) return res.json({ error: "invalid_payload" }, 400);

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

    const venda = await databases.getDocument(DB_ID, SALES_COL, venda_id);
    if (!venda || venda.status !== "concluida") {
      return res.json({ error: "invalid_status" }, 400);
    }
    if (academy_id && venda.academyId && String(venda.academyId) !== String(academy_id)) {
      return res.json({ error: "forbidden_tenant" }, 403);
    }

    // Idempotência simples: se já está cancelada, retornar ok
    if (venda.status === "cancelada") {
      console.log(JSON.stringify({ level: "info", action: "sales_cancel_idempotent_hit", venda_id }));
      return res.json({ ok: true, status: "cancelada" }, 200);
    }

    // Listar itens da venda
    const itemsResp = await databases.listDocuments(DB_ID, SALE_ITEMS_COL, [
      sdk.Query.equal("venda_id", venda_id),
      sdk.Query.limit(1000),
    ]);
    const itens = itemsResp.documents;

    // Reversões
    for (const it of itens) {
      const itemStock = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id);
      const vendida = Number(itemStock.quantidade_vendida || 0);
      const novaVendida = vendida - Number(it.quantidade || 0);
      if (novaVendida < 0) return res.json({ error: "invalid_reversal_stock" }, 409);

      await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, it.item_estoque_id, {
        quantidade_vendida: novaVendida
      });

      await databases.createDocument(DB_ID, STOCK_MOVES_COL, sdk.ID.unique(), {
        item_estoque_id: it.item_estoque_id,
        tipo: "reversao_venda",
        quantidade: Number(it.quantidade || 0),
        referencia_id: venda_id,
        motivo,
        usuario_id: req.headers["x-user-id"] || "",
      });
    }

    await databases.updateDocument(DB_ID, SALES_COL, venda_id, { status: "cancelada", cancelada_em: new Date().toISOString(), cancel_motivo: motivo, cancel_idempotency_key: idempotency_key || null });
    console.log(JSON.stringify({ level: "info", action: "sales_cancel", venda_id, motivo }));
    return res.json({ ok: true, status: "cancelada" }, 200);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", action: "sales_cancel_server_error", venda_id, error: String(e && e.message ? e.message : e) }));
    return res.json({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}
