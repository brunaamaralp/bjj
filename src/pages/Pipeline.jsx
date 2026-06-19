import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import '../styles/pipeline.css';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { addLeadEvent } from '../lib/leadEvents.js';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN, patchLeadInStore, revertLeadsInStore } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import { useToast } from '../hooks/useToast';
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { Calendar, Phone, Upload, MessageCircle, ChevronRight, SlidersHorizontal, PlusCircle, StickyNote, GraduationCap, BadgeCheck, MoreHorizontal, Download, Trash2, MessageSquare, UserCheck } from 'lucide-react';
import SearchField from '../components/shared/SearchField.jsx';
import FilterBar from '../components/shared/FilterBar.jsx';
import { canShowPipelineCloseSale } from '../lib/leadCloseSale.js';
import { exportAllLeadsSpreadsheet } from '../lib/exportLeadsSpreadsheet.js';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { isCriancaProfileType } from '../../lib/leadTypeNormalize.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';
import { isActiveStudent, isInactiveStudent, isStudentRecord } from '../lib/studentStatus.js';
import {
    buildPipelineStageLeadCounts,
    buildPipelineMovePayload,
    getPipelineMoveSuccessMessage,
    isOpenFunnelLead,
    leadBelongsInPipelineColumn,
    normalizePipelineStageId,
    resolveLeadPipelineStageId,
} from '../lib/leadStageRules.js';
import {
    leadCardGuardianSubtitle,
    leadCardPrimaryName,
    leadCardTooltip,
    leadMatchesKanbanSearch,
} from '../lib/leadDisplayName.js';
import { performEnrollment } from '../lib/performEnrollment.js';
import { preloadLeadProfile } from '../lib/preloadRoutes.js';
import { dispatchOpenNewLeadModal } from '../lib/newLeadModal.js';
import { enrollmentDateYmd, formatLocalYmd } from '../lib/studentEnrollmentDate.js';
import {
  enrolledContactMatchesPeriod,
  leadBoardPeriodDateRef,
  resolveEnrollmentPeriodRange,
  resolveLeadPeriodRange,
} from '../lib/pipelineEnrollmentFilter.js';
import { useAnchoredMenuPosition } from '../hooks/useAnchoredMenuPosition.js';
import { useCustomLeadQuestions } from '../hooks/useCustomLeadQuestions.js';
import { useNlPageContext } from '../hooks/useNlPageContext.js';
import { getAcademyQuickTimeChipValues } from '../lib/academyQuickTimes.js';
import { invalidateAcademyDocumentCache, getAcademyDocument } from '../lib/getAcademyDocument.js';
import {
    buildAcademyStagesConfigSavePayload,
    readStagesConfigRawFromAcademyDoc,
    readCachedPipelineStages,
    writeCachedPipelineStages,
} from '../lib/pipelineStagesStorage.js';
import { buildSchedulePatch } from '../lib/scheduleHelpers.js';
import { useSlaAlerts } from '../lib/useSlaAlerts.js';
import { computeFollowupState, isFollowUpLead } from '../lib/followupState.js';
import { readFollowupPlaybook } from '../lib/followupPlaybookDefaults.js';
import { useFollowupEventsByLead } from '../hooks/useFollowupEventsByLead.js';
import FollowupTemperatureBadge from '../components/followup/FollowupTemperatureBadge.jsx';
import { parseAutomationsConfig } from '../lib/useAutomations.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { useTerms, TERMS, contactLabelSingular } from '../lib/terminology.js';
import { useUserRole } from '../lib/useUserRole.js';
import {
    afterExperimentalScheduled,
    afterPresenceConfirmed,
    afterMissed,
    afterMovedToPipelineStage,
} from '../lib/automationDispatch.js';
import {
    getLeadAutomationBadges,
    notifyAutomationFeedback,
    safeAutomationDispatch,
} from '../lib/automationUx.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import Hint from '../components/shared/Hint.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import StageBadge from '../components/shared/StageBadge.jsx';
import { hintForPipelineStage } from '../lib/pipelineStageHints.js';
import { getPipelineStageColor } from '../lib/pipelineStageColors.js';
import { partitionLeadAttributePills } from '../lib/pipelineLeadPills.js';
import { getPrimarySuggestedLeadAction } from '../lib/leadClassificationActions.js';
import { suggestTriageAction, triageContextLine } from '../lib/triageSuggestions.js';
import { buildTriageConfirmClientPatch } from '../../lib/agentClassificationFields.js';
import { canShowPipelineScheduleShortcut } from '../lib/pipelineScheduleShortcut.js';
import PipelineAdvancedFilters from '../components/pipeline/PipelineAdvancedFilters.jsx';
import PipelineStageEditorList from '../components/pipeline/PipelineStageEditorList.jsx';
import {
    clearPipelineSessionState,
    deriveActivePeriodChip,
    LEAD_PROFILE_FROM_PIPELINE,
    currentMonthYm,
    pipelineSessionInitialFilters,
    pipelineSessionInitialQuickFilter,
    readPipelineSessionState,
    writePipelineSessionState,
} from '../lib/pipelineSessionState.js';
import {
    DropdownMenu,
    DropdownMenuPanel,
    DropdownMenuItem,
    DropdownMenuDivider,
} from '../components/shared/menu';
import {
    formatLeadScheduledLine,
    formatLeadLastInteractionLine,
    pluralizeContactLabel,
} from '../lib/pipelineLeadDisplay.js';
import { isLeadPendingTriage, LEAD_TRIAGE_STATUS } from '../lib/leadTriage.js';
import { resolvePipelineLeadToStudent } from '../lib/resolvePipelineLeadToStudent.js';
import { unlinkInboxConversationLead } from '../lib/unlinkInboxConversationLead.js';
import InboxTriageCard from '../components/inbox/InboxTriageCard.jsx';

const ImportSheet = lazy(() => import('../components/ImportSheet'));
const LostReasonModal = lazy(() =>
    import('../components/LostReasonModal').then((m) => ({ default: m.LostReasonModal }))
);
const MatriculaModal = lazy(() => import('../components/MatriculaModal'));
const CreateContractModal = lazy(() => import('../components/contracts/CreateContractModal.jsx'));
const ScheduleModal = lazy(() => import('../components/ScheduleModal.jsx'));
const LinkStudentModal = lazy(() => import('../components/pipeline/LinkStudentModal.jsx'));

const normalizeKanbanPhone = (v) => String(v || '').replace(/\D/g, '');
import {
    DndContext,
    DragOverlay,
    closestCorners,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Acima de colunas kanban com overlay (--z-elevated). */
const PIPELINE_MENU_Z = 'var(--z-elevated, 13000)';

const KANBAN_INSERT_END = '__end__';

function KanbanDropSlot() {
    return <div className="kanban-drop-slot" aria-hidden />;
}

const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.5',
            },
        },
    }),
    duration: 180,
    easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
};

/** Impede que pointer events em botões/callouts acionem drag do sortable. */
function withNoDragTargets(listeners) {
    if (!listeners) return {};
    const shouldBlockDrag = (event) =>
        Boolean(
            event.target?.closest?.(
                '[data-no-dnd], button, a, input, textarea, select, label, [role="button"], .inbox-triage-callout'
            )
        );
    return Object.fromEntries(
        Object.entries(listeners).map(([name, handler]) => {
            if (typeof handler !== 'function') return [name, handler];
            return [
                name,
                (event) => {
                    if (shouldBlockDrag(event)) return;
                    handler(event);
                },
            ];
        })
    );
}

/**
 * Card puramente visual para ser usado tanto no grid quanto no Overlay.
 */
