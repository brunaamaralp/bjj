import createHandler from './_lib/academiesCreate.js';
import membersHandler from './_lib/teamMembers.js';

export default async function handler(req, res) {
  const route = req.query.route || req.query.action || (Array.isArray(req.query.slug) ? req.query.slug?.[0] : req.query.slug);
  if (route === 'create' || req.url.includes('/create')) return createHandler(req, res);
  if (route === 'members' || req.url.includes('/members')) return membersHandler(req, res);
  return res.status(404).json({ error: 'invalid_academy_action' });
}