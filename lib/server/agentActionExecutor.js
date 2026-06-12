import { Client, Databases } from 'node-appwrite';
import { humanHandoffIsActive } from '../../lib/humanHandoffUntil.js';
import { readAgentState, writeAgentState } from './conversationsStore.js';
import { isAiActionAllowed, isConversationTimelineEnabled } from './agentActionPolicy.js';
import { intakeMissingFieldsForTier } from './agentStateMerge.js';
import { recordConversationHighlight } from './conversationTimeline.js';
import { wasActionProcessed, recordAiAction } from './agentActionAudit.js';
import { resolveWhatsAppContact } from './agentContactResolve.js';
import { mergeAgentStatePatch } from './agentStateMerge.js';
import { interpretAgentAction } from './agentActionInterpret.js';
import { executeAgentAction } from './agentActionExecute.js';
import { notifyTeamOfAiAction } from './agentActionNotify.js';
import { logStructured } from './structuredLog.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';

const adminClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const defaultDatabases = adminClient ? new Databases(adminClient) : null;

/**
 * Pipeline pós-resposta do agente WhatsApp.
 * @param {object} params
 */
export async function runAgentActions({
  academyId,
  academyDoc,
  conversationDoc,
  message,
  messageId,
  phone,
  history,
  databases = defaultDatabases,
}) {
  try {
    const aid = String(academyId || '').trim();
    const cid = String(conversationDoc?.$id || '').trim();
    const mid = String(messageId || '').trim();
    const msg = String(message || '').trim();
    if (!aid || !cid || !msg || !databases) return;

    if (humanHandoffIsActive(conversationDoc?.human_handoff_until)) {
      logStructured('agent_action_skipped', { reason: 'human_handoff', academy_id: aid, conversation_id: cid });
      return;
    }

    const agentState = readAgentState(conversationDoc?.agent_state);
    const contact = await resolveWhatsAppContact(databases, aid, phone, conversationDoc);

    const interpreted = await interpretAgentAction({
      message: msg,
      history,
      agentState,
      contact,
      phone,
    });

    const timelineEnabled = isConversationTimelineEnabled(academyDoc);
    const highlightLeadId = String(contact?.id || '').trim();
    if (timelineEnabled && highlightLeadId && interpreted?.timeline_highlight) {
      await recordConversationHighlight({
        enabled: true,
        highlight: interpreted.timeline_highlight,
        academyId: aid,
        leadId: highlightLeadId,
        messageId: mid,
        conversationId: cid,
      });
    }

    const action = interpreted?.action ? String(interpreted.action).trim() : '';
    if (!action) {
      if (interpreted?.state_patch && Object.keys(interpreted.state_patch).length > 0) {
        const merged = mergeAgentStatePatch(agentState, interpreted.state_patch);
        await writeAgentState(cid, merged);
      }
      return;
    }

    if (!isAiActionAllowed(academyDoc, action)) {
      logStructured('agent_action_skipped', { reason: 'policy', action, academy_id: aid });
      return;
    }

    const mergedState = mergeAgentStatePatch(agentState, interpreted.state_patch || {});
    if (JSON.stringify(mergedState) !== JSON.stringify(agentState)) {
      await writeAgentState(cid, mergedState);
    }

    const confidence = String(interpreted.confidence || 'low');
    let missing = Array.isArray(interpreted.missing) ? interpreted.missing.filter(Boolean) : [];
    if (action === 'update_student') {
      const collected = {
        ...(mergedState.intake?.collected || {}),
        ...(interpreted.data && typeof interpreted.data === 'object' ? interpreted.data : {}),
      };
      const tier = contact?.kind === 'lead' ? 'partial' : 'full';
      missing = intakeMissingFieldsForTier(collected, tier);
    }
    const canExecute = confidence === 'high' && missing.length === 0;

    const auditLeadId = contact.id || cid;
    if (mid && auditLeadId && (await wasActionProcessed(databases, aid, auditLeadId, mid, action))) {
      logStructured('agent_action_skipped', { reason: 'idempotent', action, message_id: mid });
      return;
    }

    if (!canExecute) {
      await recordAiAction({
        academyId: aid,
        leadId: auditLeadId,
        conversationId: cid,
        messageId: mid,
        action,
        result: 'skipped',
        summary: interpreted.summary || 'Aguardando dados',
        payload: { missing, confidence },
      });
      return;
    }

    const result = await executeAgentAction(databases, {
      academyId: aid,
      academyDoc,
      conversationId: cid,
      phone,
      contact,
      action,
      data: interpreted.data,
      agentState: mergedState,
    });

    if (result.ok) {
      const clearPatch = {};
      if (action === 'update_student') clearPatch.clear_intake = true;
      if (action === 'freeze_plan') clearPatch.clear_freeze_pending = true;
      if (Object.keys(clearPatch).length) {
        await writeAgentState(cid, mergeAgentStatePatch(mergedState, clearPatch));
      }

      await recordAiAction({
        academyId: aid,
        leadId: contact.id || auditLeadId,
        conversationId: cid,
        messageId: mid,
        action,
        result: 'success',
        summary: result.summary || interpreted.summary,
        payload: { data: interpreted.data, entityIds: result.entityIds },
      });

      await notifyTeamOfAiAction(databases, {
        academyId: aid,
        action,
        summary: result.summary || interpreted.summary,
        phone,
        conversationId: cid,
        leadId: contact.id,
        leadName: contact.name,
        messageId: mid,
        payload: interpreted.data,
        failed: false,
      });
    } else {
      await recordAiAction({
        academyId: aid,
        leadId: auditLeadId,
        conversationId: cid,
        messageId: mid,
        action,
        result: 'failure',
        summary: result.error || 'Falha na execução',
        payload: { error: result.error },
      });

      await notifyTeamOfAiAction(databases, {
        academyId: aid,
        action,
        summary: result.error || 'Falha na execução',
        phone,
        conversationId: cid,
        leadId: contact.id,
        leadName: contact.name,
        messageId: mid,
        payload: { error: result.error },
        failed: true,
      });
    }

    logStructured('agent_action_done', {
      academy_id: aid,
      conversation_id: cid,
      action,
      ok: result.ok,
      message_id: mid,
    });
  } catch (e) {
    console.error('[agentActionExecutor]', e?.message || e);
    logStructured('agent_action_error', { error: String(e?.message || e).slice(0, 300) });
  }
}