const LeadCard = React.memo(({ lead, slaAlert, followupTemperature, automationConfig, isDragging, isOverlay, isMoving, navigate, onOpenLeadProfile, openMenuId, scheduleModalLeadId, moverOpenId, setOpenMenuId, setWaDropdownOpenId, handleWaCardClick, waDropdownOpenId, templateSendKeys, sendTemplateFromPipeline, stages, moveToStatus, handleCopyPhone, copiedId, handleMarkAsLost, handleDeleteLead, canDeleteLead, onConfirmTriage, onDismissTriage, onLinkStudent, onOpenScheduleModal, onCloseSale, onOpenMatricula, handleConfirmPresence, setMissedModalLead, openMover, mapLeadToStageId, openNote, pipelineStageId, pipelineStageColorIndex = 0, pipelineMenuTrialLc, pipelineMenuAttendanceLc, pipelineMenuEnrollment, triageBusyLeadId, linkStudentLead, linkStudentSaving, ...props }) => {
    const terms = useTerms();
    const menuTriggerRef = useRef(null);
    const waToggleRef = useRef(null);
    const isEnrolledCard = Boolean(lead?._isStudent || isStudentRecord(lead));
    const pendingTriage = !isEnrolledCard && isLeadPendingTriage(lead);
    const isActionMenuOpen = openMenuId === lead.id;
    const isWaMenuOpen = waDropdownOpenId === lead.id;
    const isMoverOpen = moverOpenId === lead.id;
    const isCardOverlayOpen = isActionMenuOpen || scheduleModalLeadId === lead.id || isMoverOpen || isWaMenuOpen;
    const actionMenuStyle = useAnchoredMenuPosition(menuTriggerRef, isActionMenuOpen, {
        align: 'end',
        maxHeight: 420,
        zIndex: PIPELINE_MENU_Z,
    });
    const waMenuStyle = useAnchoredMenuPosition(waToggleRef, isWaMenuOpen, {
        align: 'start',
        maxHeight: 320,
        zIndex: PIPELINE_MENU_Z,
    });
    const moverMenuStyle = useAnchoredMenuPosition(menuTriggerRef, isMoverOpen, {
        align: 'end',
        maxHeight: 360,
        zIndex: PIPELINE_MENU_Z,
    });
    const showScheduleShortcut = useMemo(
        () => !isEnrolledCard && canShowPipelineScheduleShortcut(lead, mapLeadToStageId),
        [lead, isEnrolledCard, mapLeadToStageId]
    );
    const automationBadges = useMemo(
        () => getLeadAutomationBadges(lead, automationConfig),
        [lead, automationConfig]
    );
    const scheduledLine = useMemo(() => formatLeadScheduledLine(lead), [lead]);
    const lastInteractionLine = useMemo(() => formatLeadLastInteractionLine(lead), [lead]);
    const { visible: attrPills, hiddenCount: hiddenAttrPillCount } = useMemo(
        () => partitionLeadAttributePills(lead, { terms }),
        [lead, terms]
    );
    const suggestedAction = useMemo(
        () => (!isEnrolledCard && !pendingTriage ? getPrimarySuggestedLeadAction(lead, { terms, mapLeadToStageId }) : null),
        [lead, terms, mapLeadToStageId, isEnrolledCard, pendingTriage]
    );
    const triageSuggested = useMemo(() => suggestTriageAction(lead), [lead]);
    const triageContext = useMemo(() => triageContextLine(lead, { terms }), [lead, terms]);
    const triageBusy =
        triageBusyLeadId === lead.id ||
        (linkStudentSaving && linkStudentLead?.id === lead.id);
    const handleSuggestedActionClick = useCallback((e) => {
        e.stopPropagation();
        if (!suggestedAction) return;
        switch (suggestedAction.id) {
            case 'schedule_trial':
                onOpenScheduleModal?.(lead);
                break;
            case 'send_schedules': {
                const key = templateSendKeys.find((k) => String(k).includes('horario')) || templateSendKeys[0];
                if (key) void sendTemplateFromPipeline(e, lead, key);
                else handleWaCardClick(e, lead);
                break;
            }
            case 'assume_inbox': {
                const phone = normalizeKanbanPhone(lead.phone);
                if (phone) navigate(`/inbox?phone=${encodeURIComponent(phone)}`);
                break;
            }
            case 'move_to_trial_stage':
                void moveToStatus(e, lead.id, 'Aula experimental');
                break;
            case 'link_student':
                onLinkStudent?.(lead);
                break;
            default:
                break;
        }
    }, [suggestedAction, lead, onOpenScheduleModal, templateSendKeys, sendTemplateFromPipeline, handleWaCardClick, navigate, moveToStatus, onLinkStudent]);
    const slaClass =
        slaAlert?.urgency === 'critical'
            ? 'lead-card--sla-critical'
            : slaAlert?.urgency === 'warning'
              ? 'lead-card--sla-warning'
              : '';
    return (
        <div
            className={`card lead-card ${slaClass} ${isDragging ? 'lead-card--dragging' : ''} ${isOverlay ? 'lead-card--overlay' : ''} ${isMoving ? 'lead-card--moving' : ''} ${isCardOverlayOpen ? 'lead-card--menu-open' : ''}${isOverlay ? '' : ' animate-in'}`}
            style={{
                zIndex: isCardOverlayOpen ? 5000 : 1,
                opacity: isMoving ? 0.7 : undefined,
                cursor: isMoving ? 'wait' : undefined,
                ...props.style
            }}
            onMouseEnter={() => { if (!isEnrolledCard) void preloadLeadProfile(); }}
            onClick={(e) => {
                if (isOverlay) return;
                // Check if the click is on an interactive element that should block navigation
                const interactiveElement = e.target.closest?.(
                    '[data-no-dnd], .inbox-triage-callout, button, a, input, textarea, select, label, [role="button"]'
                );
                if (interactiveElement) {
                    // If it's the lead card itself (which might have role="button" for non-enrolled cards), still allow navigation
                    if (interactiveElement.classList?.contains('lead-card')) {
                        // Proceed with navigation
                    } else {
                        return;
                    }
                }
                try {
                    if (onOpenLeadProfile) {
                        onOpenLeadProfile(lead, isEnrolledCard);
                        return;
                    }
                    navigate(isEnrolledCard ? `/student/${lead.id}` : `/lead/${lead.id}`);
                } catch (error) {
                    console.error('Error navigating from lead card:', error);
                    // Fallback navigation
                    navigate(isEnrolledCard ? `/student/${lead.id}` : `/lead/${lead.id}`);
                }
            }}
            {...props}
        >
            {slaAlert ? (
                <span
                    className={`lead-sla-badge${slaAlert.urgency === 'critical' ? ' lead-sla-badge--critical' : ' lead-sla-badge--warning'}`}
                    title={`Há ${slaAlert.daysInStage} dia(s) nesta etapa (SLA ${slaAlert.slaDays}d)`}
                >
                    {`${slaAlert.daysInStage}d`}
                </span>
            ) : null}
            {followupTemperature ? (
                <span className="lead-card-followup-temp">
                    <FollowupTemperatureBadge temperature={followupTemperature} size="sm" />
                </span>
            ) : null}
            <div className="lead-card-title-row lead-card-title-row--name-only flex items-center gap-2">
                {pipelineStageId ? (
                    <StageBadge
                        stage={String(pipelineStageId)}
                        colorIndex={pipelineStageColorIndex}
                        size="sm"
                        showLabel={false}
                    />
                ) : null}
                <span className="lead-card-name" title={leadCardTooltip(lead) || undefined}>
                    {leadCardPrimaryName(lead)}
                </span>
                {leadCardGuardianSubtitle(lead) ? (
                    <span className="lead-card-guardian">{leadCardGuardianSubtitle(lead)}</span>
                ) : null}
            </div>
            <div className="lead-meta mt-2 flex items-center gap-2 flex-wrap">
                <Phone size={12} /> {lead.phone}
                {normalizeKanbanPhone(lead.phone) && !isOverlay ? (
                    <Link
                        to={`/inbox?phone=${encodeURIComponent(normalizeKanbanPhone(lead.phone))}`}
                        className="lead-inbox-link"
                        draggable={false}
                        onClick={(e) => e.stopPropagation()}
                        data-no-dnd="true"
                    >
                        Ver conversa
                    </Link>
                ) : null}
            </div>
            {attrPills.length > 0 ? (
                <div className="lead-meta mt-1 flex items-center gap-2 flex-wrap">
                    {attrPills.map((pill) => (
                        <span key={pill.key} className="type-pill">{pill.label}</span>
                    ))}
                    {hiddenAttrPillCount > 0 ? (
                        <span className="type-pill type-pill--more" title={`+${hiddenAttrPillCount} atributo(s)`}>
                            +{hiddenAttrPillCount}
                        </span>
                    ) : null}
                </div>
            ) : null}
            {scheduledLine ? (
                <div className={`lead-meta mt-1 flex items-center gap-2 lead-scheduled-line lead-scheduled-line--${scheduledLine.variant}`}>
                    <Calendar size={12} aria-hidden /> {scheduledLine.text}
                </div>
            ) : null}
            {lastInteractionLine ? (
                <div className="lead-meta mt-1 flex items-center gap-2 lead-last-interaction">
                    <MessageSquare size={12} aria-hidden /> {lastInteractionLine}
                </div>
            ) : null}
            {automationBadges.length > 0 ? (
                <div className="lead-meta mt-1 flex items-center gap-2 flex-wrap" data-no-dnd="true">
                    {automationBadges.map((b) => (
                        <span
                            key={b.key}
                            className={`lead-automation-badge${b.overdue ? ' lead-automation-badge--overdue' : ''}`}
                            title={b.title}
                        >
                            {b.label}
                        </span>
                    ))}
                </div>
            ) : null}
            {suggestedAction ? (
                <div className="lead-meta mt-1" data-no-dnd="true">
                    <button
                        type="button"
                        className="btn btn-outline lead-suggested-action-btn"
                        onClick={handleSuggestedActionClick}
                    >
                        {suggestedAction.label}
                    </button>
                </div>
            ) : null}
            {pendingTriage ? (
                <div
                    className="pipeline-lead-triage-wrap"
                    data-no-dnd="true"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    <InboxTriageCard
                        compact
                        busy={triageBusy}
                        suggestedAction={triageSuggested}
                        contextLine={triageContext}
                        studentLabel={terms.student}
                        onConfirm={() => onConfirmTriage?.(lead)}
                        onLinkStudent={() => onLinkStudent?.(lead)}
                        onDismiss={() => onDismissTriage?.(lead)}
                    />
                </div>
            ) : null}
            {lead.status === LEAD_STATUS.LOST && lead.lostReason ? (
                <div className="lead-meta mt-1">
                    <span className="lead-lost-reason-badge">
                        {lead.lostReason}
                    </span>
                </div>
            ) : null}
            <div className="action-bar action-bar--reorganized lead-card-actions">
                <div className="lead-card-actions-primary" data-no-dnd="true">
                <div className="wa-split-btn wa-split-btn--single" data-no-dnd="true">
                    <button
                        ref={waToggleRef}
                        type="button"
                        className="wa-main-btn btn-wa wa-main-btn--solo"
                        onClick={(e) => handleWaCardClick(e, lead)}
                        title="Enviar template WhatsApp"
                        aria-label="Enviar template WhatsApp"
                        aria-expanded={isWaMenuOpen}
                        aria-haspopup="menu"
                    >
                        <MessageCircle size={16} aria-hidden />
                    </button>
                    {isWaMenuOpen && waMenuStyle
                        ? createPortal(
                            <div
                                className="navi-menu__panel navi-menu__panel--fixed navi-menu--elevated wa-templates-dropdown pipeline-card-wa-menu"
                                style={waMenuStyle}
                                data-pipeline-card-menu
                                role="menu"
                                aria-label="Templates WhatsApp"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <div className="navi-menu__label">Templates</div>
                                {templateSendKeys.length === 0 && (
                                    <div className="navi-menu__item navi-menu__item--static navi-menu__item--disabled">Sem templates</div>
                                )}
                                {templateSendKeys.map((key) => (
                                    <button
                                        key={`${lead.id}-tpl-${key}`}
                                        type="button"
                                        className="navi-menu__item"
                                        onClick={(e) => void sendTemplateFromPipeline(e, lead, key)}
                                    >
                                        {WHATSAPP_TEMPLATE_LABELS[key] || key}
                                    </button>
                                ))}
                            </div>,
                            document.body,
                        )
                        : null}
                </div>
                {showScheduleShortcut ? (
                    <button
                        type="button"
                        className="pipeline-card-schedule-btn action-btn navi-menu-trigger--icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            setWaDropdownOpenId(null);
                            onOpenScheduleModal(lead);
                        }}
                        title="Agendar aula experimental"
                        aria-label="Agendar aula experimental"
                    >
                        <Calendar size={16} aria-hidden />
                    </button>
                ) : null}
                </div>

                <div className="pipeline-card-menu-trigger" data-no-dnd="true" data-pipeline-card-menu>
                    <button
                        ref={menuTriggerRef}
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(isActionMenuOpen ? null : lead.id);
                            setWaDropdownOpenId(null);
                        }}
                        title="Mais ações"
                        aria-label="Mais ações"
                        aria-expanded={isActionMenuOpen}
                        aria-haspopup="menu"
                        className="action-btn navi-menu-trigger--icon"
                    >
                        <MoreHorizontal size={16} aria-hidden />
                    </button>
                    {isActionMenuOpen && actionMenuStyle
                        ? createPortal(
                        <div
                            className="navi-menu__panel navi-menu__panel--fixed navi-menu--elevated action-menu-panel pipeline-card-action-menu"
                            style={actionMenuStyle}
                            data-pipeline-card-menu
                            role="menu"
                            aria-label="Ações do lead"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            {pendingTriage ? (
                                <>
                                    <div className="navi-menu__label">Triagem WhatsApp</div>
                                    <div className="menu-group">
                                        <button
                                            type="button"
                                            className="navi-menu__item navi-menu__item--success"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(null);
                                                setWaDropdownOpenId(null);
                                                onConfirmTriage?.(lead);
                                            }}
                                        >
                                            <UserCheck size={16} /> Confirmar lead
                                        </button>
                                        <button
                                            type="button"
                                            className="navi-menu__item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(null);
                                                setWaDropdownOpenId(null);
                                                onLinkStudent?.(lead);
                                            }}
                                        >
                                            <GraduationCap size={16} /> Vincular a aluno
                                        </button>
                                        <button
                                            type="button"
                                            className="navi-menu__item navi-menu__item--danger"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(null);
                                                setWaDropdownOpenId(null);
                                                onDismissTriage?.(e, lead);
                                            }}
                                        >
                                            <Trash2 size={16} /> Não é lead
                                        </button>
                                    </div>
                                    <hr className="navi-menu__divider" aria-hidden />
                                </>
                            ) : null}
                            <div className="menu-group">
                                {canShowPipelineCloseSale(lead) && !isEnrolledCard ? (
                                    <button
                                        type="button"
                                        className="navi-menu__item navi-menu__item--primary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenuId(null);
                                            setWaDropdownOpenId(null);
                                            onCloseSale?.(lead);
                                        }}
                                    >
                                        <BadgeCheck size={16} /> Fechar venda
                                    </button>
                                ) : null}
                                {!isEnrolledCard ? (
                                <button
                                    type="button"
                                    className="navi-menu__item"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                        setWaDropdownOpenId(null);
                                        onOpenScheduleModal(lead);
                                    }}
                                >
                                    <Calendar size={16} /> Agendar {pipelineMenuTrialLc}
                                </button>
                                ) : null}
                                {!isEnrolledCard && lead.pipelineStage === 'Aula experimental' && (
                                    <button type="button" className="navi-menu__item navi-menu__item--success" onClick={(e) => handleConfirmPresence(e, lead)}>
                                        <PlusCircle size={16} /> Confirmar {pipelineMenuAttendanceLc}
                                    </button>
                                )}
                                {!isEnrolledCard && lead.pipelineStage === 'Aula experimental' && (
                                    <button type="button" className="navi-menu__item navi-menu__item--warning" onClick={(e) => { e.stopPropagation(); setMissedModalLead(lead); setOpenMenuId(null); }}>
                                        <Calendar size={16} /> Não compareceu
                                    </button>
                                )}
                                {!isEnrolledCard && ['Aguardando decisão', 'Protocolo', 'Matriculado'].includes(lead.pipelineStage) && (
                                    <button type="button" className="navi-menu__item navi-menu__item--primary" onClick={(e) => { e.stopPropagation(); onOpenMatricula?.(lead); setOpenMenuId(null); }}>
                                        <GraduationCap size={16} /> {pipelineMenuEnrollment}
                                    </button>
                                )}
                                {!isEnrolledCard ? (
                                <button type="button" className="navi-menu__item" onClick={(e) => openMover(e, lead.id)}>
                                    <ChevronRight size={16} /> Mover para etapa
                                </button>
                                ) : null}
                            </div>
                            <hr className="navi-menu__divider" aria-hidden />
                            <div className="menu-group">
                                <button type="button" className="navi-menu__item" onClick={(e) => openNote(e, lead)}>
                                    <StickyNote size={16} /> Adicionar nota
                                </button>
                                <button type="button" className="navi-menu__item" onClick={(e) => handleCopyPhone(e, lead)}>
                                    <Phone size={16} /> {copiedId === lead.id ? '✓ Copiado!' : 'Copiar telefone'}
                                </button>
                            </div>
                            <hr className="navi-menu__divider" aria-hidden />
                            <div className="menu-group">
                                {!isEnrolledCard ? (
                                <button type="button" className="navi-menu__item navi-menu__item--danger" onClick={(e) => handleMarkAsLost(e, lead)}>
                                    <MessageCircle size={16} /> Marcar como perdido
                                </button>
                                ) : null}
                                {canDeleteLead && !isEnrolledCard ? (
                                    <button type="button" className="navi-menu__item navi-menu__item--danger" onClick={(e) => handleDeleteLead(e, lead.id)}>
                                        <Trash2 size={16} className="text-danger" /> Excluir lead
                                    </button>
                                ) : null}
                            </div>
                        </div>,
                        document.body,
                        )
                        : null}
                </div>
            </div>
            {isMoverOpen && moverMenuStyle
                ? createPortal(
                    <div
                        className="navi-menu__panel navi-menu__panel--fixed dropdown-panel navi-menu--elevated pipeline-card-mover-menu"
                        style={moverMenuStyle}
                        data-pipeline-card-menu
                        role="menu"
                        aria-label="Mover para etapa"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-no-dnd="true"
                    >
                        {stages.map((s) => {
                            const active = mapLeadToStageId(lead) === s.id;
                            return (
                                <button
                                    key={`${lead.id}-${s.id}`}
                                    type="button"
                                    className={`navi-menu__item${active ? ' navi-menu__item--active' : ''}`}
                                    onClick={(e) => moveToStatus(e, lead.id, s.id)}
                                >
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>,
                    document.body,
                )
                : null}
        </div>
    );
});

const SortableLeadCard = React.memo(function SortableLeadCard({ lead, ...props }) {
    const isEnrolledCard = Boolean(lead?._isStudent || isStudentRecord(lead));
    const {
        attributes,
        listeners: sortableListeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: lead.id, data: { lead }, disabled: isEnrolledCard });

    const listeners = useMemo(
        () => (isEnrolledCard ? {} : withNoDragTargets(sortableListeners)),
        [isEnrolledCard, sortableListeners]
    );

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        visibility: isDragging ? 'hidden' : undefined,
        pointerEvents: isDragging ? 'none' : undefined,
    };

    return (
        <LeadCard
            ref={setNodeRef}
            lead={lead}
            style={style}
            {...(isEnrolledCard ? {} : attributes)}
            {...(isEnrolledCard ? {} : listeners)}
            {...props}
        />
    );
});

const PIPELINE_VIRTUAL_THRESHOLD = 20;

const PipelineColumnLeads = React.memo(function PipelineColumnLeads({
    scrollElement,
    pageScrollElement,
    leads,
    cardProps,
    savingLeadIds,
    movingLeadIds,
    slaAlerts,
    followupTempByLead,
    pipelineStageId,
    pipelineStageColorIndex,
    showInsertSlots = false,
    insertOverId = null,
    disableVirtualization = false,
}) {
    const scrollParent = pageScrollElement || scrollElement;
    const shouldVirtualize =
        !disableVirtualization && leads.length > PIPELINE_VIRTUAL_THRESHOLD && scrollParent;
    const virtualizer = useVirtualizer({
        count: shouldVirtualize ? leads.length : 0,
        getScrollElement: () => scrollParent ?? null,
        estimateSize: () => 140,
        gap: 8,
        overscan: 4,
    });

    const renderLead = (lead) => (
        <React.Fragment key={lead.id}>
            {showInsertSlots && insertOverId === String(lead.id) ? <KanbanDropSlot /> : null}
            <SortableLeadCard
                lead={lead}
                isMoving={savingLeadIds.has(lead.id) || movingLeadIds.has(lead.id)}
                slaAlert={slaAlerts[lead.id]}
                followupTemperature={followupTempByLead[lead.id]}
                pipelineStageId={pipelineStageId}
                pipelineStageColorIndex={pipelineStageColorIndex}
                {...cardProps}
            />
        </React.Fragment>
    );

    if (!shouldVirtualize) {
        return (
            <>
                {leads.map((lead) => renderLead(lead))}
                {showInsertSlots && insertOverId === KANBAN_INSERT_END ? <KanbanDropSlot /> : null}
            </>
        );
    }

    return (
        <div
            className="pipeline-col-leads-virtual"
            style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
            }}
        >
            {virtualizer.getVirtualItems().map((virtualRow) => {
                const lead = leads[virtualRow.index];
                if (!lead) return null;
                return (
                    <div
                        key={lead.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                        }}
                    >
                        {renderLead(lead)}
                    </div>
                );
            })}
        </div>
    );
});

const Column = ({ id, col, color, leads, isOver, hasOverlayOpen, isDragActive, children }) => {
    const scrollRef = useRef(null);
    const [scrollElement, setScrollElement] = useState(null);
    const handleScrollRef = useCallback((node) => {
        scrollRef.current = node;
        setScrollElement(node);
    }, []);
    const { setNodeRef } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`kanban-column ${isOver ? 'kanban-col--drag-over' : ''} ${isDragActive && isOver ? 'kanban-col--drag-active' : ''} ${hasOverlayOpen ? 'kanban-column--overlay-open' : ''}`}
            style={{
                '--kanban-col-accent': color.color,
                '--kanban-col-accent-bg': color.bg,
            }}
        >
            <div
                className="col-header"
                style={{
                    background: color.bg,
                    borderBottomColor: `color-mix(in srgb, ${color.color} 22%, var(--pipeline-border))`,
                }}
            >
                <div className="col-header-titles">
                    <div className="flex items-center gap-2">
                        <span className="col-dot" style={{ background: color.color }} />
                        <h3 className="navi-section-heading pipeline-col-heading">{col.label}</h3>
                        <Hint text={hintForPipelineStage(col.id, col.label)} position="top" />
                    </div>
                </div>
                <span className="col-count" style={{ background: 'rgba(255,255,255,0.72)', color: color.color }}>
                    {leads.length}
                </span>
            </div>
            <div className="col-content" ref={handleScrollRef} data-pipeline-stage-id={id}>
                {isDragActive && isOver ? (
                    <div className="kanban-col-drop-zone" aria-hidden>
                        <span className="kanban-col-drop-zone__label">Soltar nesta coluna</span>
                    </div>
                ) : null}
                {typeof children === 'function' ? children(scrollElement) : children}
            </div>
        </div>
    );
};


const KANBAN_LOADING_SKELETON_COLS = 5;

