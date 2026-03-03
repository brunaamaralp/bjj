import sdk from "node-appwrite";

export default async function (req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { item_estoque_id, tipo, quantidade, motivo, referencia_id, usuario_id } = body;
    if (!item_estoque_id || !tipo || typeof quantidade !== "number" || quantidade === 0) {
      return res.json({ error: "invalid_payload" }, 400);
    }

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY);

    const databases = new sdk.Databases(client);
    const DB_ID = process.env.DB_ID;
    const STOCK_ITEMS_COL = process.env.STOCK_ITEMS_COL;
    const STOCK_MOVES_COL = process.env.STOCK_MOVES_COL;
    if (!DB_ID || !STOCK_ITEMS_COL || !STOCK_MOVES_COL) {
      return res.json({ error: "missing_env" }, 500);
    }

    const item = await databases.getDocument(DB_ID, STOCK_ITEMS_COL, item_estoque_id);
    const total = Number(item.quantidade_total || 0);
    const vendida = Number(item.quantidade_vendida || 0);
    const alugada = Number(item.quantidade_alugada || 0);
    const disponivel = total - vendida - alugada;

    let updates = {};
    if (tipo === "entrada") {
      if (quantidade < 0) return res.json({ error: "invalid_quantity" }, 400);
      updates.quantidade_total = total + quantidade;
    } else if (tipo === "ajuste") {
      if (!motivo) return res.json({ error: "motivo_required" }, 400);
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
      updates.status_par = body.status_par || item.status_par || "completo";
    } else {
      return res.json({ error: "invalid_tipo" }, 400);
    }

    const updated = Object.keys(updates).length > 0
      ? await databases.updateDocument(DB_ID, STOCK_ITEMS_COL, item_estoque_id, updates)
      : item;

    const move = await databases.createDocument(DB_ID, STOCK_MOVES_COL, sdk.ID.unique(), {
      item_estoque_id,
      tipo,
      quantidade,
      referencia_id: referencia_id || null,
      motivo: motivo || "",
      usuario_id: usuario_id || req.headers["x-user-id"] || "",
    });

    const novoTotal = Number(updated.quantidade_total || 0);
    const novaVendida = Number(updated.quantidade_vendida || vendida);
    const novaAlugada = Number(updated.quantidade_alugada || alugada);
    const novoDisponivel = novoTotal - novaVendida - novaAlugada;

    return res.json({
      ok: true,
      movimento_id: move.$id,
      saldos: {
        total: novoTotal,
        vendida: novaVendida,
        alugada: novaAlugada,
        disponivel: novoDisponivel
      }
    }, 200);
  } catch (e) {
    return res.json({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}
