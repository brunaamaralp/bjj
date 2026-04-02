const ZAPSTER_API_BASE_URL = process.env.ZAPSTER_API_BASE_URL || 'https://api.zapsterapi.com';
const ZAPSTER_TOKEN = process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '';

export async function sendZapsterText({ recipient, text, instanceId }) {
  const inst = String(instanceId || '').trim();
  if (!ZAPSTER_TOKEN || !inst) {
    return { ok: false, erro: 'ZAPSTER_TOKEN/instance_id ausentes' };
  }
  const urlBase = String(ZAPSTER_API_BASE_URL || '').replace(/\/+$/, '');
  const url = `${urlBase}/v1/wa/messages`;
  const body = { recipient, text, instance_id: inst };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ZAPSTER_TOKEN}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const raw = await resp.text();
    if (resp.ok) return { ok: true, raw };
    console.error('Zapster send failed', { status: resp.status, body: raw.slice(0, 500) });
    return { ok: false, erro: raw || `HTTP ${resp.status}` };
  } catch (e) {
    console.error('Zapster send error', { erro: e?.message || 'Erro ao enviar' });
    return { ok: false, erro: e?.message || 'Erro ao enviar' };
  }
}
