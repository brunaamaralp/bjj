import Anthropic from '@anthropic-ai/sdk';
import { ensureAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    await ensureAuth(req);
  } catch {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const system = String(body.system || '').trim();
  const userContent = String(body.userContent || '').trim();
  if (!system || !userContent) {
    return res.status(400).json({ erro: 'system e userContent obrigatórios' });
  }

  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurado' });
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: userContent }]
    });
    return res.status(200).json({ content: message.content });
  } catch (e) {
    console.error('[generate-prompt]', e?.message || e);
    return res.status(502).json({ erro: e?.message || 'Falha ao gerar prompt' });
  }
}