/** Ordem: Novo → Experimental → Não compareceu → Aguardando decisão → coluna convertida → Perdidos */
function buildDefaultStages(t) {
    return [
        { id: 'Novo', label: 'Novo' },
        { id: 'Aula experimental', label: 'Experimental' },
        { id: LEAD_STATUS.MISSED, label: 'Não compareceu' },
        { id: PIPELINE_WAITING_DECISION_STAGE, label: 'Aguardando decisão' },
        { id: 'Matriculado', label: t.pipelineEnrolledColumnLabel },
        { id: LEAD_STATUS.LOST, label: 'Perdidos' },
    ];
}
const DEFAULT_STAGE_SLA_DAYS = 3;
const KANBAN_SCROLL_EDGE = 36;
const KANBAN_SCROLL_MAX_STEP = 14;


const leadMatchesProfileFilter = (lead, profileFilter) => {
    if (profileFilter === 'all') return true;
    const t = String(lead?.type || 'Adulto').trim();
    if (profileFilter === 'Adulto') return t === 'Adulto';
    if (profileFilter === 'Criança') return isCriancaProfileType(t);
    if (profileFilter === 'Juniores') return t === 'Juniores';
    return true;
};

const leadMatchesContactType = (lead) => {
    if (isInactiveStudent(lead)) return false;
    if (lead?.status === LEAD_STATUS.CONVERTED) return false;
    return true;
};

const ENROLLED_PIPELINE_STAGE_ID = 'Matriculado';

const boardContactOrigin = (contact) =>
    String(contact?.origin || contact?.sourceOrigin || '').trim();

const leadIsPipelineFunnel = (lead) => String(lead?.origin || '').trim() !== 'Planilha';

const sortBoardContactsByRecentEnrollment = (a, b) => {
    const ta = new Date(enrollmentDateYmd(a) || 0).getTime();
    const tb = new Date(enrollmentDateYmd(b) || 0).getTime();
    return tb - ta;
};

function comparePipelineColLeads(a, b, isEnrolledCol = false) {
    const aIdx = a._localKanbanIndex;
    const bIdx = b._localKanbanIndex;
    const aHasIdx = Number.isFinite(aIdx);
    const bHasIdx = Number.isFinite(bIdx);
    if (aHasIdx && bHasIdx && aIdx !== bIdx) return aIdx - bIdx;
    if (aHasIdx && !bHasIdx) return -1;
    if (!aHasIdx && bHasIdx) return 1;
    if (isEnrolledCol) return sortBoardContactsByRecentEnrollment(a, b);
    return mobileListToDateTime(a) - mobileListToDateTime(b);
}

function mobileListToDateTime(lead) {
    const base = lead.scheduledDate || lead.createdAt || '';
    if (!base) return new Date(8640000000000000);
    const [y, m, d] = base.split('T')[0].split('-').map(Number);
    let hh = 23;
    let mm = 59;
    if (lead.scheduledTime && /^\d{2}:\d{2}$/.test(lead.scheduledTime)) {
        const [h, mi] = lead.scheduledTime.split(':').map(Number);
        if (Number.isFinite(h) && Number.isFinite(mi)) {
            hh = h;
            mm = mi;
        }
    }
    return new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
}

