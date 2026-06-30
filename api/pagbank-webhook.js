import pagbankWebhookHandler from '../lib/server/pagbankWebhookHandler.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  return pagbankWebhookHandler(req, res);
}
