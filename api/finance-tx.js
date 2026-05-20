import financeTxHandler from '../lib/server/financeTxHandler.js';

export default function handler(req, res) {
  return financeTxHandler(req, res);
}
