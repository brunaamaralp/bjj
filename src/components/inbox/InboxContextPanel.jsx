import React from 'react';
import { Flame } from 'lucide-react';
import ConversationNotesPanel from './ConversationNotesPanel';
import EmptyState from '../shared/EmptyState.jsx';

export function InboxContextPanelContent(props) {
  const {
    selectedPhone,
    selected,
    ticketChip,
    updateTicket,
    ticketUpdating,
    loadThread,
    setLeadPanel,
    canConfigureAgenteIa,
    openPromptSettings,
    academyId,
    conversationIdForFlags,
    toast,
    leadById,
    leadByPhone,
    normalizePhone,
    pickDisplayName,
    contactLabel,
    navigate,
    linkingLead,
    leadPanel,
    leadNameDraft,
    setLeadNameDraft,
    leadTypeDraft,
    setLeadTypeDraft,
    convertToLead,
    transferToDraft,
    setTransferToDraft,
    teamMembers,
    confirmTransferConversation,
    leadSearch,
    setLeadSearch,
    fetchLeads,
    leadsLoading,
    leadCandidates,
    linkLeadToConversation,
    pinnedMessages,
    setSelectedMsgKey,
    scrollToMsgKey,
    isMobile,
    setDetailsOpen,
    selectedPhoneFlags,
    membershipPrimaryLabel,
  } = props;

  return (
    <div className="inbox-context-panel__body">
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
        <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
          Conversa
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <span className="ctx-label" style={{ marginBottom: 0 }}>Telefone</span>
            <span className="navi-ui-count" style={{ textAlign: 'right', wordBreak: 'break-all', color: 'var(--ink)' }}>
              {selectedPhone || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <span className="ctx-label" style={{ marginBottom: 0 }}>Status</span>
            {(() => {
              const chip = ticketChip(selected?.ticket_status, selected?.transfer_to);
              return (
                <span className="text-small" style={{ background: chip.bg, color: chip.fg, padding: '2px 8px', borderRadius: 999 }}>
                  {chip.label}
                </span>
              );
            })()}
          </div>
          {!!String(selected?.transfer_to || '').trim() && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <span className="ctx-label" style={{ marginBottom: 0 }}>Transferido para</span>
              <span className="navi-ui-count" style={{ textAlign: 'right', color: 'var(--ink)' }}>
                {String(selected?.transfer_to || '').trim()}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            className="btn btn-outline"
            style={{ padding: '6px 10px', minHeight: 34 }}
            type="button"
            onClick={() => updateTicket({ status: 'waiting_customer' })}
            disabled={!selectedPhone || ticketUpdating}
            title="Marca como aguardando resposta do cliente"
          >
            Aguardando cliente
          </button>
          <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => loadThread(selectedPhone)} disabled={!selectedPhone} type="button">
            Recarregar
          </button>
          <button
            className="btn btn-outline"
            style={{ padding: '6px 10px', minHeight: 34 }}
            type="button"
            onClick={() => setLeadPanel((v) => (v === 'transfer' ? null : 'transfer'))}
            disabled={!selectedPhone || ticketUpdating}
          >
            Transferir
          </button>
          {canConfigureAgenteIa && (
            <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={openPromptSettings} type="button">
              Configurar IA
            </button>
          )}
        </div>
      </div>

      <ConversationNotesPanel academyId={academyId} conversationId={conversationIdForFlags} addToast={toast.addToast} />

      {(() => {
        const phone = String(selectedPhone || '').trim();
        const leadId = String(selected?.lead_id || '').trim();
        const lead = leadId ? leadById.get(leadId) : leadByPhone.get(normalizePhone(phone));
        if (!lead && !phone) return null;
        const name = pickDisplayName({
          leadName: String(lead?.name || '').trim() || String(selected?.lead_name || '').trim(),
          manualContactName: selected?.contact_name,
          whatsappProfileName: selected?.whatsapp_profile_name,
          phone
        });
        const status = String(lead?.status || '').trim();
        const intention = String(lead?.intention || '').trim();
        const priority = String(lead?.priority || '').trim();
        const hotLead = Boolean(lead?.hotLead);
        return (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
            <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
              {`Contato / ${contactLabel}`}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 900, lineHeight: '20px' }}>{name || phone || '—'}</div>
              {!!phone && (
                <div className="navi-subtitle" style={{ marginTop: 0 }}>
                  {phone}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {!!status && (
                  <span className="text-small" style={{ background: 'var(--border-light)', padding: '2px 8px', borderRadius: 999 }}>
                    {status}
                  </span>
                )}
                {!!intention && (
                  <span className="text-small" style={{ background: 'var(--border-light)', padding: '2px 8px', borderRadius: 999 }}>
                    {intention}
                  </span>
                )}
                {!!priority && (
                  <span className="text-small" style={{ background: 'var(--border-light)', padding: '2px 8px', borderRadius: 999 }}>
                    {priority}
                  </span>
                )}
                {hotLead && (
                  <span className="text-small inbox-hot-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(245, 158, 11, 0.18)', color: '#b45309', padding: '2px 8px', borderRadius: 999 }}>
                    <Flame size={12} aria-hidden />
                    Quente
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!selected?.lead_id && (
                  <>
                    <button className="btn btn-primary" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setLeadPanel((v) => (v === 'convert' ? null : 'convert'))} disabled={!selectedPhone || linkingLead}>
                      Converter em contato
                    </button>
                    <button className="btn btn-primary" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setLeadPanel((v) => (v === 'associate' ? null : 'associate'))} disabled={!selectedPhone || linkingLead}>
                      Associar contato
                    </button>
                  </>
                )}
                {!!selected?.lead_id && (
                  <>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', minHeight: 34 }}
                      onClick={() => navigate(`/lead/${encodeURIComponent(String(selected.lead_id))}`)}
                      type="button"
                    >
                      {`Ver ${contactLabel.toLowerCase()}`}
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => navigate('/pipeline')} type="button">
                      Kanban
                    </button>
                  </>
                )}
                {!!lead?.id && (
                  <button
                    className="btn btn-outline"
                    style={{ padding: '6px 10px', minHeight: 34 }}
                    onClick={() => navigate(`/lead/${encodeURIComponent(String(lead.id))}`)}
                    type="button"
                  >
                    Perfil completo
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {leadPanel === 'convert' && !selected?.lead_id && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
          <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
            {`Converter em ${contactLabel.toLowerCase()}`}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div className="ctx-label" style={{ marginBottom: 6 }}>
                Nome
              </div>
              <input className="input" value={leadNameDraft} onChange={(e) => setLeadNameDraft(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <div className="ctx-label" style={{ marginBottom: 6 }}>
                Tipo
              </div>
              <select className="input" value={leadTypeDraft} onChange={(e) => setLeadTypeDraft(e.target.value)}>
                <option value="Adulto">Adulto</option>
                <option value="Criança">Criança</option>
                <option value="Juniores">Juniores</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setLeadPanel(null)} disabled={linkingLead}>
                Fechar
              </button>
              <button className="btn btn-primary" style={{ padding: '6px 10px', minHeight: 34 }} onClick={convertToLead} disabled={linkingLead} type="button">
                {linkingLead ? 'Convertendo…' : 'Converter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {leadPanel === 'transfer' && selectedPhone ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
          <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
            Transferir conversa
          </div>
          <p className="navi-subtitle" style={{ marginTop: 0, marginBottom: 10 }}>
            O destinatário verá o status &quot;Transferido&quot; no ticket desta conversa.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div className="ctx-label" style={{ marginBottom: 6 }}>
                Atendente
              </div>
              <select
                className="input"
                value={transferToDraft}
                onChange={(e) => setTransferToDraft(e.target.value)}
                disabled={ticketUpdating || teamMembers.length === 0}
              >
                <option value="">Selecione…</option>
                {teamMembers.map((m) => {
                  const label = membershipPrimaryLabel(m);
                  return (
                    <option key={String(m.userId || m.$id || label)} value={label}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {teamMembers.length === 0 ? (
                <p className="text-small" style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                  Nenhum membro ativo na equipe.
                </p>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline"
                style={{ padding: '6px 10px', minHeight: 34 }}
                type="button"
                onClick={() => {
                  setLeadPanel(null);
                  setTransferToDraft('');
                }}
                disabled={ticketUpdating}
              >
                Fechar
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: '6px 10px', minHeight: 34 }}
                type="button"
                onClick={() => void confirmTransferConversation()}
                disabled={ticketUpdating || !transferToDraft}
              >
                {ticketUpdating ? 'Transferindo…' : 'Confirmar transferência'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {leadPanel === 'associate' && !selected?.lead_id && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
          <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
            Associar contato
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <input className="input" value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder="Buscar por nome ou telefone" style={{ flex: 1, minWidth: 220 }} />
            <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} onClick={() => fetchLeads()} disabled={leadsLoading || linkingLead} type="button">
              Atualizar
            </button>
          </div>
          {leadsLoading && <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Carregando…</div>}
          {!leadsLoading && leadCandidates.length === 0 && (
            <EmptyState variant="compact" tone="dashed" title="Nenhuma conversa encontrada." role="status" />
          )}
          {!leadsLoading && leadCandidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leadCandidates.map((l) => (
                <button
                  key={l.id}
                  className="btn btn-outline"
                  style={{ justifyContent: 'space-between', display: 'flex', minHeight: 44 }}
                  onClick={() => linkLeadToConversation({ leadId: l.id })}
                  disabled={linkingLead}
                  type="button"
                >
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span style={{ fontWeight: 800 }}>{l.name || 'Sem nome'}</span>
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>{l.phone || ''}</span>
                  </span>
                  <span className="text-small" style={{ color: 'var(--text-secondary)' }}>{l.pipelineStage || l.status || ''}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn btn-outline" style={{ padding: '6px 10px', minHeight: 34 }} type="button" onClick={() => setLeadPanel(null)} disabled={linkingLead}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {selected?.summary?.text && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
          <div className="navi-section-heading" style={{ marginBottom: 8, width: '100%' }}>
            Resumo
          </div>
          <div className="navi-subtitle" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink)', marginTop: 0 }}>{selected.summary.text}</div>
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <div className="navi-section-heading">
            Fixadas
          </div>
          <span className="navi-ui-count">{pinnedMessages.length}</span>
        </div>
        {pinnedMessages.length === 0 ? (
          <EmptyState variant="bare" title="Nenhuma mensagem fixada." role="status" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pinnedMessages.map((pm) => (
              <button
                key={pm.key}
                type="button"
                className="btn btn-outline"
                style={{ justifyContent: 'space-between', display: 'flex', minHeight: 40, textAlign: 'left' }}
                onClick={() => {
                  setSelectedMsgKey(pm.key);
                  scrollToMsgKey(pm.key);
                  if (isMobile) setDetailsOpen(false);
                }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pm.preview || '—'}</span>
                <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                  Ver
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            Importantes: {Object.keys(selectedPhoneFlags?.important || {}).length}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InboxContextPanel(props) {
  const { isMobile, setContextOpen, ...contentProps } = props;

  return (
    <div className="inbox-context-panel">
      <div className="inbox-context-panel__header">
        <div className="navi-section-heading">Detalhes</div>
        {!isMobile ? (
          <button className="btn btn-outline navi-btn--toolbar" type="button" onClick={() => setContextOpen(false)}>
            Ocultar painel
          </button>
        ) : null}
      </div>
      <div className="inbox-context-panel-scroll">
        <InboxContextPanelContent {...contentProps} />
      </div>
    </div>
  );
}
