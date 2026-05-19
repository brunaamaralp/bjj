import { handleGetContractById, jsonResponse } from '../../../../lib/contracts/contractHttp.js';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = await context.params;
    return handleGetContractById(id);
  } catch (err) {
    console.error('[app/api/contracts/[id] GET]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
