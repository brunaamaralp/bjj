import portalInviteHandler from './portalInviteHandler.js';
import portalActivateHandler from './portalActivateHandler.js';
import portalContextHandler from './portalContextHandler.js';
import portalProfileHandler from './portalProfileHandler.js';
import portalFinanceHandler from './portalFinanceHandler.js';
import portalAttendanceHandler from './portalAttendanceHandler.js';
import portalGuidesHandler from './portalGuidesHandler.js';
import portalGuidesManageHandler from './portalGuidesManageHandler.js';
import portalLinkSiblingHandler from './portalLinkSiblingHandler.js';
import portalContractsHandler from './portalContractsHandler.js';
import portalPasswordHandler from './portalPasswordHandler.js';

/**
 * Hub /api/leads?route=portal-*
 */
export default async function portalRouter(req, res) {
  const route = String(req.query?.route || '').trim();

  if (route === 'portal-invite') return portalInviteHandler(req, res);
  if (route === 'portal-activate') return portalActivateHandler(req, res);
  if (route === 'portal-context') return portalContextHandler(req, res);
  if (route === 'portal-profile') return portalProfileHandler(req, res);
  if (route === 'portal-finance') return portalFinanceHandler(req, res);
  if (route === 'portal-attendance') return portalAttendanceHandler(req, res);
  if (route === 'portal-guides') return portalGuidesHandler(req, res);
  if (route === 'portal-guides-manage') return portalGuidesManageHandler(req, res);
  if (route === 'portal-link-sibling') return portalLinkSiblingHandler(req, res);
  if (route === 'portal-contracts') return portalContractsHandler(req, res);
  if (route === 'portal-password') return portalPasswordHandler(req, res);

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ sucesso: false, erro: 'portal_route_not_found', route }));
  return null;
}
