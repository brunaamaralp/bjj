import sdk from "node-appwrite";

export default async function (req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = String(body.action || "").toLowerCase();
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_ENDPOINT || process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY);
    const databases = new sdk.Databases(client);
    const DB_ID = process.env.DB_ID;
    const FINANCIAL_TX_COL = process.env.FINANCIAL_TX_COL;
    if (!DB_ID || !FINANCIAL_TX_COL) {
      return res.json({ error: "missing_env" }, 500);
    }
    if (action === "create") {
      const {
        academyId, saleId = "", method, installments = 1,
        type, planName = "", gross, fee, net
      } = body;
      if (!academyId || !method || !type || typeof gross !== "number" || typeof fee !== "number" || typeof net !== "number") {
        return res.json({ error: "invalid_payload" }, 400);
      }
      const doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, sdk.ID.unique(), {
        academyId, saleId, method, installments: Number(installments) || 1,
        type, planName, gross, fee, net, status: "pending"
      });
      return res.json({ ok: true, id: doc.$id }, 200);
    }
    if (action === "settle") {
      const { id } = body;
      if (!id) return res.json({ error: "invalid_payload" }, 400);
      await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, id, {
        status: "settled",
        settledAt: new Date().toISOString()
      });
      return res.json({ ok: true }, 200);
    }
    return res.json({ error: "invalid_action" }, 400);
  } catch (e) {
    return res.json({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}
