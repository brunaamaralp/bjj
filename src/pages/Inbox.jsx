import '../styles/tokens/inbox.css';
import '../styles/inbox.css';
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CONVERSATIONS_COL, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { membershipPrimaryLabel } from '../lib/teamMembershipLabel.js';
import {
  WHATSAPP_TEMPLATE_LABELS,
  applyWhatsappTemplatePlaceholders,
} from '../../lib/whatsappTemplateDefaults.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '../hooks/useToast';
import { resolveInboxTicketBadge } from '../lib/inboxTicketBadges.js';
import { useLeadStore } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import { useUserRole } from '../lib/useUserRole';
import { useTerms, contactLabelSingular } from '../lib/terminology.js';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { useZapsterWhatsAppConnection } from '../hooks/useZapsterWhatsAppConnection';
import { isWhatsAppIntegrationDisconnected } from '../lib/whatsappIntegrationState.js';
import { X } from 'lucide-react';
import InboxListSection from '../components/inbox/InboxListSection.jsx';
import InboxGlobalBanners from '../components/inbox/InboxGlobalBanners.jsx';
import InboxPageActionsMenu from '../components/inbox/InboxPageActionsMenu.jsx';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';
import { preloadInboxThreadChunks } from '../lib/preloadRoutes.js';
import InboxThreadSection from '../components/inbox/InboxThreadSection.jsx';
import InboxPageLayout from '../components/inbox/InboxPageLayout.jsx';
import InboxDetailsModal from '../components/inbox/InboxDetailsModal.jsx';
import InboxConversationSheet from '../components/inbox/InboxConversationSheet.jsx';

const InboxContextPanel = lazyWithRetry(() => import('../components/inbox/InboxContextPanel'));
const InboxImageLightbox = lazyWithRetry(() => import('../components/inbox/InboxImageLightbox.jsx'));
import { InboxMediaUploadError } from '../lib/uploadInboxMedia.js';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import EmptyState from '../components/shared/EmptyState.jsx';
import useDebounce from '../hooks/useDebounce.js';
import { useInboxContextMenu } from '../hooks/useInboxContextMenu.js';
import { useInboxKeyboard } from '../hooks/useInboxKeyboard.js';
import { useInboxListPipeline } from '../hooks/useInboxListPipeline.js';
import { useInboxRealtimeSync } from '../hooks/useInboxRealtimeSync.js';
import { useInboxThreadScroll } from '../hooks/useInboxThreadScroll.js';
import { useInboxViewport } from '../hooks/useInboxViewport.js';
import { useInboxConversationList } from '../hooks/useInboxConversationList.js';
import { useInboxInitialLoad } from '../hooks/useInboxInitialLoad.js';
import { useInboxAutoRefresh } from '../hooks/useInboxAutoRefresh.js';
import { useInboxListStats } from '../hooks/useInboxListStats.js';
import { useInboxScrollLoadMore } from '../hooks/useInboxScrollLoadMore.js';
import { useInboxThreadLoader } from '../hooks/useInboxThreadLoader.js';
import { useInboxConversationActions } from '../hooks/useInboxConversationActions.js';
import { useInboxOutboundMessaging } from '../hooks/useInboxOutboundMessaging.js';
import { useInboxDeferredBoot } from '../hooks/useInboxDeferredBoot.js';
import { useInboxDeferredAvatars } from '../hooks/useInboxDeferredAvatars.js';
import { useInboxUrlState, readInboxPhoneFromLocationSearch } from '../hooks/useInboxUrlState.js';
import { useInboxAutoSelectConversation } from '../hooks/useInboxAutoSelectConversation.js';
import { useInboxComposerUi } from '../hooks/useInboxComposerUi.js';
import { useInboxLayoutPrefs } from '../hooks/useInboxLayoutPrefs.js';
import { useInboxHandoff } from '../hooks/useInboxHandoff.js';
import { useInboxDesktopNotify } from '../hooks/useInboxDesktopNotify.js';
import { useInboxMessageFlags } from '../hooks/useInboxMessageFlags.js';
import { useInboxChatWidgetSync } from '../hooks/useInboxChatWidgetSync.js';
import { useInboxVisualViewport } from '../hooks/useInboxVisualViewport.js';
import { useInboxPhoneChangeReset } from '../hooks/useInboxPhoneChangeReset.js';
import { useInboxLeadPanelData } from '../hooks/useInboxLeadPanelData.js';
import { useInboxThreadDerived } from '../hooks/useInboxThreadDerived.js';
import { useInboxComposerProps } from '../hooks/useInboxComposerProps.js';
import { useInboxThreadMenuProps } from '../hooks/useInboxThreadMenuProps.js';
import { useInboxContextPanelProps } from '../hooks/useInboxContextPanelProps.js';
import { useInboxThreadPanelProps } from '../hooks/useInboxThreadPanelProps.js';
import { useInboxListPanelProps } from '../hooks/useInboxListPanelProps.js';
import InboxContextMenus from '../components/inbox/InboxContextMenus.jsx';
import { getInboxJwt as getJwt } from '../lib/inboxApiUtils.js';
import {
  normalizeInboxPhone as normalizePhone,
  formatInboxPhone as formatPhone,
  pickInboxDisplayName as pickDisplayName,
} from '../lib/inboxContactDisplay.js';
import { inboxMessageMediaUrl } from '../lib/inboxMediaUtils.js';
import { senderKindFromInboxMessage } from '../lib/inboxMessageUtils.js';
import {
  buildSelectedFromListItem,
  getInboxThreadCache,
  threadPaginationFromCache,
} from '../lib/inboxThreadCache.js';
import { useInboxStudentLink } from '../hooks/useInboxStudentLink.js';
import { useFollowupEventsByLead } from '../hooks/useFollowupEventsByLead.js';
import { useInboxLeadMaps } from '../hooks/useInboxLeadMaps.js';
import { useInboxLeadContext } from '../hooks/useInboxLeadContext.js';
import { useLeadsForAssociatePanel } from '../hooks/useLeadsForAssociatePanel.js';
import { readFollowupPlaybook } from '../lib/followupPlaybookDefaults.js';
const FollowupOutcomeDialog = lazyWithRetry(() => import('../components/followup/FollowupOutcomeDialog.jsx'));
import useDialogFocus from '../hooks/useDialogFocus.js';
const EMPTY_ACADEMY_LIST = [];

