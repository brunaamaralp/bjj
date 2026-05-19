import { handleGetContracts, handlePostContract, jsonResponse } from '../../../lib/contracts/contractHttp.js';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    return handlePostContract(formData);
  } catch (err) {
    console.error('[app/api/contracts POST]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  return handleGetContracts(searchParams);
}