function formatMobileListScheduleDate(ymd) {
    if (!ymd || String(ymd).length < 10) return '';
    try {
        return new Date(`${String(ymd).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR');
    } catch {
        return '';
    }
}

/**
 * Vista lista agrupada por etapa (mobile). Triagem WhatsApp: desktop kanban only — mobile usa /inbox.
 */
const MobileLeadList = React.memo(function MobileLeadList({
    stages,
    leadsForBoard,
    enrolledForBoard,
    originFilter,
    navigate,
    onOpenLeadProfile,
    mapLeadToStageId,
    displayStageIds,
    handleWaCardClick,
    emptyStageHint,
    showLoading,
    moveToStatus,
}) {
    const [expanded, setExpanded] = useState({});
    const [mobileMoveLeadId, setMobileMoveLeadId] = useState(null);
    const [mobileMoveTarget, setMobileMoveTarget] = useState('');
    const defaultOpenStageId = useMemo(() => {
        if (!Array.isArray(stages) || stages.length === 0) return '';
        const exp = stages.find((s) => String(s?.id || '').trim() === 'Aula experimental');
        return exp ? exp.id : '';
    }, [stages]);

    const toggleStage = useCallback((stageId) => {
        setExpanded((prev) => {
            const has = Object.prototype.hasOwnProperty.call(prev, stageId);
            const currentOpen = has ? Boolean(prev[stageId]) : stageId === defaultOpenStageId;
            return { ...prev, [stageId]: !currentOpen };
        });
    }, [defaultOpenStageId]);

    return (
        <div className="pipeline-mobile-list-root">
            {showLoading ? (
                <div className="pipeline-kanban-loading-hint" role="status">
                    Carregando funil…
                </div>
            ) : null}
            {stages.map((stage, idx) => {
                const isEnrolledStage = String(stage?.id || '').trim() === ENROLLED_PIPELINE_STAGE_ID;
                const stageLeads = (isEnrolledStage
                    ? enrolledForBoard
                    : leadsForBoard.filter((l) =>
                        leadBelongsInPipelineColumn(l, stage.id, mapLeadToStageId, displayStageIds)
                    ))
                    .filter((l) => (originFilter === 'all' ? true : boardContactOrigin(l) === originFilter))
                    .sort((a, b) =>
                        isEnrolledStage
                            ? sortBoardContactsByRecentEnrollment(a, b)
                            : mobileListToDateTime(a) - mobileListToDateTime(b)
                    );
                const color = getPipelineStageColor(stage.id, idx);
                const isOpen = Object.prototype.hasOwnProperty.call(expanded, stage.id)
                    ? Boolean(expanded[stage.id])
                    : stage.id === defaultOpenStageId;

                return (
                    <div key={stage.id} className="pipeline-mobile-stage-block">
                        <button
                            type="button"
                            className="pipeline-mobile-stage-toggle"
                            onClick={() => toggleStage(stage.id)}
                        >
                            <span className="pipeline-mobile-stage-label">
                                <span
                                    className="pipeline-mobile-stage-dot"
                                    style={{ background: color.color }}
                                />
                                <span className="pipeline-mobile-stage-name">{stage.label}</span>
                                <Hint text={hintForPipelineStage(stage.id, stage.label)} position="left" />
                            </span>
                            <span className="pipeline-mobile-stage-meta">
                                <span className="pipeline-mobile-stage-count">{stageLeads.length}</span>
                                <span
                                    className={`pipeline-mobile-stage-chevron${isOpen ? ' is-open' : ''}`}
                                    aria-hidden
                                >
                                    <ChevronRight size={18} color="var(--text-muted)" />
                                </span>
                            </span>
                        </button>

                        {isOpen ? (
                            <div className="pipeline-mobile-stage-body">
                                {stageLeads.length === 0 ? (
                                    <div className="pipeline-mobile-stage-empty">
                                        <EmptyState variant="compact" tone="dashed" title={emptyStageHint} role="none" />
                                    </div>
                                ) : (
                                    stageLeads.map((lead, li) => {
                                        const currentStageId = mapLeadToStageId(lead) || '';
                                        const moveOpen = mobileMoveLeadId === lead.id;
                                        return (
                                        <div
                                            key={lead.id}
                                            className={`pipeline-mobile-lead-item${li < stageLeads.length - 1 ? '' : ' pipeline-mobile-lead-item--last'}`}
                                        >
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            className="pipeline-mobile-lead-row"
                                            onMouseEnter={() => { void preloadLeadProfile(); }}
                                            onClick={() => {
                                                const isEnrolled = Boolean(lead?._isStudent || isStudentRecord(lead));
                                                if (onOpenLeadProfile) {
                                                    onOpenLeadProfile(lead, isEnrolled);
                                                    return;
                                                }
                                                navigate(isEnrolled ? `/student/${lead.id}` : `/lead/${lead.id}`);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    const isEnrolled = Boolean(lead?._isStudent || isStudentRecord(lead));
                                                    if (onOpenLeadProfile) {
                                                        onOpenLeadProfile(lead, isEnrolled);
                                                        return;
                                                    }
                                                    navigate(isEnrolled ? `/student/${lead.id}` : `/lead/${lead.id}`);
                                                }
                                            }}
                                        >
                                            <div className="pipeline-mobile-lead-main">
                                                <div className="pipeline-mobile-lead-name">
                                                    {leadCardPrimaryName(lead)}
                                                </div>
                                                {leadCardGuardianSubtitle(lead) ? (
                                                    <div className="pipeline-mobile-lead-guardian">
                                                        {leadCardGuardianSubtitle(lead)}
                                                    </div>
                                                ) : null}
                                                <div className="pipeline-mobile-lead-phone">
                                                    {lead.phone || '—'}
                                                </div>
                                                {lead.scheduledDate ? (
                                                    <span className="pipeline-mobile-schedule-badge">
                                                        {`${formatMobileListScheduleDate(lead.scheduledDate)}${lead.scheduledTime ? ` às ${lead.scheduledTime}` : ''}`}
                                                    </span>
                                                ) : null}
                                                {String(stage.id || '').trim() === 'Novo' &&
                                                isLeadPendingTriage(lead) &&
                                                normalizeKanbanPhone(lead.phone) ? (
                                                    <Link
                                                        to={`/inbox?phone=${encodeURIComponent(normalizeKanbanPhone(lead.phone))}`}
                                                        className="pipeline-mobile-triage-hint lead-inbox-link"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        Triar no Inbox
                                                    </Link>
                                                ) : null}
                                            </div>
                                            <div className="pipeline-mobile-lead-actions">
                                                <button
                                                    type="button"
                                                    title="WhatsApp"
                                                    className="pipeline-mobile-wa-btn btn-wa"
                                                    onClick={(e) => handleWaCardClick(e, lead)}
                                                >
                                                    <MessageCircle size={16} aria-hidden />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Abrir perfil do lead"
                                                    className="pipeline-mobile-profile-link"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const isEnrolled = Boolean(lead?._isStudent || isStudentRecord(lead));
                                                        if (onOpenLeadProfile) {
                                                            onOpenLeadProfile(lead, isEnrolled);
                                                            return;
                                                        }
                                                        navigate(isEnrolled ? `/student/${lead.id}` : `/lead/${lead.id}`);
                                                    }}
                                                >
                                                    Ver perfil →
                                                </button>
                                            </div>
                                        </div>
                                            <div
                                                className="pipeline-mobile-move-row"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    type="button"
                                                    className="btn btn-outline btn-sm pipeline-mobile-move-trigger"
                                                    onClick={() => {
                                                        if (moveOpen) {
                                                            setMobileMoveLeadId(null);
                                                            setMobileMoveTarget('');
                                                        } else {
                                                            setMobileMoveLeadId(lead.id);
                                                            const firstOther = stages.find((s) => s.id !== currentStageId);
                                                            setMobileMoveTarget(firstOther?.id || '');
                                                        }
                                                    }}
                                                >
                                                    {moveOpen ? 'Cancelar' : 'Mover para…'}
                                                </button>
                                                {moveOpen ? (
                                                    <>
                                                        <select
                                                            className="form-input pipeline-mobile-move-select"
                                                            value={mobileMoveTarget}
                                                            onChange={(e) => setMobileMoveTarget(e.target.value)}
                                                            aria-label="Etapa de destino"
                                                        >
                                                            {stages
                                                                .filter((s) => s.id !== currentStageId)
                                                                .map((s) => (
                                                                    <option key={s.id} value={s.id}>
                                                                        {s.label}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-sm pipeline-mobile-move-confirm"
                                                            disabled={!mobileMoveTarget}
                                                            onClick={(e) => {
                                                                void moveToStatus(e, lead.id, mobileMoveTarget);
                                                                setMobileMoveLeadId(null);
                                                                setMobileMoveTarget('');
                                                            }}
                                                        >
                                                            Mover
                                                        </button>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                        );
                                    })
                                )}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
});

const Pipeline = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const initialSavedRef = useRef(/** @type {import('../lib/pipelineSessionState.js').PipelineSessionState | null | undefined} */ (undefined));
    if (initialSavedRef.current === undefined) {
        if (location.state?.fresh) {
            clearPipelineSessionState();
            initialSavedRef.current = null;
        } else {
            initialSavedRef.current = readPipelineSessionState();
        }
    }
    const initialSaved = initialSavedRef.current;
    const isRestoringPipelineRef = useRef(Boolean(initialSaved));
    const pendingScrollRestoreRef = useRef(initialSaved);
    const leads = useLeadStore((s) => s.leads);
    const students = useStudentStore((s) => s.students);
    const fetchStudents = useStudentStore((s) => s.fetchStudents);
    const importLeads = useLeadStore((s) => s.importLeads);
    const updateLead = useLeadStore((s) => s.updateLead);
    const patchLeadsOrder = useLeadStore((s) => s.patchLeadsOrder);
    const fetchMoreLeads = useLeadStore((s) => s.fetchMoreLeads);
    const deleteLead = useLeadStore((s) => s.deleteLead);
    const fetchLeads = useLeadStore((s) => s.fetchLeads);
    const leadsError = useLeadStore((s) => s.leadsError);
    const toast = useToast();
    const labels = useLeadStore((s) => s.labels);
    const vertical = useLeadStore((s) => s.vertical);
    const terms = useTerms();
    const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
    const academyId = useLeadStore((s) => s.academyId);
    const financeConfig = useLeadStore((s) => s.financeConfig);

    const userId = useLeadStore((s) => s.userId);
    const teamId = useLeadStore((s) => s.teamId);
    const academyList = useLeadStore((s) => s.academyList);
    const permCtx = useMemo(() => {
        const acad = (academyList || []).find((a) => a.id === academyId) || {};
        return { ownerId: acad.ownerId, teamId: acad.teamId, userId: userId || '' };
    }, [academyList, academyId, userId]);

    const academyDocForRole = useMemo(() => {
        if (!academyId) return null;
        const a = (academyList || []).find((x) => x.id === academyId);
        if (!a) return null;
        return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };
    }, [academyList, academyId]);
    const navRole = useUserRole(academyDocForRole);
    const canDeleteLead = navRole === 'owner' || navRole === 'admin';

    const beginLeadMove = useCallback((leadId) => {
        setMovingLeadIds((prev) => new Set([...prev, leadId]));
    }, []);

    const endLeadMove = useCallback((leadId) => {
        setMovingLeadIds((prev) => {
            const next = new Set(prev);
            next.delete(leadId);
            return next;
        });
    }, []);

    const revertLeads = useCallback((previousLeads) => {
        revertLeadsInStore(previousLeads);
    }, []);
    const leadsLoading = useLeadStore((s) => s.loading);
    const leadsHasMore = useLeadStore((s) => s.leadsHasMore);
    const loadingMore = useLeadStore((s) => s.loadingMore);
    const getLeadById = useLeadStore((s) => s.getLeadById);
    const kanbanWrapperRef = useRef(null);
    const [pageScrollEl, setPageScrollEl] = useState(null);

    useEffect(() => {
        const mainEl = document.querySelector('.main-content');
        if (mainEl) {
            mainEl.classList.add('pipeline-active');
            setPageScrollEl(mainEl);
            if (!isRestoringPipelineRef.current) {
                mainEl.scrollTop = 0;
                requestAnimationFrame(() => {
                    try {
                        mainEl.scrollTop = 0;
                    } catch {
                        void 0;
                    }
                });
            }
        }
        return () => {
            if (mainEl) mainEl.classList.remove('pipeline-active');
            setPageScrollEl(null);
        };
    }, []);

    const invalidatePipelineSession = useCallback(() => {
        clearPipelineSessionState();
    }, []);

    const dragScrollRafRef = useRef(null);
    const lastDragClientXRef = useRef(null);
    const [showImport, setShowImport] = useState(false);
    const [exportingLeads, setExportingLeads] = useState(false);
    const [pipelineQuickTimes, setPipelineQuickTimes] = useState([]);
    const [movingLeadIds, setMovingLeadIds] = useState(() => new Set());
    const [savingLeadIds, setSavingLeadIds] = useState(() => new Set());
    const [scheduleModalLead, setScheduleModalLead] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [dragInsertOverId, setDragInsertOverId] = useState(null);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteLead, setNoteLead] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [moverOpenId, setMoverOpenId] = useState(null);
    const [lostModal, setLostModal] = useState(null);
    const initialPipelineAcademyId = useLeadStore.getState().academyId;
    const initialCachedStages = initialPipelineAcademyId
        ? readCachedPipelineStages(initialPipelineAcademyId)
        : null;
    const [stagesConfigLoaded, setStagesConfigLoaded] = useState(
        () => !initialPipelineAcademyId || Boolean(initialCachedStages?.length)
    );
    const [stages, setStages] = useState(() => initialCachedStages?.length ? initialCachedStages : []);
    /** Rótulo curto da coluna (fitness = «Experimental» como antes; physio = trialShort). */
    const displayStages = useMemo(
        () =>
            stages.map((s) =>
                String(s?.id || '').trim() === 'Aula experimental' ? { ...s, label: terms.trialShort } : s
            ),
        [stages, terms.trialShort]
    );
    const kanbanLoadingStages = useMemo(() => {
        if (displayStages.length > 0) return displayStages;
        return Array.from({ length: KANBAN_LOADING_SKELETON_COLS }, (_, i) => ({
            id: `__loading_${i}`,
            label: 'Carregando',
        }));
    }, [displayStages]);
    const displayStageIds = useMemo(
        () => new Set(displayStages.map((s) => normalizePipelineStageId(s?.id)).filter(Boolean)),
        [displayStages]
    );
    const nlPageCtx = useMemo(
        () => ({ context: 'funil', pipelineStages: displayStages }),
        [displayStages]
    );
    useNlPageContext(nlPageCtx);
    const [editStages, setEditStages] = useState(false);
    const [tempStages, setTempStages] = useState(() => (initialCachedStages?.length ? initialCachedStages : []));
    const [originFilter, setOriginFilter] = useState(() => pipelineSessionInitialFilters(initialSaved).originFilter);
    const [searchParams, setSearchParams] = useSearchParams();
    const followupKanbanFilter = searchParams.get('followup') === 'kanban';
    const [kanbanSearch, setKanbanSearch] = useState(() => String(initialSaved?.searchTerm ?? ''));
    const [profileFilter, setProfileFilter] = useState(() => pipelineSessionInitialFilters(initialSaved).profileFilter);
    const [searchStageScope, setSearchStageScope] = useState(() => pipelineSessionInitialFilters(initialSaved).searchStageScope);
    const [waDropdownOpenId, setWaDropdownOpenId] = useState(null);
    const [missedModalLead, setMissedModalLead] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [searchingServer, setSearchingServer] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null);
    const [matriculaModalOpen, setMatriculaModalOpen] = useState(false);
    const [dragTargetLead, setDragTargetLead] = useState(null);
    const [lostModalLead, setLostModalLead] = useState(null);
    const [linkStudentLead, setLinkStudentLead] = useState(null);
    const [linkStudentSaving, setLinkStudentSaving] = useState(false);
    const [triageBusyLeadId, setTriageBusyLeadId] = useState(null);
    const triageActionLockRef = useRef(false);
    const studentsLoading = useStudentStore((s) => s.loading);
    const [filterDateFrom, setFilterDateFrom] = useState(() => pipelineSessionInitialFilters(initialSaved).filterDateFrom);
    const [filterDateTo, setFilterDateTo] = useState(() => pipelineSessionInitialFilters(initialSaved).filterDateTo);
    const [enrollmentMonthFilter, setEnrollmentMonthFilter] = useState(
        () => pipelineSessionInitialFilters(initialSaved).enrollmentMonthFilter
    );
    const [quickFilter, setQuickFilter] = useState(() => pipelineSessionInitialQuickFilter(initialSaved));

    const buildPipelineSessionSnapshot = useCallback(() => {
        const activeFilters = {
            profileFilter,
            originFilter,
            filterDateFrom,
            filterDateTo,
            enrollmentMonthFilter,
            searchStageScope,
            followupKanban: followupKanbanFilter,
        };
        return {
            scrollX: kanbanWrapperRef.current?.scrollLeft ?? 0,
            scrollY: pageScrollEl?.scrollTop ?? document.querySelector('.main-content')?.scrollTop ?? 0,
            columnScrolls: {},
            searchTerm: kanbanSearch,
            activeFilters,
            activePeriodChip: deriveActivePeriodChip({
                quickFilter,
                filterDateFrom,
                filterDateTo,
                enrollmentMonthFilter,
            }),
        };
    }, [
        profileFilter,
        originFilter,
        filterDateFrom,
        filterDateTo,
        enrollmentMonthFilter,
        searchStageScope,
        followupKanbanFilter,
        kanbanSearch,
        quickFilter,
        pageScrollEl,
    ]);

    const openLeadProfile = useCallback(
        (lead, isEnrolledCard = false) => {
            try {
                const leadId = String(lead?.id || '').trim();
                if (!leadId) return;
                writePipelineSessionState(buildPipelineSessionSnapshot());
                if (isEnrolledCard) {
                    navigate(`/student/${leadId}`, { state: { from: LEAD_PROFILE_FROM_PIPELINE } });
                    return;
                }
                navigate(`/lead/${leadId}`, { state: { from: LEAD_PROFILE_FROM_PIPELINE } });
            } catch (error) {
                console.error('Error opening lead profile:', error);
                // Fallback navigation in case of error
                const leadId = String(lead?.id || '').trim();
                if (!leadId) return;
                if (isEnrolledCard || Boolean(lead?._isStudent || isStudentRecord(lead))) {
                    navigate(`/student/${leadId}`);
                } else {
                    navigate(`/lead/${leadId}`);
                }
            }
        },
        [buildPipelineSessionSnapshot, navigate]
    );

    useEffect(() => {
        if (!initialSaved?.activeFilters?.followupKanban) return;
        if (searchParams.get('followup') === 'kanban') return;
        setSearchParams({ followup: 'kanban' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restaura ?followup=kanban só na montagem
    }, []);

    const [waOutbound, setWaOutbound] = useState(() => ({
        name: '',
        zapster_instance_id: '',
        templates: { ...DEFAULT_WHATSAPP_TEMPLATES },
    }));
    const {
        templates: waTemplatesFromHook,
        academyName: waAcademyNameHook,
        zapsterInstanceId: waZapIdHook,
        automationsRaw: waAutomationsHook,
    } = useWhatsappTemplates(academyId);
    const [academyAutomationsRaw, setAcademyAutomationsRaw] = useState('');
    const [academySettingsRaw, setAcademySettingsRaw] = useState(null);
    const [matriculaSubmitting, setMatriculaSubmitting] = useState(false);
    const [postMatriculaContractOpen, setPostMatriculaContractOpen] = useState(false);
    const [postMatriculaContractLeadId, setPostMatriculaContractLeadId] = useState(null);
    const [matriculaInitialStep, setMatriculaInitialStep] = useState('choose');
    const modules = useLeadStore((s) => s.modules);
    const { questions: enrollmentQuestions } = useCustomLeadQuestions(academyId);
    const [noteError, setNoteError] = useState('');
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1023);
    const [filtersMenuOpen, setFiltersMenuOpen] = useState(false);
    const [pageActionsMenuOpen, setPageActionsMenuOpen] = useState(false);
    const filterTriggerRef = useRef(null);
    const pageActionsTriggerRef = useRef(null);
    const hiddenAtRef = useRef(null);
    const filterPanelStyle = useAnchoredMenuPosition(filterTriggerRef, filtersMenuOpen, {
        align: 'end',
        zIndex: PIPELINE_MENU_Z,
    });
    const pageActionsPanelStyle = useAnchoredMenuPosition(pageActionsTriggerRef, pageActionsMenuOpen, {
        align: 'end',
        maxHeight: 400,
        zIndex: PIPELINE_MENU_Z,
    });

    useEffect(() => {
        if (!waTemplatesFromHook) return;
        setWaOutbound((prev) => ({
            ...prev,
            name: waAcademyNameHook || prev.name,
            zapster_instance_id: waZapIdHook || prev.zapster_instance_id,
            templates: waTemplatesFromHook,
        }));
        setAcademyAutomationsRaw(String(waAutomationsHook || ''));
    }, [waTemplatesFromHook, waAcademyNameHook, waZapIdHook, waAutomationsHook]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const searchStageScopeOptions = useMemo(() => [
        { value: 'all', label: 'Todas as etapas' },
        ...displayStages.map((s) => ({
            value: s.id,
            label: String(s.label || s.id).trim() || s.id,
        })),
    ], [displayStages]);

    useEffect(() => {
        setSearchStageScope((prev) => {
            if (prev === 'all') return prev;
            const ids = new Set(stages.map((s) => s.id));
            return ids.has(prev) ? prev : 'all';
        });
    }, [stages]);

    useEffect(() => {
        const handlePointerDown = (e) => {
            if (e.target.closest?.('[data-pipeline-card-menu]')) return;
            setOpenMenuId(null);
            setWaDropdownOpenId(null);
            setMoverOpenId(null);
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, []);

    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth <= 1023);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    useEffect(() => {
        if (!academyId) return;
        if (!students.length && !useStudentStore.getState().loading) {
            void fetchStudents({ reset: true });
        }
    }, [academyId, students.length, fetchStudents]);

    useEffect(() => {
        if (!academyId) return;
        const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
                return;
            }
            if (document.visibilityState === 'visible') {
                const hiddenAt = hiddenAtRef.current;
                if (!hiddenAt) return;
                const elapsed = Date.now() - hiddenAt;
                hiddenAtRef.current = null;
                if (elapsed > REFRESH_THRESHOLD_MS) {
                    void fetchLeads({ reset: false });
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [academyId, fetchLeads]);

    const handleSearch = async (term) => {
        if (!isRestoringPipelineRef.current) {
            invalidatePipelineSession();
        }
        setKanbanSearch(term);

        if (!term || term.trim().length < 2) return;

        const localResults = leads.filter(l =>
            l.name?.toLowerCase().includes(term.toLowerCase()) ||
            normalizeKanbanPhone(l.phone).includes(normalizeKanbanPhone(term))
        );

        if (localResults.length === 0) {
            setSearchingServer(true);
            try {
                await useLeadStore.getState().fetchLeads({
                    reset: true,
                    search: term,
                });
            } finally {
                setSearchingServer(false);
            }
        }
    };

    const handleCopyPhone = useCallback((e, lead) => {
        e.stopPropagation();
        navigator.clipboard.writeText(lead.phone || '');
        setCopiedId(lead.id);
        setOpenMenuId(null);
        setTimeout(() => setCopiedId(null), 2000);
    }, []);

    const handleMarkAsLost = useCallback((e, lead) => {
        e.stopPropagation();
        setOpenMenuId(null);
        setLostModalLead(lead);
    }, []);

    const handleDeleteLead = useCallback((e, leadId) => {
        e.stopPropagation();
        setOpenMenuId(null);
        setConfirmModal({
            title: `Excluir ${contactLabel.toLowerCase()}?`,
            description: `Esta ação remove o ${contactLabel.toLowerCase()} permanentemente.`,
            confirmLabel: 'Excluir',
            onConfirm: async () => {
                try {
                    await deleteLead(leadId);
                    toast.success(`${contactLabel} excluído`);
                } catch (err) {
                    toast.error(err, 'delete');
                } finally {
                    setConfirmModal(null);
                }
            }
        });
    }, [contactLabel, deleteLead, toast]);

    const handleConfirmTriage = useCallback(async (lead) => {
        const leadId = String(lead?.id || '').trim();
        if (!leadId || triageActionLockRef.current) return;
        triageActionLockRef.current = true;
        setTriageBusyLeadId(leadId);
        try {
            await updateLead(leadId, buildTriageConfirmClientPatch(lead));
            toast.success('Lead confirmado');
        } catch (err) {
            toast.error(err, 'update');
        } finally {
            triageActionLockRef.current = false;
            setTriageBusyLeadId(null);
        }
    }, [toast, updateLead]);

    const handleDismissTriage = useCallback((eOrLead, maybeLead) => {
        const lead = maybeLead ?? eOrLead;
        if (eOrLead?.stopPropagation) eOrLead.stopPropagation();
        setOpenMenuId(null);
        const leadId = String(lead?.id || '').trim();
        if (!leadId) return;
        setConfirmModal({
            title: 'Marcar que não é lead?',
            description: 'Este contato será removido do funil. Novas mensagens dele não voltarão à triagem.',
            confirmLabel: 'Não é lead',
            onConfirm: async () => {
                try {
                    const phone = String(lead?.phone || '').replace(/\D/g, '');
                    await deleteLead(leadId);
                    if (phone && academyId) await unlinkInboxConversationLead({ phone, academyId, markNotLead: true });
                    toast.success('Contato descartado');
                } catch (err) {
                    toast.error(err, 'delete');
                } finally {
                    setConfirmModal(null);
                }
            },
        });
    }, [academyId, deleteLead, toast]);

    const handleLinkStudent = useCallback((lead) => {
        setOpenMenuId(null);
        setLinkStudentLead(lead);
        if (!students.length && !useStudentStore.getState().loading) {
            void fetchStudents({ reset: true });
        }
    }, [fetchStudents, students.length]);

    const handleLinkStudentConfirm = useCallback(async (studentId) => {
        const lead = linkStudentLead;
        if (!lead?.id || !studentId || linkStudentSaving) return;
        setLinkStudentSaving(true);
        try {
            await resolvePipelineLeadToStudent({
                lead,
                studentId,
                academyId,
                deleteLead,
            });
            toast.success('Aluno vinculado — contato removido do funil');
            setLinkStudentLead(null);
        } catch (err) {
            toast.error(err, 'update');
        } finally {
            setLinkStudentSaving(false);
        }
    }, [academyId, deleteLead, linkStudentLead, linkStudentSaving, toast]);

    const stepKanbanScrollFromClientX = (clientX) => {
        const el = kanbanWrapperRef.current;
        if (!el || typeof clientX !== 'number') return;
        const rect = el.getBoundingClientRect();
        let dx = 0;
        if (clientX < rect.left + KANBAN_SCROLL_EDGE) {
            dx = -Math.min(KANBAN_SCROLL_MAX_STEP, rect.left + KANBAN_SCROLL_EDGE - clientX);
        } else if (clientX > rect.right - KANBAN_SCROLL_EDGE) {
            dx = Math.min(KANBAN_SCROLL_MAX_STEP, clientX - (rect.right - KANBAN_SCROLL_EDGE));
        }
        if (dx !== 0) el.scrollLeft += dx;
    };

    const runDragScrollLoop = () => {
        dragScrollRafRef.current = null;
        const x = lastDragClientXRef.current;
        if (x == null) return;
        const el = kanbanWrapperRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const inHotZone = x < rect.left + KANBAN_SCROLL_EDGE || x > rect.right - KANBAN_SCROLL_EDGE;
        if (!inHotZone) return;
        stepKanbanScrollFromClientX(x);
        dragScrollRafRef.current = requestAnimationFrame(runDragScrollLoop);
    };

    const onKanbanWrapperDragOverCapture = (e) => {
        e.preventDefault();
        lastDragClientXRef.current = e.clientX;
        stepKanbanScrollFromClientX(e.clientX);
        if (dragScrollRafRef.current == null) {
            dragScrollRafRef.current = requestAnimationFrame(runDragScrollLoop);
        }
    };

    useEffect(() => {
        const clearDragScroll = () => {
            lastDragClientXRef.current = null;
            if (dragScrollRafRef.current != null) {
                cancelAnimationFrame(dragScrollRafRef.current);
                dragScrollRafRef.current = null;
            }
        };
        const onDocDragOver = (e) => {
            lastDragClientXRef.current = e.clientX;
        };
        document.addEventListener('dragend', clearDragScroll);
        document.addEventListener('drop', clearDragScroll);
        document.addEventListener('dragover', onDocDragOver);
        return () => {
            document.removeEventListener('dragend', clearDragScroll);
            document.removeEventListener('drop', clearDragScroll);
            document.removeEventListener('dragover', onDocDragOver);
            clearDragScroll();
        };
    }, []);

    useEffect(() => {
        if (!academyId) return;
        const { leads, leadsLastFetchedAt, loading, fetchLeads } = useLeadStore.getState();
        if (loading) return;
        const STALE_MS = 5 * 60 * 1000;
        if (leads.length > 0 && leadsLastFetchedAt && Date.now() - leadsLastFetchedAt < STALE_MS) return;
        void fetchLeads({ reset: true });
    }, [academyId]);

    const handleLoadMoreLeads = async () => {
        if (loadingMore || leadsLoading || !leadsHasMore) return;
        await fetchMoreLeads();
    };

    const handleImport = (rows) => {
        importLeads(rows);
    };

    const handleExportLeads = useCallback(async () => {
        if (!academyId || exportingLeads) return;
        setExportingLeads(true);
        try {
            const includeContact = navRole === 'owner' || navRole === 'admin';
            const { ok, count } = await exportAllLeadsSpreadsheet(academyId, 'funil-export', {
                includeContact,
                onProgress: (n, total) => {
                    if (total && n < total) {
                        toast.info(`Exportando… ${n} de ${total}`);
                    }
                },
            });
            if (!ok || count === 0) {
                toast.warning('Não há leads para exportar.');
                return;
            }
            toast.success(`Planilha gerada com ${count} lead(s).`);
        } catch (e) {
            console.error('[Pipeline] export leads:', e);
            toast.error('Não foi possível exportar os leads.');
        } finally {
            setExportingLeads(false);
        }
    }, [academyId, exportingLeads, navRole, toast]);
    const singular = (plural) => {
        if (!plural) return contactLabel;
        const p = String(plural).trim();
        if (p.toLowerCase().endsWith('s') && p.length > 1) return p.slice(0, -1);
        return p;
    };

    useEffect(() => {
        if (!academyId) {
            setStagesConfigLoaded(true);
            return;
        }
        let cancelled = false;
        const cached = readCachedPipelineStages(academyId);
        if (cached?.length) {
            setStages(cached);
            setTempStages(cached);
            setStagesConfigLoaded(true);
        } else {
            setStages([]);
            setTempStages([]);
            setStagesConfigLoaded(false);
        }
        const normalizeStageList = (cols) => {
            const seen = new Set();
            const out = [];
            for (const raw of cols || []) {
                if (!raw) continue;
                const id = normalizePipelineStageId(raw.id);
                if (!id || seen.has(id)) continue;
                seen.add(id);
                out.push({
                    ...raw,
                    id,
                    label: String(raw.label || id).trim(),
                    slaDays: Number.isFinite(raw.slaDays) ? raw.slaDays : DEFAULT_STAGE_SLA_DAYS,
                });
            }
            return out;
        };
        const ensureSpecialColumns = (cols) => {
            const base = Array.isArray(cols) ? cols.filter(Boolean) : [];
            const ids = new Set(base.map((c) => normalizePipelineStageId(c?.id)).filter(Boolean));
            const out = [...base];
            if (!ids.has('Novo')) {
                out.unshift({ id: 'Novo', label: 'Novo', slaDays: DEFAULT_STAGE_SLA_DAYS });
            }
            if (!ids.has('Aula experimental')) {
                const novoIdx = out.findIndex((c) => normalizePipelineStageId(c?.id) === 'Novo');
                const row = { id: 'Aula experimental', label: 'Experimental', slaDays: DEFAULT_STAGE_SLA_DAYS };
                out.splice(novoIdx >= 0 ? novoIdx + 1 : out.length, 0, row);
            }
            if (!ids.has(LEAD_STATUS.MISSED)) out.push({ id: LEAD_STATUS.MISSED, label: 'Não compareceu' });
            if (!ids.has(LEAD_STATUS.LOST)) out.push({ id: LEAD_STATUS.LOST, label: 'Perdidos' });
            return out;
        };
        const mergeWaitingDecisionStage = (cols) => {
            const base = Array.isArray(cols) ? [...cols].filter(Boolean) : [];
            const ids = new Set(base.map((c) => String(c?.id || '').trim()).filter(Boolean));
            if (ids.has(PIPELINE_WAITING_DECISION_STAGE)) return base;
            const matIdx = base.findIndex((c) => String(c?.id || '').trim() === 'Matriculado');
            const row = { id: PIPELINE_WAITING_DECISION_STAGE, label: 'Aguardando decisão', slaDays: DEFAULT_STAGE_SLA_DAYS };
            if (matIdx >= 0) {
                base.splice(matIdx, 0, row);
            } else {
                const expIdx = base.findIndex((c) => String(c?.id || '').trim() === 'Aula experimental');
                base.splice(expIdx >= 0 ? expIdx + 1 : base.length, 0, row);
            }
            return base;
        };
        const applyMatriculadoLabel = (cols) => {
            if (vertical !== 'physio') return cols;
            return (cols || []).map((c) =>
                String(c?.id || '').trim() === 'Matriculado'
                    ? { ...c, label: terms.pipelineEnrolledColumnLabel }
                    : c
            );
        };
        const finalizeStages = (cols) =>
            applyMatriculadoLabel(ensureSpecialColumns(mergeWaitingDecisionStage(normalizeStageList(cols))));
        const applyResolvedStages = (normalized) => {
            if (cancelled) return;
            writeCachedPipelineStages(academyId, normalized);
            setStages(normalized);
            setTempStages(normalized);
        };
        getAcademyDocument(academyId)
            .then((doc) => {
                if (cancelled) return;
                setAcademySettingsRaw(doc?.settings ?? null);
                setPipelineQuickTimes(getAcademyQuickTimeChipValues(doc));
                try {
                    const stagesRaw = readStagesConfigRawFromAcademyDoc(doc);
                    if (stagesRaw) {
                        const conf = typeof stagesRaw === 'string' ? JSON.parse(stagesRaw) : stagesRaw;
                        if (Array.isArray(conf) && conf.length > 0) {
                            applyResolvedStages(finalizeStages(conf));
                            return;
                        }
                    }
                    applyResolvedStages(finalizeStages(buildDefaultStages(terms)));
                } catch {
                    applyResolvedStages(finalizeStages(buildDefaultStages(terms)));
                }
            })
            .catch(() => {
                if (cancelled) return;
                setAcademyAutomationsRaw('');
                setPipelineQuickTimes(getAcademyQuickTimeChipValues(null));
                toast.show({ type: 'error', message: 'Não foi possível carregar configurações do funil.' });
                setStages((prev) => {
                    if (prev.length) return prev;
                    const normalized = finalizeStages(buildDefaultStages(terms));
                    setTempStages(normalized);
                    return normalized;
                });
            })
            .finally(() => {
                if (!cancelled) setStagesConfigLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [academyId, toast, vertical, terms]);

    const templateSendKeys = useMemo(
        () =>
            Object.entries(waOutbound.templates)
                .filter(([, v]) => typeof v === 'string' && String(v).trim())
                .map(([k]) => k),
        [waOutbound.templates]
    );

    const sendTemplateFromPipeline = useCallback(async (e, lead, key) => {
        e.stopPropagation();
        setOpenMenuId(null);
        setWaDropdownOpenId(null);
        await sendWhatsappTemplateOutbound({
            lead,
            academyId,
            academyName: waOutbound.name,
            templateKey: key,
            templatesMap: waOutbound.templates,
            zapsterInstanceId: waOutbound.zapster_instance_id,
            onToast: (t) => {
                toast.show({ type: 'success', message: t.message });
            }
        });
    }, [academyId, waOutbound, toast]);

    const automationConfig = useMemo(
        () => parseAutomationsConfig(academyAutomationsRaw),
        [academyAutomationsRaw]
    );

    const automationCtxBase = useCallback(
        () => ({
            academyId,
            waOutbound,
            academyRaw: academyAutomationsRaw,
            automationConfig,
            permissionContext: permCtx,
            updateLead,
            getLead: (leadId) => getLeadById(leadId),
        }),
        [academyId, waOutbound, academyAutomationsRaw, automationConfig, permCtx, updateLead, getLeadById]
    );

    const reportAutomations = useCallback(
        (result) => {
            notifyAutomationFeedback(toast.addToast, result);
        },
        [toast]
    );

    const handleWaCardClick = useCallback(
        (e, lead) => {
            e.stopPropagation();
            if (templateSendKeys.length === 0) {
                toast.show({ type: 'error', message: 'Sem templates configurados' });
                return;
            }
            if (templateSendKeys.length === 1) {
                void sendTemplateFromPipeline(e, lead, templateSendKeys[0]);
                return;
            }
            setWaDropdownOpenId((prev) => (prev === lead.id ? null : lead.id));
            setOpenMenuId(null);
        },
        [templateSendKeys, sendTemplateFromPipeline, toast]
    );

    const handleReschedule = async (lead, ymd, time, note) => {
        const patch = buildSchedulePatch(lead, { date: ymd, time });
        const textBody = String(note || '').trim() || `${terms.trial} agendada`;
        try {
            try {
                await addLeadEvent({
                    academyId,
                    leadId: lead.id,
                    type: 'schedule',
                    to: ymd,
                    text: textBody,
                    createdBy: userId || 'user',
                    permissionContext: permCtx,
                    payloadJson: { date: ymd, time },
                });
                await updateLead(lead.id, patch, { fallbackLead: lead });
            } catch {
                await updateLead(lead.id, patch, { fallbackLead: lead });
            }
            const autoResult = await safeAutomationDispatch(
                afterExperimentalScheduled({
                    lead: { ...lead, ...patch },
                    ymd,
                    time,
                    ...automationCtxBase(),
                    getLead: () => getLeadById(lead.id) || { ...lead, ...patch },
                }),
                'schedule_confirm'
            );
            reportAutomations(autoResult);
            toast.success(`Reagendado para ${ymd} ${time}`);
        } catch (e) {
            toast.error(e, 'save');
            throw e;
        }
    };

    const onConfirmSchedulePipeline = async ({ date, time, note }) => {
        if (!scheduleModalLead) return;
        await handleReschedule(scheduleModalLead, date, time, note);
    };

    const openMover = useCallback((e, leadId) => {
        e.stopPropagation();
        setMoverOpenId(prev => prev === leadId ? null : leadId);
    }, []);
    const openLostModal = useCallback((leadId, onConfirm) => {
        const lead = getLeadById(leadId);
        setLostModal({ leadId, leadName: lead?.name || contactLabel, onConfirm });
    }, [getLeadById, contactLabel]);
    const handleConfirmPresence = useCallback(async (e, lead) => {
        e.stopPropagation();
        try {
            await updateLead(lead.id, {
                status: LEAD_STATUS.COMPLETED,
                pipelineStage: PIPELINE_WAITING_DECISION_STAGE,
                attendedAt: new Date().toISOString(),
                statusChangedAt: new Date().toISOString()
            });
            const autoResult = await safeAutomationDispatch(
                afterPresenceConfirmed({
                    lead: { ...lead, status: LEAD_STATUS.COMPLETED, pipelineStage: PIPELINE_WAITING_DECISION_STAGE },
                    ...automationCtxBase(),
                    getLead: () => getLeadById(lead.id) || lead,
                }),
                'presence_confirmed'
            );
            reportAutomations(autoResult);
            await addLeadEvent({
                academyId,
                leadId: lead.id,
                type: 'attended',
                from: lead.pipelineStage || '',
                to: PIPELINE_WAITING_DECISION_STAGE,
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            toast.success(`${terms.attendance} confirmada`);
            setOpenMenuId(null);
        } catch (err) {
            toast.error(err, 'action');
        }
    }, [updateLead, academyId, automationCtxBase, reportAutomations, userId, permCtx, terms.attendance, toast, getLeadById]);

    const handleMissedWithReason = async (lead, reason) => {
        try {
            const now = new Date().toISOString();
            await updateLead(lead.id, {
                status: LEAD_STATUS.MISSED,
                pipelineStage: LEAD_STATUS.MISSED,
                missedAt: now,
                missed_reason: reason,
                statusChangedAt: now
            });
            const autoResult = await safeAutomationDispatch(
                afterMissed({
                    lead: { ...lead, status: LEAD_STATUS.MISSED, pipelineStage: LEAD_STATUS.MISSED },
                    ...automationCtxBase(),
                }),
                'missed'
            );
            reportAutomations(autoResult);
            await addLeadEvent({
                academyId,
                leadId: lead.id,
                type: 'missed',
                from: lead.pipelineStage || '',
                to: LEAD_STATUS.MISSED,
                text: `Motivo: ${reason}`,
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            toast.success(`${contactLabel} movido para Não compareceu`);
            setMissedModalLead(null);
            setOpenMenuId(null);
        } catch (err) {
            toast.error(err, 'action');
        }
    };

    const executeMatricula = async (lead, customAnswers = {}, plan = '', enrollmentDate = '') => {
        try {
            let extraToast = '';
            await performEnrollment({
                lead,
                academyId,
                userId,
                permissionContext: permCtx,
                updateLead,
                customQuestions: enrollmentQuestions,
                customAnswers,
                plan,
                enrollmentDate,
                academySettingsRaw,
                waAutomation: { waOutbound, academyRaw: academyAutomationsRaw },
                onToast: (msg) => {
                    extraToast = msg;
                },
                addToast: toast.addToast,
            });
            void fetchStudents({ reset: true });
            toast.show({
                type: 'success',
                message: terms.pipelineEnrollmentSuccessToast + (extraToast ? ` ${extraToast}` : ''),
            });
        } catch (err) {
            toast.error(err, 'action');
            throw err;
        }
    };

    const openMatriculaModal = useCallback((lead, { paymentShortcut = false } = {}) => {
        setDragTargetLead(lead);
        setMatriculaInitialStep(paymentShortcut ? 'payment' : 'choose');
        setMatriculaModalOpen(true);
    }, []);

    const saveStages = async () => {
        try {
            let cleaned = tempStages
                .filter(s => s && String(s.id).trim())
                .map((s) => ({
                    id: String(s.id).trim(),
                    label: String(s.label || s.id).trim(),
                    slaDays: Number.isFinite(s.slaDays) ? s.slaDays : DEFAULT_STAGE_SLA_DAYS,
                }));
            const stageIds = new Set(cleaned.map((s) => s.id));
            if (!stageIds.has('Novo')) {
                cleaned = [{ id: 'Novo', label: 'Novo', slaDays: DEFAULT_STAGE_SLA_DAYS }, ...cleaned];
            }
            const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
            await databases.updateDocument(
                DB_ID,
                ACADEMIES_COL,
                academyId,
                buildAcademyStagesConfigSavePayload(doc, cleaned)
            );
            invalidateAcademyDocumentCache(academyId);
            writeCachedPipelineStages(academyId, cleaned);
            setStages(cleaned);
            setEditStages(false);
        } catch (e) {
            console.error('saveStages error', e);
            toast.show({
                type: 'error',
                message: 'Erro ao salvar configuração do funil.',
            });
        }
    };
    const addStage = () => {
        const id = `custom-${Date.now()}`;
        setTempStages(prev => [...prev, { id, label: 'Nova etapa', slaDays: DEFAULT_STAGE_SLA_DAYS }]);
    };
    const mapLeadToStageId = useCallback(
        (lead) => resolveLeadPipelineStageId(lead, { stages, isPendingTriage: isLeadPendingTriage }),
        [stages]
    );

    const tempStageLeadCounts = useMemo(
        () => buildPipelineStageLeadCounts(leads, { stages: tempStages, isPendingTriage: isLeadPendingTriage }),
        [leads, tempStages]
    );

    const filterByDate = useCallback((lead) => {
        const { from, to } = resolveLeadPeriodRange({ filterDateFrom, filterDateTo, quickFilter, formatLocalYmd });
        if (!from && !to) return true;

        const dateRef = leadBoardPeriodDateRef(lead);
        if (!dateRef) return false;
        if (from && dateRef < from) return false;
        if (to && dateRef > to) return false;
        return true;
    }, [filterDateFrom, filterDateTo, quickFilter]);

    /** Triagem e captação/experimental ativas sempre visíveis, mesmo com filtro de período. */
    const passesBoardDateFilter = useCallback(
        (lead) => isLeadPendingTriage(lead) || isOpenFunnelLead(lead) || filterByDate(lead),
        [filterByDate]
    );

    const enrollmentPeriodRange = useMemo(
        () =>
            resolveEnrollmentPeriodRange({
                enrollmentMonthFilter,
                filterDateFrom,
                filterDateTo,
                quickFilter,
                formatLocalYmd,
            }),
        [enrollmentMonthFilter, filterDateFrom, filterDateTo, quickFilter]
    );

    const filterEnrolledByDate = useCallback(
        (contact) => enrolledContactMatchesPeriod(contact, enrollmentPeriodRange),
        [enrollmentPeriodRange]
    );

    const applyBoardSearchFilter = useCallback((list) => {
        const q = String(kanbanSearch || '').trim();
        const qPhone = normalizeKanbanPhone(kanbanSearch);
        if (!q && !qPhone) return list;
        return list.filter((l) => leadMatchesKanbanSearch(l, kanbanSearch));
    }, [kanbanSearch]);

    /** Primeira carga: evita colunas vazias/flash do funil padrão até etapas e leads estarem prontos. */
    const showKanbanInitialLoading = Boolean(
        !stagesConfigLoaded || (leadsLoading && (!Array.isArray(leads) || leads.length === 0))
    );

    const leadsForBoardCore = useMemo(() => {
        let list = leads
            .filter((l) => leadIsPipelineFunnel(l))
            .filter((l) => leadMatchesContactType(l))
            .filter((l) => leadMatchesProfileFilter(l, profileFilter))
            .filter((l) => (originFilter === 'all' ? true : (l.origin || '') === originFilter))
            .filter(passesBoardDateFilter);

        list = applyBoardSearchFilter(list);

        if (searchStageScope !== 'all') {
            const scopeId = normalizePipelineStageId(searchStageScope);
            list = list.filter((l) => normalizePipelineStageId(mapLeadToStageId(l)) === scopeId);
        }

        return list;
    }, [
        leads,
        profileFilter,
        originFilter,
        searchStageScope,
        mapLeadToStageId,
        passesBoardDateFilter,
        applyBoardSearchFilter,
    ]);

    const leadsForBoardPreCooling = useMemo(() => {
        let list = leadsForBoardCore;

        if (followupKanbanFilter) {
            list = list.filter(
                (l) => l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED
            );
        }

        return list;
    }, [leadsForBoardCore, followupKanbanFilter]);

    const {
        followupDoneByLead,
        followupContactByLead,
        followupSnoozeUntilByLead,
        inboundAfterByLead,
        inboundAfterByPhone,
    } = useFollowupEventsByLead(academyId);
    const followupPlaybook = useMemo(
        () => readFollowupPlaybook(academySettingsRaw),
        [academySettingsRaw]
    );
    const followupTempByLead = useMemo(() => {
        const ctx = {
            playbook: followupPlaybook,
            followupDoneByLead,
            followupContactByLead,
            followupSnoozeUntilByLead,
            inboundAfterByLead,
            inboundAfterByPhone,
        };
        const map = {};
        for (const lead of leadsForBoardPreCooling) {
            if (!isFollowUpLead(lead)) continue;
            const state = computeFollowupState(lead, ctx);
            if (state.doneForCurrentClass || state.isSnoozed) continue;
            if (state.temperature !== 'on_track') map[lead.id] = state.temperature;
        }
        return map;
    }, [
        leadsForBoardPreCooling,
        followupPlaybook,
        followupDoneByLead,
        followupContactByLead,
        followupSnoozeUntilByLead,
        inboundAfterByLead,
        inboundAfterByPhone,
    ]);

    const leadsForBoard = leadsForBoardPreCooling;

    /** Alunos matriculados (coleção students) + legado ainda em leads com status Matriculado. */
    const enrolledForBoard = useMemo(() => {
        const studentIds = new Set();
        let list = (students || [])
            .filter((s) => isActiveStudent(s))
            .filter((s) => leadMatchesProfileFilter(s, profileFilter))
            .filter((s) => (originFilter === 'all' ? true : boardContactOrigin(s) === originFilter))
            .filter(filterEnrolledByDate);

        for (const s of list) studentIds.add(s.id);

        const legacyEnrolled = (leads || [])
            .filter((l) => !studentIds.has(l.id))
            .filter((l) => !isInactiveStudent(l))
            .filter((l) => mapLeadToStageId(l) === ENROLLED_PIPELINE_STAGE_ID || l.status === LEAD_STATUS.CONVERTED)
            .filter((l) => leadMatchesProfileFilter(l, profileFilter))
            .filter((l) => (originFilter === 'all' ? true : boardContactOrigin(l) === originFilter))
            .filter(filterEnrolledByDate);

        list = [...list, ...legacyEnrolled];
        list = applyBoardSearchFilter(list);

        if (searchStageScope !== 'all' && searchStageScope !== ENROLLED_PIPELINE_STAGE_ID) {
            return [];
        }

        return list.sort(sortBoardContactsByRecentEnrollment);
    }, [
        students,
        leads,
        profileFilter,
        originFilter,
        searchStageScope,
        mapLeadToStageId,
        filterEnrolledByDate,
        applyBoardSearchFilter,
    ]);
    const slaAlerts = useSlaAlerts(leadsForBoard, stages);

    const pipelineHeaderMeta = useMemo(() => {
        const total = leadsForBoard.length;
        const needHumanCount = leadsForBoard.filter((l) => l.needHuman).length;
        return { total, needHumanCount };
    }, [leadsForBoard]);

    useEffect(() => {
        const saved = pendingScrollRestoreRef.current;
        if (!saved || showKanbanInitialLoading || isMobile) return;

        let raf1 = 0;
        let raf2 = 0;
        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                const wrapper = kanbanWrapperRef.current;
                if (wrapper && Number.isFinite(saved.scrollX)) {
                    wrapper.scrollLeft = saved.scrollX;
                }
                const mainEl = document.querySelector('.main-content');
                if (mainEl && Number.isFinite(saved.scrollY)) {
                    mainEl.scrollTop = saved.scrollY;
                }
                clearPipelineSessionState();
                pendingScrollRestoreRef.current = null;
                isRestoringPipelineRef.current = false;
            });
        });

        return () => {
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [showKanbanInitialLoading, isMobile, displayStages.length, leadsForBoard.length, enrolledForBoard.length]);

    const advancedFiltersActive =
        profileFilter !== 'all' ||
        originFilter !== 'all' ||
        Boolean(quickFilter || filterDateFrom || filterDateTo || enrollmentMonthFilter) ||
        searchStageScope !== 'all';

    const clearAdvancedFilters = useCallback(() => {
        setProfileFilter('all');
        setOriginFilter('all');
        setFilterDateFrom('');
        setFilterDateTo('');
        setEnrollmentMonthFilter('');
        setQuickFilter(null);
        setSearchStageScope('all');
    }, []);

    const clearAllPeriodFilters = useCallback(() => {
        setProfileFilter('all');
        setOriginFilter('all');
        setFilterDateFrom('');
        setFilterDateTo('');
        setEnrollmentMonthFilter('');
        setQuickFilter(null);
        setSearchStageScope('all');
    }, []);

    const handleAdvancedFilterChange = useCallback((patch) => {
        if (!isRestoringPipelineRef.current) {
            invalidatePipelineSession();
        }
        if (patch.profileFilter !== undefined) setProfileFilter(patch.profileFilter);
        if (patch.originFilter !== undefined) setOriginFilter(patch.originFilter);
        if (patch.searchStageScope !== undefined) setSearchStageScope(patch.searchStageScope);
        if (patch.enrollmentMonthFilter !== undefined) setEnrollmentMonthFilter(patch.enrollmentMonthFilter);
        if (patch.filterDateFrom !== undefined) setFilterDateFrom(patch.filterDateFrom);
        if (patch.filterDateTo !== undefined) setFilterDateTo(patch.filterDateTo);
        if (patch.quickFilter !== undefined) setQuickFilter(patch.quickFilter);
    }, [invalidatePipelineSession]);

    const handleClearAdvancedFilters = useCallback(() => {
        if (!isRestoringPipelineRef.current) {
            invalidatePipelineSession();
        }
        clearAdvancedFilters();
        setFiltersMenuOpen(false);
    }, [clearAdvancedFilters, invalidatePipelineSession]);

    const pipelineHeaderMetaNode = showKanbanInitialLoading ? (
        'Carregando…'
    ) : (
        <>
            <span className="navi-ui-count">{pipelineHeaderMeta.total}</span>{' '}
            {pluralizeContactLabel(pipelineHeaderMeta.total, labels.leads || 'Leads')}
            {pipelineHeaderMeta.needHumanCount > 0 ? (
                <>
                    {' '}
                    · <span className="navi-ui-count">{pipelineHeaderMeta.needHumanCount}</span> precisam resposta
                </>
            ) : null}
        </>
    );

    const isCurrentEnrollmentMonth = enrollmentMonthFilter === currentMonthYm();

    const applyPeriodChip = useCallback((chip) => {
        if (!isRestoringPipelineRef.current) {
            invalidatePipelineSession();
        }
        if (chip === 'today') {
            setQuickFilter('today');
            setEnrollmentMonthFilter('');
            setFilterDateFrom('');
            setFilterDateTo('');
            return;
        }
        if (chip === 'week') {
            setQuickFilter('week');
            setEnrollmentMonthFilter('');
            setFilterDateFrom('');
            setFilterDateTo('');
            return;
        }
        if (chip === 'month') {
            setQuickFilter('month');
            setEnrollmentMonthFilter(currentMonthYm());
            setFilterDateFrom('');
            setFilterDateTo('');
            return;
        }
        clearAllPeriodFilters();
    }, [clearAllPeriodFilters, invalidatePipelineSession]);

    const renderPeriodFilterChips = () => (
        <>
            <button type="button" className={`filter-chip${quickFilter === 'today' ? ' is-active' : ''}`} onClick={() => applyPeriodChip('today')}>Hoje</button>
            <button type="button" className={`filter-chip${quickFilter === 'week' ? ' is-active' : ''}`} onClick={() => applyPeriodChip('week')}>Esta sem.</button>
            <button type="button" className={`filter-chip${quickFilter === 'month' || isCurrentEnrollmentMonth ? ' is-active' : ''}`} onClick={() => applyPeriodChip('month')}>Este mês</button>
            <button type="button" className={`filter-chip${!quickFilter && !filterDateFrom && !filterDateTo && !enrollmentMonthFilter ? ' is-active' : ''}`} onClick={() => applyPeriodChip('all')}>Todos</button>
        </>
    );

    const renderAdvancedFiltersPanel = () => (
        <PipelineAdvancedFilters
            profileFilter={profileFilter}
            originFilter={originFilter}
            filterDateFrom={filterDateFrom}
            filterDateTo={filterDateTo}
            enrollmentMonthFilter={enrollmentMonthFilter}
            searchStageScope={searchStageScope}
            searchStageScopeOptions={searchStageScopeOptions}
            onChange={handleAdvancedFilterChange}
            onClear={handleClearAdvancedFilters}
        />
    );

    const renderFiltersMenuPanel = () =>
        filtersMenuOpen && filterPanelStyle
            ? createPortal(
                <DropdownMenuPanel
                    className="pipeline-filters-menu__panel navi-menu__panel--overlay"
                    fixed
                    elevated
                    style={filterPanelStyle}
                    aria-label="Filtros do funil"
                    data-pipeline-filter-menu
                >
                    {renderAdvancedFiltersPanel()}
                </DropdownMenuPanel>,
                document.body,
            )
            : null;

    const renderPageActionsMenu = (panelClassName = 'pipeline-page-actions-menu__panel') => (
        <>
            <button
                ref={pageActionsTriggerRef}
                type="button"
                className="btn-action-ghost"
                aria-haspopup="menu"
                aria-expanded={pageActionsMenuOpen}
                aria-label="Mais ações do funil"
                onClick={() => setPageActionsMenuOpen((v) => !v)}
            >
                <MoreHorizontal size={18} aria-hidden />
            </button>
            {pageActionsMenuOpen && pageActionsPanelStyle
                ? createPortal(
                <DropdownMenuPanel
                    className={panelClassName}
                    fixed
                    elevated
                    style={pageActionsPanelStyle}
                    aria-label="Ações do funil"
                    data-pipeline-page-actions-menu
                >
                    <DropdownMenuItem
                        icon={<Upload size={16} aria-hidden />}
                        onClick={() => {
                            setPageActionsMenuOpen(false);
                            setShowImport(true);
                        }}
                    >
                        {`Importar ${labels.leads}`}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        icon={<SlidersHorizontal size={16} aria-hidden />}
                        onClick={() => {
                            setPageActionsMenuOpen(false);
                            setEditStages((prev) => !prev);
                            setTempStages(stages);
                        }}
                    >
                        Editar etapas
                    </DropdownMenuItem>
                    <DropdownMenuDivider />
                    <DropdownMenuItem
                        icon={<Download size={16} aria-hidden />}
                        disabled={exportingLeads || !academyId}
                        onClick={() => {
                            setPageActionsMenuOpen(false);
                            void handleExportLeads();
                        }}
                    >
                        {exportingLeads ? 'Exportando…' : 'Exportar leads'}
                    </DropdownMenuItem>
                    {leadsHasMore ? (
                        <>
                            <DropdownMenuDivider />
                            <DropdownMenuItem
                                disabled={loadingMore || leadsLoading}
                                onClick={() => {
                                    setPageActionsMenuOpen(false);
                                    void handleLoadMoreLeads();
                                }}
                            >
                                {loadingMore ? 'Carregando…' : 'Carregar mais leads'}
                            </DropdownMenuItem>
                        </>
                    ) : null}
                </DropdownMenuPanel>,
                document.body,
            )
                : null}
        </>
    );

    const clearDragUiState = useCallback(() => {
        setActiveId(null);
        setDragOver(null);
        setDragInsertOverId(null);
    }, []);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
        setDragOver(null);
        setDragInsertOverId(null);
    };

    const resolveDropStageId = useCallback((over) => {
        if (!over) return null;

        const hasStageId = (val) => stages.some((s) => String(s.id) === String(val));

        const overId = String(over.id || '');
        if (hasStageId(overId)) return overId;

        // Quando "over.id" é de um card, converte pelo estágio atual desse lead.
        const overLead = leadsForBoard.find((l) => String(l.id) === overId);
        if (overLead) {
            const leadStage = mapLeadToStageId(overLead);
            if (hasStageId(leadStage)) return String(leadStage);
        }

        if (enrolledForBoard.some((l) => String(l.id) === overId)) {
            return ENROLLED_PIPELINE_STAGE_ID;
        }

        const containerId = String(over?.data?.current?.sortable?.containerId || '');
        if (hasStageId(containerId)) return containerId;

        return null;
    }, [stages, leadsForBoard, enrolledForBoard, mapLeadToStageId]);

    const getColLeadsForStage = useCallback((stageId) => {
        const isEnrolledCol = String(stageId || '').trim() === ENROLLED_PIPELINE_STAGE_ID;
        const source = isEnrolledCol ? enrolledForBoard : leadsForBoard;
        return source
            .filter((l) => isEnrolledCol || leadBelongsInPipelineColumn(l, stageId, mapLeadToStageId, displayStageIds))
            .filter((l) => (originFilter === 'all' ? true : boardContactOrigin(l) === originFilter))
            .sort((a, b) => comparePipelineColLeads(a, b, isEnrolledCol));
    }, [enrolledForBoard, leadsForBoard, originFilter, mapLeadToStageId, displayStageIds]);

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        clearDragUiState();

        if (!over) return;

        const status = resolveDropStageId(over);
        if (!status) return;
        const leadId = active.id;
        const lead = getLeadById(leadId);

        if (!lead) return;

        const activeStage = mapLeadToStageId(lead);
        if (activeStage === status) {
            const colLeads = getColLeadsForStage(status);
            const oldIndex = colLeads.findIndex((l) => String(l.id) === String(leadId));
            let newIndex = colLeads.findIndex((l) => String(l.id) === String(over.id));
            if (newIndex === -1) {
                newIndex = Math.max(0, colLeads.length - 1);
            }
            if (oldIndex !== -1 && oldIndex !== newIndex) {
                patchLeadsOrder(status, arrayMove(colLeads, oldIndex, newIndex));
            }
            return;
        }

        if (status === 'Matriculado') {
            openMatriculaModal(lead);
            return;
        }

        if (status === LEAD_STATUS.MISSED) {
            setMissedModalLead(lead);
            return;
        }

        if (status === LEAD_STATUS.LOST) {
            openLostModal(leadId, async (lostReason) => {
                const cur = getLeadById(leadId);
                await addLeadEvent({
                    academyId,
                    leadId,
                    type: 'lost',
                    from: cur?.status || '',
                    to: LEAD_STATUS.LOST,
                    text: String(lostReason || '').slice(0, 1000),
                    createdBy: userId || 'user',
                    permissionContext: permCtx
                });
                await updateLead(leadId, {
                    status: LEAD_STATUS.LOST,
                    scheduledDate: '',
                    scheduledTime: '',
                    pipelineStage: LEAD_STATUS.LOST,
                    lostReason,
                    lostAt: new Date().toISOString()
                });
                toast.success('Marcado como perdido');
            });
            return;
        }

        const previousLeads = useLeadStore.getState().leads;
        const payload = buildPipelineMovePayload(lead, status);
        beginLeadMove(leadId);
        patchLeadInStore(leadId, payload);

        try {
            await addLeadEvent({
                academyId,
                leadId,
                type: 'pipeline_change',
                from: lead.pipelineStage || '',
                to: status,
                createdBy: userId || 'user',
                permissionContext: permCtx
            });
            setSavingLeadIds((prev) => {
                const next = new Set(prev);
                next.add(leadId);
                return next;
            });
            await updateLead(leadId, payload);
            const autoResult = await safeAutomationDispatch(
                afterMovedToPipelineStage({
                    lead: getLeadById(leadId) || lead,
                    toStage: status,
                    ...automationCtxBase(),
                    getLead: () => getLeadById(leadId) || lead,
                }),
                'waiting_decision'
            );
            reportAutomations(autoResult);
            toast.success(getPipelineMoveSuccessMessage(lead, status));
        } catch {
            revertLeads(previousLeads);
            toast.show({ type: 'error', message: 'Não foi possível mover o card. Tente novamente.' });
        } finally {
            endLeadMove(leadId);
            setSavingLeadIds((prev) => {
                const next = new Set(prev);
                next.delete(leadId);
                return next;
            });
        }
    };

    const handleDragOver = useCallback((event) => {
        const { over } = event;
        if (!over) {
            setDragOver((prev) => (prev === null ? prev : null));
            setDragInsertOverId((prev) => (prev === null ? prev : null));
            return;
        }

        const newOver = resolveDropStageId(over);
        setDragOver((prev) => (prev === newOver ? prev : newOver));

        const overId = String(over.id || '');
        const isColumnTarget = stages.some((s) => String(s.id) === overId);
        const nextInsert = isColumnTarget ? KANBAN_INSERT_END : overId;
        setDragInsertOverId((prev) => (prev === nextInsert ? prev : nextInsert));
    }, [resolveDropStageId, stages]);

    const moveToStatus = useCallback(async (e, leadId, stageId) => {
        e.stopPropagation();
        const lead = getLeadById(leadId);
        if (!lead) return;
        const fromStage = mapLeadToStageId(lead) || lead.pipelineStage || '';
        const toStage = stageId;

        if (stageId === 'Matriculado') {
            openMatriculaModal(lead);
            setMoverOpenId(null);
            return;
        }

        if (stageId === LEAD_STATUS.MISSED) {
            setMissedModalLead(lead);
            setMoverOpenId(null);
            return;
        }

        if (stageId === LEAD_STATUS.LOST) {
            openLostModal(leadId, async (lostReason) => {
                const cur = getLeadById(leadId);
                await addLeadEvent({
                    academyId,
                    leadId,
                    type: 'lost',
                    from: cur?.status || '',
                    to: LEAD_STATUS.LOST,
                    text: String(lostReason || '').slice(0, 1000),
                    createdBy: userId || 'user',
                    permissionContext: permCtx
                });
                await updateLead(leadId, {
                    status: LEAD_STATUS.LOST,
                    scheduledDate: '',
                    scheduledTime: '',
                    pipelineStage: LEAD_STATUS.LOST,
                    lostReason,
                    lostAt: new Date().toISOString()
                });
                setMoverOpenId(null);
                toast.success('Marcado como perdido');
            });
            return;
        }

        const previousLeads = useLeadStore.getState().leads;
        const payload = buildPipelineMovePayload(lead, toStage);
        beginLeadMove(leadId);
        patchLeadInStore(leadId, payload);

        try {
            if (fromStage !== toStage) {
                await addLeadEvent({
                    academyId,
                    leadId,
                    type: 'pipeline_change',
                    from: fromStage,
                    to: toStage,
                    createdBy: userId || 'user',
                    permissionContext: permCtx
                });
            }
                setSavingLeadIds((prev) => {
                    const next = new Set(prev);
                    next.add(leadId);
                    return next;
                });
            await updateLead(leadId, payload);
            const autoResult = await safeAutomationDispatch(
                afterMovedToPipelineStage({
                    lead: getLeadById(leadId) || lead,
                    toStage,
                    ...automationCtxBase(),
                    getLead: () => getLeadById(leadId) || lead,
                }),
                'waiting_decision'
            );
            reportAutomations(autoResult);
            toast.success(getPipelineMoveSuccessMessage(lead, toStage));
        } catch {
            revertLeads(previousLeads);
            toast.show({ type: 'error', message: 'Não foi possível mover o card. Tente novamente.' });
            setMoverOpenId(null);
            return;
        } finally {
            endLeadMove(leadId);
            setSavingLeadIds((prev) => {
                const next = new Set(prev);
                next.delete(leadId);
                return next;
            });
        }
        setMoverOpenId(null);
    }, [
        getLeadById,
        mapLeadToStageId,
        academyId,
        userId,
        permCtx,
        beginLeadMove,
        updateLead,
        revertLeads,
        endLeadMove,
        automationCtxBase,
        reportAutomations,
        toast,
        openLostModal,
        openMatriculaModal,
    ]);

    const openNote = useCallback((e, lead) => {
        e.stopPropagation();
        setNoteLead(lead);
        setNoteText('');
        setNoteError('');
        setNoteOpen(true);
    }, []);
    const saveNote = async () => {
        if (!noteLead) {
            return;
        }
        if (!noteText.trim()) {
            setNoteError('Digite uma observação antes de salvar.');
            return;
        }
        setNoteError('');
        await addLeadEvent({
            academyId,
            leadId: noteLead.id,
            type: 'note',
            text: noteText.trim().slice(0, 1000),
            createdBy: userId || 'user',
            permissionContext: permCtx
        });
        await updateLead(noteLead.id, { lastNoteAt: new Date().toISOString() });
        setNoteOpen(false);
        toast.success('Observação salva');
    };

    const scheduleModalLeadId = scheduleModalLead?.id ?? null;
    const pipelineMenuTrialLc = terms.trial.toLowerCase();
    const pipelineMenuAttendanceLc = terms.attendance.toLowerCase();
    const pipelineMenuEnrollment = terms.enrollment;

    const cardProps = useMemo(
        () => ({
            navigate,
            onOpenLeadProfile: openLeadProfile,
            openNote,
            openMenuId,
            scheduleModalLeadId,
            moverOpenId,
            setOpenMenuId,
            setWaDropdownOpenId,
            handleWaCardClick,
            waDropdownOpenId,
            templateSendKeys,
            sendTemplateFromPipeline,
            stages: displayStages,
            moveToStatus,
            handleCopyPhone,
            copiedId,
            handleMarkAsLost,
            handleDeleteLead,
            canDeleteLead,
            onConfirmTriage: handleConfirmTriage,
            onDismissTriage: handleDismissTriage,
            onLinkStudent: handleLinkStudent,
            triageBusyLeadId,
            linkStudentLead,
            linkStudentSaving,
            onOpenScheduleModal: setScheduleModalLead,
            onCloseSale: (lead) => openMatriculaModal(lead, { paymentShortcut: true }),
            onOpenMatricula: openMatriculaModal,
            handleConfirmPresence,
            setMissedModalLead,
            openMover,
            setDragTargetLead,
            mapLeadToStageId,
            pipelineMenuTrialLc,
            pipelineMenuAttendanceLc,
            pipelineMenuEnrollment,
            automationConfig,
        }),
        [
            navigate,
            openLeadProfile,
            openNote,
            openMenuId,
            scheduleModalLeadId,
            moverOpenId,
            automationConfig,
            waDropdownOpenId,
            templateSendKeys,
            sendTemplateFromPipeline,
            displayStages,
            moveToStatus,
            handleCopyPhone,
            copiedId,
            handleMarkAsLost,
            handleDeleteLead,
            canDeleteLead,
            handleConfirmTriage,
            handleDismissTriage,
            handleLinkStudent,
            triageBusyLeadId,
            linkStudentLead,
            linkStudentSaving,
            handleWaCardClick,
            handleConfirmPresence,
            openMover,
            mapLeadToStageId,
            pipelineMenuTrialLc,
            pipelineMenuAttendanceLc,
            pipelineMenuEnrollment,
            openMatriculaModal,
        ]
    );

    return (
        <div className="pipeline-container">
            <div className="pipeline-header">
                {!isMobile ? (
                    <div className="container">
                        <PageHeader
                            className="navi-page-header--flush"
                            title={labels.pipeline || 'Funil'}
                            subtitle="Mova leads entre etapas e registre retornos."
                            meta={pipelineHeaderMetaNode}
                            toolbar={
                            <>
                            <div className="page-header-row navi-toolbar pipeline-toolbar-unified">
                                <SearchField
                                    title="Filtra por nome ou telefone"
                                    value={kanbanSearch}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    placeholder="Buscar nome ou telefone..."
                                    aria-label="Buscar no funil"
                                />
                                {searchingServer ? (
                                    <span className="pipeline-search-status" role="status">Buscando…</span>
                                ) : null}
                                <FilterBar className="filter-bar--compact pipeline-period-chips">
                                    {renderPeriodFilterChips()}
                                </FilterBar>
                                <div className="pipeline-header-spacer" />
                                <DropdownMenu
                                    open={filtersMenuOpen}
                                    onOpenChange={setFiltersMenuOpen}
                                    className="pipeline-filters-menu"
                                    elevated
                                    dismissExtraSelector="[data-pipeline-filter-menu]"
                                >
                                    <button
                                        ref={filterTriggerRef}
                                        type="button"
                                        className={`btn-action-ghost pipeline-filters-trigger${advancedFiltersActive ? ' is-active' : ''}`}
                                        aria-haspopup="dialog"
                                        aria-expanded={filtersMenuOpen}
                                        onClick={() => setFiltersMenuOpen((v) => !v)}
                                    >
                                        <SlidersHorizontal size={14} aria-hidden /> Filtros
                                    </button>
                                    {renderFiltersMenuPanel()}
                                </DropdownMenu>
                                <DropdownMenu
                                    open={pageActionsMenuOpen}
                                    onOpenChange={setPageActionsMenuOpen}
                                    className="pipeline-page-actions-menu"
                                    align="end"
                                    dismissExtraSelector="[data-pipeline-page-actions-menu]"
                                >
                                    {renderPageActionsMenu()}
                                </DropdownMenu>
                                <button
                                    type="button"
                                    className="btn-action-primary btn-primary-action"
                                    onClick={() => dispatchOpenNewLeadModal()}
                                >
                                    <PlusCircle size={14} /> Novo lead
                                </button>
                            </div>
                            </>
                            }
                        />
                    </div>
                ) : (
                    <div className="container">
                        <PageHeader
                            className="navi-page-header--flush"
                            title={labels.pipeline || 'Funil'}
                            subtitle="Mova leads entre etapas e registre retornos."
                            meta={pipelineHeaderMetaNode}
                        />
                        <div className="navi-toolbar pipeline-mobile-toolbar">
                            <SearchField
                                className="navi-search--fluid"
                                value={kanbanSearch}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Buscar nome ou telefone..."
                                aria-label="Buscar no funil"
                            />
                            <DropdownMenu
                                open={filtersMenuOpen}
                                onOpenChange={setFiltersMenuOpen}
                                className="pipeline-filters-menu"
                                elevated
                                dismissExtraSelector="[data-pipeline-filter-menu]"
                            >
                                <button
                                    ref={filterTriggerRef}
                                    type="button"
                                    className={`btn-action-ghost pipeline-mobile-filters-trigger${advancedFiltersActive ? ' is-active' : ''}`}
                                    aria-haspopup="dialog"
                                    aria-expanded={filtersMenuOpen}
                                    aria-label="Filtros do funil"
                                    onClick={() => setFiltersMenuOpen((v) => !v)}
                                >
                                    <SlidersHorizontal size={16} aria-hidden />
                                </button>
                                {renderFiltersMenuPanel()}
                            </DropdownMenu>
                            <DropdownMenu
                                open={pageActionsMenuOpen}
                                onOpenChange={setPageActionsMenuOpen}
                                className="pipeline-page-actions-menu"
                                align="end"
                                dismissExtraSelector="[data-pipeline-page-actions-menu]"
                            >
                                {renderPageActionsMenu()}
                            </DropdownMenu>
                            <button
                                type="button"
                                className="btn-action-primary btn-primary-action"
                                onClick={() => dispatchOpenNewLeadModal()}
                            >
                                <PlusCircle size={14} aria-hidden /> Novo lead
                            </button>
                        </div>
                        <FilterBar className="page-header-row pipeline-filter-bar filter-bar--compact">
                            {renderPeriodFilterChips()}
                        </FilterBar>
                    </div>
                )}
                {editStages && (
                    <div className="container stage-editor">
                        <div className="stage-editor-head stage-editor-head--sortable">
                            <span className="stage-editor-head__drag" aria-hidden />
                            <span>Nome da etapa</span>
                            <span title="Alerta quando o interessado permanece mais dias que o limite nesta etapa">SLA (dias)</span>
                            <span className="stage-editor-head__actions" aria-hidden />
                        </div>
                        <PipelineStageEditorList
                            stages={tempStages}
                            onChange={setTempStages}
                            variant="pipeline"
                            getStageLeadCount={(stageId) => tempStageLeadCounts[stageId] || 0}
                            stageLeadCountsIncomplete={leadsHasMore}
                        />
                        <div className="stage-actions">
                            <button className="btn-secondary" onClick={addStage}><PlusCircle size={14} /> Adicionar etapa</button>
                            <button
                                type="button"
                                className="btn-outline"
                                title="Substitui a lista de etapas pelo modelo padrão. Clique em Salvar para gravar."
                                onClick={() => {
                                    setConfirmModal({
                                        title: 'Aplicar funil padrão?',
                                        description: 'As etapas atuais do editor serão substituídas até você salvar.',
                                        confirmLabel: 'Aplicar',
                                        onConfirm: async () => {
                                            setTempStages(
                                                buildDefaultStages(terms).map((s) => ({
                                                    ...s,
                                                    slaDays: s.slaDays ?? DEFAULT_STAGE_SLA_DAYS,
                                                }))
                                            );
                                            setConfirmModal(null);
                                        }
                                    });
                                }}
                            >
                                Funil padrão
                            </button>
                            <div className="grow"></div>
                            <button className="btn-outline" onClick={() => setEditStages(false)}>Cancelar</button>
                            <button className="btn-primary" onClick={saveStages}>Salvar</button>
                        </div>
                    </div>
                )}
            </div>
            {leadsError ? (
                <div className="container pipeline-page-container">
                    <ErrorBanner
                        message="Não foi possível carregar os leads do funil."
                        onRetry={() => void fetchLeads({ reset: true })}
                    />
                </div>
            ) : null}

            {!isMobile && showKanbanInitialLoading ? (
                <div className="pipeline-kanban-loading-hint" role="status">
                    Carregando funil…
                </div>
            ) : null}

            {isMobile ? (
                <MobileLeadList
                    stages={showKanbanInitialLoading ? kanbanLoadingStages : displayStages}
                    leadsForBoard={leadsForBoard}
                    enrolledForBoard={enrolledForBoard}
                    originFilter={originFilter}
                    navigate={navigate}
                    onOpenLeadProfile={openLeadProfile}
                    mapLeadToStageId={mapLeadToStageId}
                    displayStageIds={displayStageIds}
                    handleWaCardClick={handleWaCardClick}
                    emptyStageHint={`Nenhum ${singular(labels.leads).toLowerCase()} nesta etapa`}
                    showLoading={showKanbanInitialLoading}
                    moveToStatus={moveToStatus}
                />
            ) : (
            <div className="pipeline-desktop-kanban-host">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={clearDragUiState}
            >
                <div
                    ref={kanbanWrapperRef}
                    className="kanban-wrapper"
                    onDragOverCapture={showKanbanInitialLoading ? undefined : onKanbanWrapperDragOverCapture}
                    aria-busy={showKanbanInitialLoading || undefined}
                    aria-label={showKanbanInitialLoading ? 'Carregando funil' : undefined}
                >
                    {kanbanLoadingStages.map((col, idx) => {
                        const color = getPipelineStageColor(col.id, idx);
                        if (showKanbanInitialLoading) {
                            return (
                                <div key={col.id} className="kanban-column pipeline-kanban-skeleton-col">
                                    <div className="col-header">
                                        <div className="col-header-titles">
                                            <div className="flex items-center gap-2">
                                                <span className="col-dot" style={{ background: color.color }} />
                                                <h3 className="navi-section-heading pipeline-col-heading">{col.label}</h3>
                                            </div>
                                        </div>
                                        <span className="pipeline-kanban-skeleton-count" aria-hidden />
                                    </div>
                                    <div className="col-content">
                                        <div className="pipeline-kanban-skeleton-card" />
                                        <div className="pipeline-kanban-skeleton-card pipeline-kanban-skeleton-card--short" />
                                        <div className="pipeline-kanban-skeleton-card" />
                                    </div>
                                </div>
                            );
                        }

                        const isEnrolledCol = normalizePipelineStageId(col.id) === ENROLLED_PIPELINE_STAGE_ID;
                        const colLeads = (isEnrolledCol ? enrolledForBoard : leadsForBoard
                            .filter((l) => leadBelongsInPipelineColumn(l, col.id, mapLeadToStageId, displayStageIds)))
                            .filter(l => originFilter === 'all' ? true : boardContactOrigin(l) === originFilter)
                            .sort((a, b) => comparePipelineColLeads(a, b, isEnrolledCol));

                        return (
                            <Column
                                key={col.id}
                                id={col.id}
                                col={col}
                                color={color}
                                isOver={dragOver === col.id}
                                isDragActive={Boolean(activeId)}
                                hasOverlayOpen={colLeads.some((l) => l.id === openMenuId || l.id === scheduleModalLead?.id || l.id === moverOpenId)}
                                leads={colLeads}
                            >
                                {(scrollElement) => (
                                    <>
                                <SortableContext items={colLeads.map(l => l.id)} strategy={verticalListSortingStrategy}>
                                    <PipelineColumnLeads
                                        scrollElement={scrollElement}
                                        pageScrollElement={pageScrollEl}
                                        leads={colLeads}
                                        savingLeadIds={savingLeadIds}
                                        movingLeadIds={movingLeadIds}
                                        slaAlerts={slaAlerts}
                                        followupTempByLead={followupTempByLead}
                                        cardProps={cardProps}
                                        pipelineStageId={col.id}
                                        pipelineStageColorIndex={idx}
                                        showInsertSlots={Boolean(activeId) && dragOver === col.id}
                                        insertOverId={dragOver === col.id ? dragInsertOverId : null}
                                        disableVirtualization={Boolean(activeId)}
                                    />
                                </SortableContext>

                                {colLeads.length === 0 && (() => {
                                    const scopeLabel = searchStageScopeOptions.find((o) => o.value === searchStageScope)?.label || '';
                                    const hasSearchQuery = Boolean(String(kanbanSearch || '').trim() || normalizeKanbanPhone(kanbanSearch));
                                    const inStageScope = searchStageScope === 'all' || col.id === searchStageScope;
                                    const isEnrollmentDropCol = isEnrolledCol;
                                    let hint = 'Arraste um card de outra coluna ou use “Novo” no menu para cadastrar.';
                                    let emptyTitle = `Nenhum ${singular(labels.leads).toLowerCase()} nesta etapa`;
                                    if (isEnrollmentDropCol && searchStageScope === 'all' && !hasSearchQuery) {
                                        emptyTitle = 'Nenhuma matrícula ainda';
                                        hint =
                                            'Arraste um contato de outra coluna para matricular. Os alunos matriculados aparecem aqui após a confirmação.';
                                    } else if (searchStageScope !== 'all' && col.id !== searchStageScope) {
                                        hint = `“Buscar em” está em “${scopeLabel}”. Troque para “Todas as etapas” para ver todas as colunas.`;
                                    } else if (hasSearchQuery && inStageScope) {
                                        hint = 'Nenhum resultado para nome ou telefone. Ajuste a busca ou a etapa em “Buscar em”.';
                                    }
                                    return (
                                        <EmptyState
                                            variant="column"
                                            tone="dashed"
                                            title={emptyTitle}
                                            description={hint}
                                            role="none"
                                        />
                                    );
                                })()}
                                    </>
                                )}
                            </Column>
                        );
                    })}
                </div>

                <DragOverlay dropAnimation={dropAnimation}>
                    {activeId ? (
                        <LeadCard
                            lead={getLeadById(activeId)}
                            slaAlert={slaAlerts[activeId]}
                            followupTemperature={followupTempByLead[activeId]}
                            isOverlay
                            navigate={navigate}
                            openNote={openNote}
                            openMenuId={openMenuId}
                            scheduleModalLeadId={scheduleModalLead?.id ?? null}
                            moverOpenId={moverOpenId}
                            setOpenMenuId={setOpenMenuId}
                            setWaDropdownOpenId={setWaDropdownOpenId}
                            handleWaCardClick={handleWaCardClick}
                            waDropdownOpenId={waDropdownOpenId}
                            templateSendKeys={templateSendKeys}
                            sendTemplateFromPipeline={sendTemplateFromPipeline}
                            stages={displayStages}
                            moveToStatus={moveToStatus}
                            handleCopyPhone={handleCopyPhone}
                            copiedId={copiedId}
                            handleMarkAsLost={handleMarkAsLost}
                            handleDeleteLead={handleDeleteLead}
                            canDeleteLead={canDeleteLead}
                            onOpenScheduleModal={setScheduleModalLead}
                            onCloseSale={(lead) => openMatriculaModal(lead, { paymentShortcut: true })}
                            onOpenMatricula={openMatriculaModal}
                            handleConfirmPresence={handleConfirmPresence}
                            setMissedModalLead={setMissedModalLead}
                            openMover={openMover}
                            setDragTargetLead={setDragTargetLead}
                            mapLeadToStageId={mapLeadToStageId}
                            pipelineStageId={mapLeadToStageId(getLeadById(activeId))}
                            pipelineMenuTrialLc={terms.trial.toLowerCase()}
                            pipelineMenuAttendanceLc={terms.attendance.toLowerCase()}
                            pipelineMenuEnrollment={terms.enrollment}
                        />
                    ) : null}
                </DragOverlay>
            </DndContext>
            </div>
            )}

            <Suspense fallback={null}>
            {matriculaModalOpen ? (
            <MatriculaModal
                isOpen={matriculaModalOpen}
                lead={dragTargetLead}
                leadId={dragTargetLead?.id || ''}
                academyId={academyId}
                userId={userId}
                teamId={teamId}
                initialStep={matriculaInitialStep}
                paymentEnabled={modules?.finance === true}
                showContractPrompt={modules?.finance === true}
                enrollmentQuestions={enrollmentQuestions}
                financeConfig={financeConfig}
                submitting={matriculaSubmitting}
                onClose={() => {
                    if (matriculaSubmitting) return;
                    setMatriculaModalOpen(false);
                    setDragTargetLead(null);
                    setMatriculaInitialStep('choose');
                }}
                onSendContract={(id) => {
                    setMatriculaModalOpen(false);
                    setDragTargetLead(null);
                    setMatriculaInitialStep('choose');
                    setPostMatriculaContractLeadId(id);
                    setPostMatriculaContractOpen(true);
                }}
                onSkipAfterEnroll={(studentId) => {
                    setMatriculaModalOpen(false);
                    setDragTargetLead(null);
                    setMatriculaInitialStep('choose');
                    if (studentId) navigate(`/student/${studentId}?edit=enrollment`);
                }}
                onPaymentRegistered={(doc) => {
                    if (doc?.warning) {
                        toast.show({
                            type: 'warning',
                            message: String(doc.warning || '').trim() || 'Pagamento registrado, mas houve um problema ao atualizar o caixa.',
                            duration: 10000,
                        });
                    } else {
                        toast.show({ type: 'success', message: 'Pagamento registrado.' });
                    }
                }}
                onEnroll={async ({ plan, enrollmentDate, answers }) => {
                    if (!dragTargetLead) return;
                    setMatriculaSubmitting(true);
                    try {
                        await executeMatricula(dragTargetLead, answers, plan, enrollmentDate);
                    } finally {
                        setMatriculaSubmitting(false);
                    }
                }}
            />
            ) : null}

            {scheduleModalLead ? (
            <ScheduleModal
                open={scheduleModalLead !== null}
                onClose={() => setScheduleModalLead(null)}
                onConfirm={onConfirmSchedulePipeline}
                lead={scheduleModalLead}
                quickTimes={pipelineQuickTimes}
                initialDate={scheduleModalLead?.scheduledDate || ''}
                initialTime={scheduleModalLead?.scheduledTime || ''}
            />
            ) : null}

            {lostModal ? (
                <LostReasonModal
                    leadName={lostModal.leadName}
                    onCancel={() => setLostModal(null)}
                    onConfirm={async (reason) => {
                        try {
                            await lostModal.onConfirm(reason);
                        } catch (err) {
                            toast.show({ type: 'error', message: err?.message || 'Erro ao salvar' });
                        } finally {
                            setLostModal(null);
                        }
                    }}
                />
            ) : null}

            {showImport ? (
            <ImportSheet
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onImport={handleImport}
                defaultStatus={LEAD_STATUS.NEW}
                title={`Importar ${labels.leads}`}
                financeConfig={financeConfig}
            />
            ) : null}

            {postMatriculaContractOpen ? (
            <CreateContractModal
                open={postMatriculaContractOpen}
                leadId={postMatriculaContractLeadId || undefined}
                onClose={() => {
                    setPostMatriculaContractOpen(false);
                    setPostMatriculaContractLeadId(null);
                }}
                onSuccess={() => {
                    setPostMatriculaContractOpen(false);
                    setPostMatriculaContractLeadId(null);
                }}
            />
            ) : null}

            {missedModalLead && (
                <div className="note-overlay" onClick={() => setMissedModalLead(null)}>
                    <div className="note-modal mini-modal" onClick={(e) => e.stopPropagation()}>
                        <h4 className="navi-section-heading pipeline-missed-modal-heading">Por que não compareceu?</h4>
                        <div className="reason-grid">
                            {[
                                'Esqueceu',
                                'Imprevisto pessoal',
                                'Problema de saúde',
                                'Não avisou',
                                'Vai remarcar',
                                'Outro'
                            ].map(reason => (
                                <button
                                    key={reason}
                                    className="reason-chip"
                                    onClick={() => handleMissedWithReason(missedModalLead, reason)}
                                >
                                    {reason}
                                </button>
                            ))}
                        </div>
                        <div className="note-footer pipeline-missed-modal-footer">
                            <button type="button" className="btn-ghost pipeline-missed-cancel-btn" onClick={() => setMissedModalLead(null)}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {lostModalLead && (
                <LostReasonModal
                    isOpen={!!lostModalLead}
                    leadName={lostModalLead?.name || contactLabel}
                    onClose={() => setLostModalLead(null)}
                    onConfirm={async (reason) => {
                        const cur = lostModalLead;
                        try {
                            await addLeadEvent({
                                academyId,
                                leadId: cur.id,
                                type: 'lost',
                                from: cur?.status || '',
                                to: LEAD_STATUS.LOST,
                                text: String(reason || '').slice(0, 1000),
                                createdBy: userId || 'user',
                                permissionContext: permCtx
                            });
                            await updateLead(cur.id, {
                                status: LEAD_STATUS.LOST,
                                scheduledDate: '',
                                scheduledTime: '',
                                pipelineStage: LEAD_STATUS.LOST,
                                lostReason: reason,
                                lostAt: new Date().toISOString()
                            });
                            toast.success('Marcado como perdido');
                        } catch (e) {
                            console.error(e);
                        }
                        setLostModalLead(null);
                    }}
                />
            )}

            {confirmModal && (
                <div className="note-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="note-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="navi-section-heading pipeline-note-modal-heading">{confirmModal.title}</h3>
                        <p className="text-small pipeline-note-modal-desc">{confirmModal.description}</p>
                        <div className="note-footer">
                            <button className="btn-outline" onClick={() => setConfirmModal(null)}>Cancelar</button>
                            <button className="btn-secondary" onClick={() => void confirmModal.onConfirm?.()}>{confirmModal.confirmLabel || 'Confirmar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {linkStudentLead ? (
            <LinkStudentModal
                open={Boolean(linkStudentLead)}
                lead={linkStudentLead}
                students={students}
                studentsLoading={studentsLoading}
                saving={linkStudentSaving}
                onClose={() => {
                    if (linkStudentSaving) return;
                    setLinkStudentLead(null);
                }}
                onConfirm={handleLinkStudentConfirm}
            />
            ) : null}
            </Suspense>
            {noteOpen && (
                <div className="note-overlay" onClick={() => setNoteOpen(false)}>
                    <div className="note-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="navi-section-heading pipeline-note-modal-heading">Adicionar observação</h3>
                        <textarea
                            className="note-textarea"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Ex.: Ligação realizada, reagendado para quinta às 19:00"
                        />
                        {noteError ? <p className="text-small pipeline-note-error">{noteError}</p> : null}
                        <div className="note-footer">
                            <button className="btn-outline" onClick={() => setNoteOpen(false)}>Cancelar</button>
                            <button className="btn-secondary" onClick={saveNote} disabled={!String(noteText || '').trim()}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Pipeline;
