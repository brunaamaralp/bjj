/**
 * Hub do agente e rotas administrativas (Vercel Hobby).
 * Sub-rotas: process, respond, ai-prompt, nl-action, inventory-adjust/query,
 * import-finance, import-finance-tx, import-bank-statement, academy-create, team-members, whatsapp-templates, academy-settings.
 * Import assistido de produtos (`ai_import_products`) permanece em api/leads.js (limite Hobby).
 */
import { Client, Databases } from 'node-appwrite';
import processHandler from '../lib/server/agentProcess.js';
import respondHandler from '../lib/server/agentRespond.js';
import aiPromptHandler from '../lib/server/aiPrompt.js';
import promptPreviewHandler from '../lib/server/promptPreview.js';
import generatePromptHandler from '../lib/server/generatePromptHandler.js';
import agentTestHandler from '../lib/server/agentTest.js';
import nlActionHandler from '../lib/server/nlActionHandler.js';
import importFinanceHandler from '../lib/server/importFinanceHandler.js';
import importFinanceTxHandler from '../lib/server/importFinanceTxHandler.js';
import importBankStatementHandler from '../lib/server/importBankStatementHandler.js';
import settleFinanceTxHandler from '../lib/server/settleFinanceTxHandler.js';
import cancelFinanceTxHandler from '../lib/server/cancelFinanceTxHandler.js';
import academyCreateHandler from '../lib/server/academiesCreate.js';
import teamMembersHandler from '../lib/server/teamMembers.js';
import academyWhatsappTemplatesHandler from '../lib/server/academyWhatsappTemplatesHandler.js';
import academySettingsHandler from '../lib/server/academySettingsHandler.js';
import followupCopilotHandler from '../lib/server/followupCopilotHandler.js';
import followupInboundHandler from '../lib/server/followupInboundHandler.js';
import followupEventsHandler from '../lib/server/followupEventsHandler.js';
import pagbankEncryptHandler from '../lib/server/pagbankEncryptHandler.js';
import pagbankSubscriberHandler from '../lib/server/pagbankSubscriberHandler.js';
import pagbankSubscriptionHandler from '../lib/server/pagbankSubscriptionHandler.js';
import pagbankSetupHandler from '../lib/server/pagbankSetupHandler.js';
import pagbankPortalTokenHandler from '../lib/server/pagbankPortalTokenHandler.js';
import pagbankPortalInfoHandler from '../lib/server/pagbankPortalInfoHandler.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

const adminClient =
  PROJECT_ID && API_KEY
    ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
    : null;
const adminDatabases = adminClient ? new Databases(adminClient) : null;

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  try {
    const query = req?.query || {};
    const route = query.route || query.action || (Array.isArray(query.slug) ? query.slug?.[0] : query.slug);
    const url = String(req?.url || '');

    if (route === 'process' || url.includes('/process')) return processHandler(req, res);
    if (route === 'respond' || url.includes('/respond')) return respondHandler(req, res);
    if (route === 'ai-prompt' || url.includes('/ai-prompt')) return aiPromptHandler(req, res);
    if (route === 'prompt-preview' || url.includes('prompt-preview')) return promptPreviewHandler(req, res);
    if (route === 'generate-prompt' || url.includes('/generate-prompt')) return generatePromptHandler(req, res);
    if (route === 'test' || url.includes('/test')) return agentTestHandler(req, res);
    if (route === 'nl-action' || url.includes('nl-action')) return nlActionHandler(req, res);
    if (route === 'inventory-adjust' || url.includes('inventory-adjust')) {
      const { default: inventoryAdjustAgent } = await import('../lib/server/inventoryAdjustAgent.js');
      if (!adminDatabases) {
        return res.status(500).json({ error: 'appwrite_not_configured' });
      }
      return inventoryAdjustAgent(req, res, adminDatabases);
    }
    if (route === 'inventory-query' || url.includes('inventory-query')) {
      const { default: inventoryQueryAgent } = await import('../lib/server/inventoryReportAgent.js');
      if (!adminDatabases) {
        return res.status(500).json({ error: 'appwrite_not_configured' });
      }
      return inventoryQueryAgent(req, res, adminDatabases);
    }
    if (route === 'import-finance') return importFinanceHandler(req, res);
    if (route === 'import-finance-tx') return importFinanceTxHandler(req, res);
    if (route === 'import-bank-statement') return importBankStatementHandler(req, res);
    if (route === 'settle-finance-tx') return settleFinanceTxHandler(req, res);
    if (route === 'cancel-finance-tx') return cancelFinanceTxHandler(req, res);
    if (route === 'pagbank-encrypt') return pagbankEncryptHandler(req, res);
    if (route === 'pagbank-subscriber') return pagbankSubscriberHandler(req, res);
    if (route === 'pagbank-subscription') return pagbankSubscriptionHandler(req, res);
    if (route === 'pagbank-setup') return pagbankSetupHandler(req, res);
    if (route === 'pagbank-portal-token') return pagbankPortalTokenHandler(req, res);
    if (route === 'pagbank-portal-info') return pagbankPortalInfoHandler(req, res);
    if (route === 'academy-create') return academyCreateHandler(req, res);
    if (route === 'team-members') return teamMembersHandler(req, res);
    if (route === 'whatsapp-templates' || url.includes('/whatsapp-templates')) {
      return academyWhatsappTemplatesHandler(req, res);
    }
    if (route === 'academy-settings' || url.includes('/academy/settings')) {
      return academySettingsHandler(req, res);
    }
    if (route === 'followup-copilot' || route === 'followup_summary' || route === 'followup_draft' || route === 'lead-summary') {
      return followupCopilotHandler(req, res);
    }
    if (route === 'followup-inbound') {
      return followupInboundHandler(req, res);
    }
    if (route === 'followup-events') {
      return followupEventsHandler(req, res);
    }
    return res.status(404).json({ error: 'invalid_agent_action' });
  } catch (error) {
    console.error('[api/agent] Unhandled error:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      detail: error?.message || 'Falha inesperada no roteador /api/agent',
    });
  }
}