const INBOX_PRIMARY_FILTERS = new Set(['all', 'needs_me', 'unread']);

function isInboxDebugEnabled() {
  const envEnabled =
    import.meta.env.DEV ||
    ['1', 'true', 'yes'].includes(String(import.meta.env.VITE_INBOX_DEBUG || '').trim().toLowerCase());
  if (envEnabled) return true;
  if (typeof window === 'undefined') return false;
  try {
    const local = String(window.localStorage?.getItem('inbox_debug') || '').trim().toLowerCase();
    return local === '1' || local === 'true' || local === 'yes';
  } catch {
    return false;
  }
}

function formatWhen(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('pt-BR');
}

function formatTimeOnly(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Rótulo curto para a lista: “Agora”, “Há N min”, horário no dia, “Ontem”, data. */
function formatListActivityLabel(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = now.getTime() - d.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return 'Agora';
  if (diffMs >= 60_000 && diffMs < 3600_000) {
    const m = Math.floor(diffMs / 60_000);
    return `Há ${m} min`;
  }
  if (startOfMsg.getTime() === startOfToday.getTime()) {
    const t = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `hoje ${t}`;
  }
  const yesterday = new Date(startOfToday);
  yesterday.setDate(yesterday.getDate() - 1);
  if (startOfMsg.getTime() === yesterday.getTime()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function inboxContentIsAudioPlaceholder(content) {
  const s = String(content || '').trim();
  return /🎵\s*\[Áudio recebido\]|\[Áudio recebido\]/i.test(s);
}

export default function Inbox() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { fetchLeads, loading: leadsLoading, academyId, academyList: academyListRaw, updateLead, deleteLead, modules } = useLeadStore(
    useShallow((state) => ({
      fetchLeads: state.fetchLeads,
      loading: state.loading,
      academyId: state.academyId,
      academyList: state.academyList,
      updateLead: state.updateLead,
      deleteLead: state.deleteLead,
      modules: state.modules,
    }))
  );
  const aiModuleEnabled = modules?.aiEnabled !== false;
  const students = useStudentStore((s) => s.students);
  const fetchStudents = useStudentStore((s) => s.fetchStudents);
  const studentsLoading = useStudentStore((s) => s.loading);
  const academyList = Array.isArray(academyListRaw) ? academyListRaw : EMPTY_ACADEMY_LIST;
  const academyDoc = useMemo(() => academyList.find((a) => a.id === academyId) || { ownerId: '', teamId: '' }, [academyList, academyId]);
  const { teamMembers, agentIaActive } = useInboxDeferredBoot(academyId, academyDoc);
  const role = useUserRole(academyDoc);
  const canConfigureAgenteIa = role === 'owner' || role === 'member';
  const fetchWaInfoDeferredRef = useRef(null);
  const { waStatus, waSyncing, waStatusChecked, reconcileWhatsAppHistory, fetchWaInfoDeferred } =
    useZapsterWhatsAppConnection(academyId, {
      statusPollWhileMounted: true,
      watchAcademyStatus: true,
      deferInitialFetch: true,
    });
  useEffect(() => {
    fetchWaInfoDeferredRef.current = fetchWaInfoDeferred;
  }, [fetchWaInfoDeferred]);
  const terms = useTerms();
  const labels = useLeadStore((s) => s.labels);
  const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(() =>
    readInboxPhoneFromLocationSearch(window.location.search, normalizePhone)
  );
  const [selected, setSelected] = useState(null);
  const selectedPhoneRef = useRef('');

  useInboxDeferredAvatars({
    academyId,
    items,
    loading,
    selectedPhone,
    setItems,
    setSelected,
  });

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [listCapped, setListCapped] = useState(false);
  const [draft, setDraft] = useState('');
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [sending, setSending] = useState(false);
  const [improvingDraft, setImprovingDraft] = useState(false);
  const [draftBeforeImprove, setDraftBeforeImprove] = useState(null);
  const [cancelingMsgId, setCancelingMsgId] = useState('');
  const [cancelConfirmMsgId, setCancelConfirmMsgId] = useState('');
  const [error, setError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const autoRefresh = true;
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const { isMobile, isNarrowDesktop, showInboxKeyHints } = useInboxViewport();
  const { listWidth, setListWidth, contextOpen, setContextOpen } = useInboxLayoutPrefs();
  const {
    emojiOpen,
    setEmojiOpen,
    templatesOpen,
    setTemplatesOpen,
    slashOpen,
    setSlashOpen,
    slashQuery,
    setSlashQuery,
    slashIndex,
    setSlashIndex,
    composerExpanded,
    setComposerExpanded,
    textareaRef,
    slashPopupRef,
    slashActiveItemRef,
  } = useInboxComposerUi({ selectedPhone });

  const { listFilter, setListFilter, listFilterRef } = useInboxUrlState({
    location,
    selectedPhone,
    setSelectedPhone,
    selectedPhoneRef,
    normalizePhone,
  });
  const [pageActionsOpen, setPageActionsOpen] = useState(false);
  const [extraFiltersMenuOpen, setExtraFiltersMenuOpen] = useState(false);
  const { stats, applyStatsFromList, refreshStats } = useInboxListStats({ academyId, listFilter });
  const [leadPanel, setLeadPanel] = useState(null);
  const [dismissTriageLead, setDismissTriageLead] = useState(null);
  const [transferToDraft, setTransferToDraft] = useState('');
  const [leadNameDraft, setLeadNameDraft] = useState('');
  const [contactNameDraft, setContactNameDraft] = useState('');
  const [editingContactName, setEditingContactName] = useState(false);
  const [savingContactName, setSavingContactName] = useState(false);
  const [leadTypeDraft, setLeadTypeDraft] = useState('Adulto');
  const [leadSearch, setLeadSearch] = useState('');
  const leadsForAssociate = useLeadsForAssociatePanel(leadPanel);
  const [linkingLead, setLinkingLead] = useState(false);
  const [highlighted, setHighlighted] = useState({});
  const { templates: whatsappTemplatesHook, academyName: academyNameForTemplates } = useWhatsappTemplates(academyId, {
    enabled: templatesOpen || slashOpen,
  });
  const whatsappTemplatesObj = whatsappTemplatesHook || null;
  const {
    followupDoneByLead,
    followupContactByLead,
    followupSnoozeUntilByLead,
    inboundAfterByLead,
    inboundAfterByPhone,
  } = useFollowupEventsByLead(academyId, {
    defer: true,
    enableRealtime: false,
    disableInboundPoll: true,
  });
  const followupPlaybook = useMemo(
    () => readFollowupPlaybook(academyDoc?.settings),
    [academyDoc?.settings]
  );
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadPaging, setThreadPaging] = useState(false);
  const [threadCursor, setThreadCursor] = useState(null);
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [ticketUpdating, setTicketUpdating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { menu, openMenu, closeMenu } = useInboxContextMenu();
  const [imageLightboxUrl, setImageLightboxUrl] = useState('');
  /** Mobile: bottom sheet após long press na lista (só ação "marcar não lida" quando aplicável). */
  const [conversationSheet, setConversationSheet] = useState(null);
  const detailsModalOpen = Boolean((isMobile || isNarrowDesktop) && detailsOpen && selectedPhone);
  const detailsModalRef = useDialogFocus(detailsModalOpen, () => setDetailsOpen(false));
  const conversationSheetOpen = Boolean(conversationSheet && isMobile);
  const conversationSheetRef = useDialogFocus(conversationSheetOpen, () => setConversationSheet(null));
  const [selectedMsgKey, setSelectedMsgKey] = useState('');
  const [expandedMsgs, setExpandedMsgs] = useState({});
  const { inboxVvInset, inboxSlashMaxHeight } = useInboxVisualViewport(isMobile);

  useEffect(() => {
    const url = String(imageLightboxUrl || '').trim();
    if (!url) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setImageLightboxUrl('');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [imageLightboxUrl]);

  const quickTemplates = useMemo(() => {
    const raw = whatsappTemplatesObj;
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw)
      .filter(([, tpl]) => typeof tpl === 'string' && String(tpl).trim())
      .map(([key, text]) => ({
        key,
        label: WHATSAPP_TEMPLATE_LABELS[key] || key,
        text: String(text)
      }));
  }, [whatsappTemplatesObj]);

  const slashFilteredTemplates = useMemo(() => {
    const q = String(slashQuery || '').trim().toLowerCase();
    return quickTemplates.filter(
      (t) =>
        !q ||
        String(t.label).toLowerCase().includes(q) ||
        String(t.text).toLowerCase().includes(q)
    );
  }, [quickTemplates, slashQuery]);

  const draftRef = useRef('');

  useEffect(() => {
    if (!slashOpen) return;
    try {
      slashActiveItemRef.current?.scrollIntoView?.({ block: 'nearest' });
    } catch {
      void 0;
    }
  }, [slashIndex, slashOpen, slashFilteredTemplates.length, slashActiveItemRef]);

  const threadScrollRef = useRef(null);
  const threadMessagesApiRef = useRef(null);
  const lastAutoScrollPhoneRef = useRef('');
  const threadMsgCountRef = useRef(0);
  const listMetaRef = useRef(new Map());
  const notifiedOnceRef = useRef(false);
  const loadingListRef = useRef(false);
  const threadAbortRef = useRef(null);
  const threadRequestSeqRef = useRef(0);
  const realtimeTimersRef = useRef({ list: null, thread: null });
  const academyIdRef = useRef('');
  // Sincroniza no render para efeitos/hooks na mesma passagem verem o academyId atual.
  academyIdRef.current = String(academyId || '').trim();
  const handleSelectConversationRef = useRef(() => {});
  const markSeenRef = useRef(null);
  const messageFlagsMigrationDoneRef = useRef(false);
  const inboxAutoSelectDoneRef = useRef(false);

  const threadMessageCount = Array.isArray(selected?.messages) ? selected.messages.length : 0;
  const handleThreadPhoneChange = useCallback(() => {
    setSelectedMsgKey('');
    setExpandedMsgs({});
    setDetailsOpen(false);
  }, []);
  const {
    threadAtBottom,
    setThreadAtBottom,
    newMsgCount,
    setNewMsgCount,
    scrollThreadToBottom,
  } = useInboxThreadScroll({
    selectedPhone,
    messageCount: threadMessageCount,
    threadScrollRef,
    selectedPhoneRef,
    threadMsgCountRef,
    lastAutoScrollPhoneRef,
    onPhoneChange: handleThreadPhoneChange,
  });

  const searchQuery = useMemo(() => String(search || '').trim(), [search]);
  const debouncedSearchQuery = useMemo(() => String(debouncedSearch || '').trim(), [debouncedSearch]);
  const searchPending = searchQuery !== debouncedSearchQuery;
  const { handoffReleaseHint, setHandoffReleaseHint, handoffDurationPhrase } = useInboxHandoff({
    selectedPhone,
    selected,
    toast,
    agentIaActive,
  });
  const {
    desktopNotify,
    desktopNotifyRef,
    toggleDesktopNotifyPreference,
    tryDesktopNotify,
    playNotificationSound,
  } = useInboxDesktopNotify({ toast });
  const { msgFlags, setMsgFlags, conversationIdForFlags, toggleMsgFlag } = useInboxMessageFlags({
    academyId,
    selectedPhone,
    selected,
    items,
    loading,
    toast,
    messageFlagsMigrationDoneRef,
  });

  const onListItemNotifyRef = useRef(() => {});
  const onListReadyRef = useRef(null);
  const onStatsFromListRef = useRef(null);
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    onStatsFromListRef.current = applyStatsFromList;
  }, [applyStatsFromList]);

  const waDeferredOnceRef = useRef(false);
  useEffect(() => {
    waDeferredOnceRef.current = false;
  }, [academyId]);

  const { loadList, loadListRef } = useInboxConversationList({
    academyId,
    academyIdRef,
    debouncedSearchQuery,
    listFilter,
    listFilterRef,
    selectedPhoneRef,
    listMetaRef,
    notifiedOnceRef,
    loadingListRef,
    nextCursor,
    hasMore,
    loading,
    loadingMore,
    setNextCursor,
    setHasMore,
    setError,
    setLoading,
    setLoadingMore,
    setLastUpdatedAt,
    setItems,
    setListCapped,
    onListItemNotifyRef,
    onListReadyRef,
    onStatsFromListRef,
  });

  const { loadThread, loadThreadRef } = useInboxThreadLoader({
    academyIdRef,
    threadScrollRef,
    threadAbortRef,
    threadRequestSeqRef,
    lastAutoScrollPhoneRef,
    setError,
    setThreadError,
    setThreadPaging,
    setThreadLoading,
    setThreadCursor,
    setThreadHasMore,
    setSelected,
    setItems,
    itemsRef,
    selectedRef,
  });

  useEffect(() => {
    onListReadyRef.current = (payload) => {
      if (!waDeferredOnceRef.current) {
        waDeferredOnceRef.current = true;
        const waFn = fetchWaInfoDeferredRef.current;
        if (typeof waFn === 'function') void waFn();
      }
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => void refreshStats(), { timeout: 2500 });
      } else {
        window.setTimeout(() => void refreshStats(), 600);
      }
      const urlPhone = normalizePhone(String(new URLSearchParams(window.location.search).get('phone') || '').trim());
      const { firstPhone, firstConversationId, items: listItems, hasSelection } = payload || {};
      const targetPhone = urlPhone || (!hasSelection ? String(firstPhone || '').trim() : '');
      if (!targetPhone) return;
      const row = Array.isArray(listItems)
        ? listItems.find((it) => String(it?.phone_number || '').trim() === targetPhone)
        : null;
      const convId = String(row?.id || firstConversationId || '').trim();
      void preloadInboxThreadChunks();
      void loadThreadRef.current?.(targetPhone, { conversationId: convId, prefetch: true });
    };
  }, [loadThreadRef, refreshStats]);

  const {
    markSeen,
    markUnread,
    unarchiveConversation,
    archiveConversation,
    setHandoffActive,
    updateTicket,
    linkLeadToConversation,
    saveContactName,
    convertToLead,
    restoreLeadTriage,
    openPromptSettings,
  } = useInboxConversationActions({
    toast,
    academyIdRef,
    selectedPhoneRef,
    listFilterRef,
    loadListRef,
    loadList,
    closeMenu,
    setError,
    setItems,
    setSelected,
    setSelectedPhone,
    setHighlighted,
    setConversationSheet,
    setHandoffReleaseHint,
    setTicketUpdating,
    ticketUpdating,
    setLinkingLead,
    setLeadPanel,
    setLeadSearch,
    setEditingContactName,
    setSavingContactName,
    savingContactName,
    contactNameDraft,
    leadNameDraft,
    leadTypeDraft,
    selected,
    contactLabel,
    updateLead,
    fetchLeads,
  });

  const {
    sendManual,
    retryFailedMessage,
    cancelScheduledMessage,
    runCancelScheduledMessage,
    improveDraftWithAi,
  } = useInboxOutboundMessaging({
    toast,
    academyIdRef,
    selectedPhoneRef,
    threadScrollRef,
    lastAutoScrollPhoneRef,
    draftRef,
    textareaRef,
    selectedPhone,
    selected,
    draft,
    scheduleOn,
    scheduleAtLocal,
    sending,
    cancelingMsgId,
    cancelConfirmMsgId,
    setError,
    setSelected,
    setDraft,
    setDraftBeforeImprove,
    setScheduleOn,
    setScheduleAtLocal,
    setSending,
    setImprovingDraft,
    setCancelConfirmMsgId,
    setCancelingMsgId,
    scrollThreadToBottom,
    setHandoffActive,
    markSeen,
    loadList,
  });

  useEffect(() => {
    markSeenRef.current = markSeen;
  }, [markSeen]);

  const markedReadPhoneRef = useRef('');
  const markedReadDoneRef = useRef(false);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (markedReadPhoneRef.current !== phone) {
      markedReadPhoneRef.current = phone;
      markedReadDoneRef.current = false;
    }
  }, [selectedPhone]);

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone || loading || threadLoading || markedReadDoneRef.current) return;
    const row = (Array.isArray(items) ? items : []).find(
      (it) => String(it?.phone_number || '').trim() === phone
    );
    const unread = Number(row?._unreadCount ?? row?.unread_count ?? 0);
    if (!Number.isFinite(unread) || unread <= 0) return;
    markedReadDoneRef.current = true;
    void markSeen(phone);
  }, [selectedPhone, loading, threadLoading, items, markSeen]);

  useEffect(() => {
    if (!academyId) return;
    const connected = String(waStatus || '').trim() === 'connected';
    if (!connected) return;
    const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'connect_whatsapp')?.done;
    if (done) return;
    void useLeadStore.getState().completeOnboardingStepIds(['connect_whatsapp']);
  }, [waStatus, academyId]);

  const { realtimeOn } = useInboxRealtimeSync({
    academyId,
    academyIdRef,
    selectedPhoneRef,
    loadListRef,
    loadThreadRef,
    realtimeTimersRef,
  });

  useInboxInitialLoad({
    academyId,
    setSelectedPhone,
    setSelected,
    setItems,
    setListCapped,
    setMsgFlags,
    messageFlagsMigrationDoneRef,
    notifiedOnceRef,
    inboxAutoSelectDoneRef,
  });

  useInboxAutoRefresh({
    autoRefresh,
    realtimeOn,
    loadListRef,
    loadThreadRef,
    selectedPhoneRef,
    draftRef,
  });

  useEffect(() => {
    draftRef.current = String(draft || '');
  }, [draft]);

  useEffect(() => {
    selectedPhoneRef.current = String(selectedPhone || '');
  }, [selectedPhone]);

  useEffect(() => {
    const threadAbort = threadAbortRef;
    return () => {
      try {
        if (threadAbort.current) threadAbort.current.abort();
      } catch {
        void 0;
      }
    };
  }, []);

  useEffect(() => {
    const id = String(academyId || '').trim();
    if (!id) return;
    void getJwt();
  }, [academyId]);

  useInboxPhoneChangeReset({
    selectedPhone,
    setLeadPanel,
    setLeadSearch,
    setLeadNameDraft,
    setDraftBeforeImprove,
  });

  useInboxLeadPanelData({
    leadPanel,
    leadsLoading,
    leadsForAssociate,
    fetchLeads,
    studentsLoading,
    students,
    fetchStudents,
  });

  useEffect(() => {
    if (!isNarrowDesktop) return;
    if (!contextOpen) return;
    setContextOpen(false);
  }, [isNarrowDesktop, contextOpen]);

  const senderKindFromMessage = senderKindFromInboxMessage;

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      toast.success('Copiado');
      return true;
    } catch (e) {
      toast.error(e, 'action');
      return false;
    }
  }

  async function reconcileLast24h() {
    if (!academyIdRef.current) {
      const message = 'Não foi possível sincronizar: academia não identificada.';
      toast.show({ type: 'error', message });
      setError(message);
      if (isInboxDebugEnabled()) {
        console.warn('[Inbox Realtime] atualizar chat abortado: academyId vazio');
      }
      return;
    }
    setError('');
    const inboxDebugEnabled = isInboxDebugEnabled();
    if (inboxDebugEnabled) {
      console.log('[Inbox Realtime] atualizar chat: início', {
        academyId: String(academyIdRef.current || '').trim(),
        selectedPhone: String(selectedPhoneRef.current || '').trim(),
      });
    }
    const phoneForSync = String(selectedPhoneRef.current || '').trim();
    await reconcileWhatsAppHistory(
      async () => {
        await loadList({ reset: true, silent: true });
        const phone = String(selectedPhoneRef.current || '').trim();
        if (phone) await loadThread(phone);
        if (inboxDebugEnabled) {
          console.log('[Inbox Realtime] atualizar chat: lista/thread recarregados', { hasSelectedPhone: Boolean(phone) });
        }
      },
      { phone: phoneForSync }
    );
  }

  function setHighlightedPhone(phone) {
    const p = String(phone || '').trim();
    if (!p) return;
    const expiresAt = Date.now() + 25000;
    setHighlighted((prev) => ({ ...(prev || {}), [p]: expiresAt }));
    try {
      setTimeout(() => {
        setHighlighted((prev) => {
          const cur = prev && typeof prev === 'object' ? prev : {};
          const exp = Number(cur[p] || 0);
          if (!Number.isFinite(exp) || exp <= Date.now()) {
            const next = { ...cur };
            delete next[p];
            return next;
          }
          return cur;
        });
      }, 26000);
    } catch {
      void 0;
    }
  }

  useEffect(() => {
    onListItemNotifyRef.current = ({ phone, name, preview }) => {
      playNotificationSound();
      setHighlightedPhone(phone);
      toast.show({
        type: 'info',
        message: `Nova mensagem de ${name}${preview ? `: ${preview}` : ''}`,
      });
      tryDesktopNotify({ phone, name, preview });
    };
  }, [toast, playNotificationSound, tryDesktopNotify]);

  const applyWrapToDraft = (prefix, suffix = prefix) => {
    const cur = String(draftRef.current || '');
    const el = textareaRef.current;
    const start = el && Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
    const end = el && Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
    const selectedText = cur.slice(start, end);
    const wrappingEmpty = start === end;
    const insert = wrappingEmpty ? `${prefix}${suffix}` : `${prefix}${selectedText}${suffix}`;
    const next = cur.slice(0, start) + insert + cur.slice(end);
    setDraft(next);
    setEmojiOpen(false);
    try {
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        if (wrappingEmpty) {
          const pos = start + prefix.length;
          textarea.setSelectionRange(pos, pos);
        } else {
          const selStart = start + prefix.length;
          const selEnd = selStart + selectedText.length;
          textarea.setSelectionRange(selStart, selEnd);
        }
      }, 0);
    } catch {
      void 0;
    }
  };

  const insertAtCursor = (text) => {
    const cur = String(draftRef.current || '');
    const el = textareaRef.current;
    const start = el && Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
    const end = el && Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
    const next = cur.slice(0, start) + text + cur.slice(end);
    setDraft(next);
    try {
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        const pos = start + text.length;
        textarea.setSelectionRange(pos, pos);
      }, 0);
    } catch {
      void 0;
    }
  };

  const { leadById, leadByPhone, getLeadById } = useInboxLeadMaps({
    items,
    selectedPhone,
    normalizePhone,
  });

  function applySlashTemplate(tpl) {
    if (!tpl || typeof tpl.text !== 'string') return;
    const lid = String(selected?.lead_id || '').trim();
    const fromStore = lid ? getLeadById(lid) : null;
    const leadForTpl = fromStore || { name: selected?.lead_name, lead_name: selected?.lead_name };
    const out = applyWhatsappTemplatePlaceholders(tpl.text, {
      lead: leadForTpl,
      academyName: academyNameForTemplates
    });
    setDraft(out);
    setSlashOpen(false);
    setSlashQuery('');
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    }, 0);
  }

  function handleDraftChange(e) {
    const value = e.target.value;
    setDraft(value);
    if (!String(selectedPhone || '').trim()) {
      setSlashOpen(false);
      setSlashQuery('');
      return;
    }
    const parts = String(value || '')
      .split(/\s+/)
      .filter((p) => p.length > 0);
    const lastSeg = parts.length ? parts[parts.length - 1] : '';
    if (lastSeg.startsWith('/')) {
      setSlashQuery(lastSeg.slice(1));
      setSlashOpen(true);
    } else {
      setSlashOpen(false);
      setSlashQuery('');
    }
  }

  const emojis = useMemo(
    () => [
      '\u{1F600}',
      '\u{1F602}',
      '\u{1F60D}',
      '\u{1F970}',
      '\u{1F64F}',
      '\u{1F44D}',
      '\u{1F44F}',
      '\u{1F389}',
      '\u{1F525}',
      '\u{2705}',
      '\u{274C}',
      '\u{1F91D}',
      '\u{1F622}',
      '\u{1F914}',
      '\u{2B50}',
      '\u{1F4AA}',
      '\u{1F94B}',
      '\u{1F4CD}',
      '\u{1F4DE}',
      '\u{23F0}',
    ],
    []
  );

  const {
    leadCandidates,
    activeContactLead,
    pendingTriage,
    triageDismissed,
    activeFollowupState,
    followupOutcomeLead,
    savingFollowupOutcome,
    openFollowupOutcome,
    closeFollowupOutcome,
    confirmFollowupOutcome,
    handleFollowupSendTemplate,
    handleInboxConfirmTriage,
    handleInboxDismissTriage,
  } = useInboxLeadContext({
    selectedPhone,
    selected,
    leadById,
    leadByPhone,
    leadPanel,
    leadSearch,
    leadsForAssociate,
    followupPlaybook,
    followupDoneByLead,
    followupContactByLead,
    followupSnoozeUntilByLead,
    inboundAfterByLead,
    inboundAfterByPhone,
    quickTemplates,
    whatsappTemplatesObj,
    applySlashTemplate,
    normalizePhone,
    updateLead,
    setLinkingLead,
    setDismissTriageLead,
  });

  useInboxChatWidgetSync({
    selectedPhone,
    setSelectedPhone,
    selected,
    activeContactLead,
    normalizePhone,
  });

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    if (!phone) return;
    const row = (itemsRef.current || []).find((it) => String(it?.phone_number || '').trim() === phone);
    const conversationId =
      String(row?.id || selectedRef.current?.conversation_id || '').trim();
    void loadThread(phone, { conversationId });
  }, [selectedPhone, loadThread]);

  useEffect(() => {
    setEditingContactName(false);
    setSavingContactName(false);
    setContactNameDraft('');
  }, [selectedPhone]);

  const {
    studentCandidates,
    executeDismissTriage,
    handleOpenLinkStudent,
    handleInboxLinkStudentConfirm,
  } = useInboxStudentLink({
    students,
    leadSearch,
    selectedPhone,
    activeContactLead,
    dismissTriageLead,
    academyId,
    linkingLead,
    setLinkingLead,
    setLeadPanel,
    setLeadSearch,
    setDismissTriageLead,
    setDetailsOpen,
    setContextOpen,
    isMobile,
    isNarrowDesktop,
    deleteLead,
    fetchStudents,
    loadList,
    setSelected,
    setItems,
  });

  const {
    groupedFilteredItems,
    firstVisibleConversation,
    flatVisibleConversations,
  } = useInboxListPipeline({
    items,
    leadById,
    leadByPhone,
    highlighted,
    listFilter,
    searchQuery: debouncedSearchQuery,
    normalizePhone,
    pickDisplayName,
  });

  const handleSelectConversation = useCallback((it) => {
    const phone = String(it?._phone || it?.phone_number || '').trim();
    if (!phone) return;

    const academyIdCur = String(academyIdRef.current || '').trim();
    const cached = getInboxThreadCache(academyIdCur, phone);
    const { cursor, hasMore } = threadPaginationFromCache(cached);
    setThreadCursor(cursor);
    setThreadHasMore(hasMore);

    setSelected((prev) => buildSelectedFromListItem(it, prev, cached));

    setSelectedPhone(phone);

    const unreadCount = Number(it?._unreadCount ?? it?.unread_count ?? 0);
    if (unreadCount > 0) {
      markSeenRef.current?.(phone);
    }
  }, []);

  const handlePrefetchConversation = useCallback((it) => {
    const phone = String(it?._phone || it?.phone_number || '').trim();
    if (!phone) return;
    if (String(selectedPhoneRef.current || '').trim() === phone) return;
    const convId = String(it?.id || '').trim();
    void preloadInboxThreadChunks();
    void loadThreadRef.current?.(phone, { prefetch: true, conversationId: convId });
  }, [loadThreadRef]);

  handleSelectConversationRef.current = handleSelectConversation;

  useInboxAutoSelectConversation({
    academyId,
    loading,
    searchQuery,
    location,
    firstVisibleConversation,
    selectedPhoneRef,
    inboxAutoSelectDoneRef,
    handleSelectConversationRef,
    normalizePhone,
  });

  function ticketChip(status, transferTo) {
    const resolved = resolveInboxTicketBadge(status, transferTo);
    return {
      label: resolved.label,
      tone: resolved.tone,
      status: resolved.status,
      isDefault: resolved.isDefault,
    };
  }

  const confirmTransferConversation = useCallback(async () => {
    const dest = String(transferToDraft || '').trim();
    if (!dest) {
      toast.show({ type: 'error', message: 'Escolha quem vai receber a conversa.' });
      return;
    }
    const ok = await updateTicket({ status: 'transferred', transferTo: dest });
    if (ok) {
      setTransferToDraft('');
      setLeadPanel(null);
    }
  }, [transferToDraft, toast, updateTicket]);

  useInboxKeyboard({
    flatVisibleConversations,
    selectedPhoneRef,
    selectedTicketStatus: selected?.ticket_status,
    handleSelectConversationRef,
    textareaRef,
    updateTicket,
    loadThread,
  });

  const startResize = (ev) => {
    if (!ev) return;
    ev.preventDefault();
    const startX = ev.clientX;
    const startW = listWidth;
    const onMove = (e) => {
      const dx = e.clientX - startX;
      const next = Math.max(300, Math.min(480, startW + dx));
      setListWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const nudgeListWidth = (delta) => {
    setListWidth((w) => Math.max(300, Math.min(480, w + delta)));
  };

  const onListResizeKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nudgeListWidth(-12);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nudgeListWidth(12);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setListWidth(300);
    } else if (e.key === 'End') {
      e.preventDefault();
      setListWidth(480);
    }
  };

  const { threadBlocks, selectedPhoneFlags, pinnedMessages } = useInboxThreadDerived({
    selectedPhone,
    selected,
    msgFlags,
  });

  const { onConversationListScroll, onThreadScroll } = useInboxScrollLoadMore({
    searchQuery,
    loadList,
    loadThread,
    selectedPhoneRef,
    threadHasMore,
    threadPaging,
    threadCursor,
    setThreadAtBottom,
    setNewMsgCount,
    newMsgCount,
  });

  const handleClearInboxListFilters = useCallback(() => {
    setListFilter('all');
    setExtraFiltersMenuOpen(false);
    setSearch('');
  }, []);

  const waChatConnected = useMemo(
    () => !waStatusChecked || String(waStatus || '').trim() === 'connected',
    [waStatus, waStatusChecked]
  );
  const showWaDisconnectBanner = isWhatsAppIntegrationDisconnected(waStatus, waStatusChecked);

  const inboxExtraFilterActive = !INBOX_PRIMARY_FILTERS.has(String(listFilter || ''));
  const visibleConversationCount = flatVisibleConversations.length;
  const listMetaShowsFiltered = listFilter !== 'all' || Boolean(searchQuery);

  const inboxPageActionsMenu = (
    <InboxPageActionsMenu
      open={pageActionsOpen}
      onOpenChange={setPageActionsOpen}
      waSyncing={waSyncing}
      onSyncWhatsApp={reconcileLast24h}
      desktopNotify={desktopNotify}
      onToggleDesktopNotify={toggleDesktopNotifyPreference}
    />
  );

  const listPanelProps = useInboxListPanelProps({
    search,
    onSearchChange: setSearch,
    searchQuery,
    hasMore,
    listFilter,
    stats,
    extraFiltersMenuOpen,
    setExtraFiltersMenuOpen,
    inboxExtraFilterActive,
    setListFilter,
    onConversationListScroll,
    groupedFilteredItems,
    loading,
    itemsLength: items.length,
    waChatConnected,
    loadingMore,
    handleSelectConversation,
    onPrefetchConversation: handlePrefetchConversation,
    selectedPhone,
    ticketChip,
    formatTimeOnly,
    formatWhen,
    formatListActivityLabel,
    isMobile,
    handleClearInboxListFilters,
    setConversationSheet,
    agentIaActive,
    searchPending,
    listMetaShowsFiltered,
    visibleConversationCount,
    lastUpdatedAt,
    pageActionsMenu: inboxPageActionsMenu,
    onSyncWhatsApp: reconcileLast24h,
    waSyncing,
    desktopNotify,
    onToggleDesktopNotify: toggleDesktopNotifyPreference,
  });

  const listPanel = <InboxListSection listPanelProps={listPanelProps} />;

  const threadMessagesEmptyUi = Boolean(
    selectedPhone &&
    !threadLoading &&
    !error &&
    !threadError &&
    (!Array.isArray(selected?.messages) || selected.messages.length === 0)
  );

  const composerProps = useInboxComposerProps({
    isMobile,
    inboxVvInset,
    composerExpanded,
    selectedPhone,
    selected,
    templatesOpen,
    setTemplatesOpen,
    setEmojiOpen,
    quickTemplates,
    terms,
    getLeadById,
    academyNameForTemplates,
    setDraft,
    textareaRef,
    emojiOpen,
    emojis,
    insertAtCursor,
    scheduleOn,
    setScheduleOn,
    sending,
    scheduleAtLocal,
    setScheduleAtLocal,
    improveDraftWithAi,
    improvingDraft,
    draft,
    draftBeforeImprove,
    setDraftBeforeImprove,
    slashOpen,
    slashPopupRef,
    inboxSlashMaxHeight,
    slashFilteredTemplates,
    slashIndex,
    setSlashIndex,
    slashActiveItemRef,
    applySlashTemplate,
    handleDraftChange,
    applyWrapToDraft,
    sendManual,
    setComposerExpanded,
    setSlashOpen,
    setSlashQuery,
    toast,
    agentIaActive,
    aiModuleEnabled,
  });

  const { threadActionsMenuProps, messageMenuProps, scrollToMsgKey, contextPanelVisible } =
    useInboxThreadMenuProps({
      selectedPhone,
      selected,
      items,
      listFilter,
      isMobile,
      isNarrowDesktop,
      contextOpen,
      setDetailsOpen,
      setContextOpen,
      updateTicket,
      ticketUpdating,
      archiveConversation,
      unarchiveConversation,
      markUnread,
      setDraft,
      textareaRef,
      copyToClipboard,
      toggleMsgFlag,
      setSelectedMsgKey,
      threadMessagesApiRef,
      selectedPhoneFlags,
      cancelScheduledMessage,
    });

  const threadPanelProps = useInboxThreadPanelProps({
    selectedPhone,
    setSelectedPhone,
    setDetailsOpen,
    isMobile,
    selected,
    leadById,
    leadByPhone,
    normalizePhone,
    pickDisplayName,
    formatPhone,
    handoffReleaseHint,
    editingContactName,
    contactNameDraft,
    setContactNameDraft,
    saveContactName,
    savingContactName,
    setEditingContactName,
    navigate,
    contactLabel,
    terms,
    menu,
    openMenu,
    threadActionsMenuProps,
    threadScrollRef,
    threadMessagesApiRef,
    onThreadScroll,
    threadHasMore,
    threadLoading,
    loadThread,
    selectedPhoneRef,
    threadPaging,
    threadCursor,
    error,
    threadError,
    threadMessagesEmptyUi,
    waChatConnected,
    threadBlocks,
    expandedMsgs,
    setExpandedMsgs,
    inboxMessageMediaUrl,
    inboxContentIsAudioPlaceholder,
    selectedMsgKey,
    setSelectedMsgKey,
    selectedPhoneFlags,
    senderKindFromMessage,
    setImageLightboxUrl,
    formatWhen,
    formatTimeOnly,
    copyToClipboard,
    setHandoffActive,
    setHandoffReleaseHint,
    cancelScheduledMessage,
    cancelingMsgId,
    waSyncing,
    reconcileLast24h,
    setDraft,
    textareaRef,
    threadAtBottom,
    newMsgCount,
    scrollThreadToBottom,
    ticketUpdating,
    updateTicket,
    showInboxKeyHints,
    isNarrowDesktop,
    setContextOpen,
    composerProps,
    ticketChip,
    handoffDurationPhrase,
    retryFailedMessage,
    pendingTriage,
    triageDismissed,
    activeContactLead,
    handleInboxConfirmTriage,
    handleInboxDismissTriage,
    handleOpenLinkStudent,
    restoreLeadTriage,
    linkingLead,
    activeFollowupState,
    handleFollowupSendTemplate,
    openFollowupOutcome,
    savingFollowupOutcome,
    leadPanel,
    setLeadPanel,
    academyId,
    aiModuleEnabled,
    agentIaActive,
  });

  const threadPanel = (
    <InboxThreadSection selectedPhone={selectedPhone} panelProps={threadPanelProps} />
  );

  const contextPanelProps = useInboxContextPanelProps({
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
    studentCandidates,
    studentsLoading,
    fetchStudents,
    handleInboxConfirmTriage,
    handleInboxDismissTriage,
    handleOpenLinkStudent,
    handleInboxLinkStudentConfirm,
    activeContactLead,
    triageDismissed,
    restoreLeadTriage,
    pinnedMessages,
    setSelectedMsgKey,
    scrollToMsgKey,
    isMobile,
    setDetailsOpen,
    selectedPhoneFlags,
    membershipPrimaryLabel,
    terms,
  });

  const contextPanel = (
    <Suspense fallback={null}>
      <InboxContextPanel
        isMobile={isMobile}
        setContextOpen={setContextOpen}
        {...contextPanelProps}
      />
    </Suspense>
  );

  const inboxPageClassName = [
    'container inbox-page',
    selectedPhone ? 'inbox-page--compact' : '',
    isMobile && selectedPhone ? 'inbox-page--mobile-thread' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={inboxPageClassName}>
      <InboxGlobalBanners
        showWaDisconnectBanner={showWaDisconnectBanner}
        onReconnectWhatsApp={() => navigate('/agente-ia')}
        error={error}
        listCapped={listCapped}
      />

      <div className="inbox-body-grow">

      <InboxContextMenus menu={menu} closeMenu={closeMenu} messageMenuProps={messageMenuProps} />


      {imageLightboxUrl ? (
        <Suspense fallback={null}>
          <InboxImageLightbox imageUrl={imageLightboxUrl} onClose={() => setImageLightboxUrl('')} />
        </Suspense>
      ) : null}

      <InboxDetailsModal
        open={detailsModalOpen}
        modalRef={detailsModalRef}
        onClose={() => setDetailsOpen(false)}
        contextPanelProps={contextPanelProps}
      />

      <InboxConversationSheet
        conversationSheet={conversationSheet}
        isMobile={isMobile}
        sheetRef={conversationSheetRef}
        onClose={() => setConversationSheet(null)}
        markUnread={markUnread}
        markSeen={markSeen}
        archiveConversation={archiveConversation}
      />


      <InboxPageLayout
        isMobile={isMobile}
        selectedPhone={selectedPhone}
        listPanel={listPanel}
        threadPanel={threadPanel}
        contextPanel={contextPanel}
        contextPanelVisible={contextPanelVisible}
        listWidth={listWidth}
        startResize={startResize}
        onListResizeKeyDown={onListResizeKeyDown}
        setListWidth={setListWidth}
      />
      </div>

      <ConfirmDialog
        open={Boolean(cancelConfirmMsgId)}
        title="Cancelar agendamento?"
        description="Cancelar esta mensagem agendada?"
        confirmLabel="Cancelar agendamento"
        onConfirm={() => void runCancelScheduledMessage()}
        onClose={() => setCancelConfirmMsgId('')}
      />

      <ConfirmDialog
        open={Boolean(dismissTriageLead)}
        title="Marcar que não é lead?"
        description="Este contato será removido do funil. Novas mensagens dele não voltarão à triagem."
        confirmLabel="Não é lead"
        onConfirm={() => void executeDismissTriage()}
        onClose={() => setDismissTriageLead(null)}
      />

      <Suspense fallback={null}>
        <FollowupOutcomeDialog
          open={Boolean(followupOutcomeLead)}
          leadName={followupOutcomeLead?.name || ''}
          saving={savingFollowupOutcome}
          onClose={closeFollowupOutcome}
          onConfirm={(payload) => void confirmFollowupOutcome(payload)}
        />
      </Suspense>
    </div>
  );
}