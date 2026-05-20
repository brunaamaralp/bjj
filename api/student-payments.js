import studentPaymentsHandler from '../lib/server/studentPaymentsHandler.js';

export default function handler(req, res) {
  return studentPaymentsHandler(req, res);
}
