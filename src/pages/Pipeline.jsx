import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { addLeadEvent } from '../lib/leadEvents.js';
import { useLeadStore, LEAD_STATUS, LEAD_ORIGIN } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { useToast } from '../hooks/useToast';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Calendar, Phone, Upload, MessageCircle, ChevronRight, SlidersHorizontal, PlusCircle, StickyNote, GraduationCap, BadgeCheck, MoreHorizontal, Download, Trash2 } from 'lucide-react';
import SearchField from '../components/shared/SearchField.jsx';
import FilterBar from '../components/shared/FilterBar.jsx';
import LeadCloseSaleModal from '../components/sales/LeadCloseSaleModal.jsx';
import { canShowPipelineCloseSale } from '../lib/leadCloseSale.js';
import ImportSheet from '../components/ImportSheet';
import { exportLeadsSpreadsheet } from '../lib/exportLeadsSpreadsheet.js';
import { LostReasonModal } from '../components/LostReasonModal';
import MatriculaModal from '../components/MatriculaModal';
import CreateContractModal from '../components/contracts/CreateContractModal.jsx';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_LABELS } from '../../lib/whatsappTemplateDefaults.js';
import { isCriancaProfileType } from '../../lib/leadTypeNormalize.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';
import { isInactiveStudent } from '../lib/studentStatus.js';
import { getStageUpdatePayload } from '../lib/leadStageRules.js';
import { friendlyError } from '../lib/errorMessages.js';
import { performEnrollment } from '../lib/performEnrollment.js';
import { preloadLeadProfile } from '../lib/preloadRoutes.js';
import { useCustomLeadQuestions } from '../hooks/useCustomLeadQuestions.js';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import ScheduleModal from '../components/ScheduleModal.jsx';
import { getAcademyQuickTimeChipValues } from '../lib/academyQuickTimes.js';
import { buildSchedulePatch } from '../lib/scheduleHelpers.js';
import { useSlaAlerts } from '../lib/useSlaAlerts.js';
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
import { getLeadAutomationBadges, notifyAutomationFeedback } from '../lib/automationUx.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import Hint from '../components/shared/Hint.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { hintForPipelineStage } from '../lib/pipelineStageHints.js';
import { getPipelineStageColor } from '../lib/pipelineStageColors.js';
import { partitionLeadAttributePills } from '../lib/pipelineLeadPills.js';
import PipelineAdvancedFilters from '../components/pipeline/PipelineAdvancedFilters.jsx';
import {
    DropdownMenu,
    DropdownMenuPanel,
    DropdownMenuItem,
    DropdownMenuDivider,
} from '../components/shared/menu';

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
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const dropAnimationConfig = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.4',
            },
        },
    }),
};

/**
 * Card puramente visual para ser usado tanto no grid quanto no Overlay.
 */
const LeadCard = React.memo(({ lead, slaAlert, automationConfig, isDragging, isOverlay, isMoving, navigate, openMenuId, scheduleModalLeadId, moverOpenId, setOpenMenuId, setWaDropdownOpenId, handleSplitWaMain, toggleWaDropdown, waDropdownOpenId, templateSendKeys, sendTemplateFromPipeline, stages, moveToStatus, handleCopyPhone, copiedId, handleMarkAsLost, handleDeleteLead, canDeleteLead, onOpenScheduleModal, onCloseSale, handleConfirmPresence, setMissedModalLead, setMatriculaModalOpen, openMover, setDragTargetLead, mapLeadToStageId, openNote, pipelineMenuTrialLc, pipelineMenuAttendanceLc, pipelineMenuEnrollment, ...props }) => {
    const isCardOverlayOpen = openMenuId === lead.id || scheduleModalLeadId === lead.id || moverOpenId === lead.id;
    const automationBadges = useMemo(
        () => getLeadAutomationBadges(lead, automationConfig),
        [lead, automationConfig]
    );
    const { visible: attrPills, hiddenCount: hiddenAttrPillCount } = useMemo(
        () => partitionLeadAttributePills(lead),
        [lead]
    );
    const slaClass =
        slaAlert?.urgency === 'critical'
            ? 'lead-card--sla-critical'
            : slaAlert?.urgency === 'warning'
              ? 'lead-card--sla-warning'
              : '';
    return (
        <div
            className={`card lead-card ${slaClass} ${isDragging ? 'lead-card--dragging' : ''} ${isOverlay ? 'lead-card--overlay' : ''} ${isMoving ? 'lead-card--moving' : ''} ${isCardOverlayOpen ? 'lead-card--menu-open' : ''} animate-in`}
            style={{
                zIndex: isCardOverlayOpen ? 5000 : 1,
                opacity: isMoving ? 0.7 : undefined,
                cursor: isMoving ? 'wait' : undefined,
                ...props.style
            }}
            onMouseEnter={() => { void preloadLeadProfile(); }}
            onClick={() => !isOverlay && navigate(`/lead/${lead.id}`)}
            {...props}
        >
            {slaAlert ? (
                <span
                    className="lead-sla-badge"
                    style={{
                        background: slaAlert.urgency === 'critical' ? 'var(--danger-light)' : 'var(--warning-light)',
                        color: slaAlert.urgency === 'critical' ? 'var(--danger)' : '#b45309',
                    }}
                    title={`Há ${slaAlert.daysInStage} dia(s) nesta etapa (SLA ${slaAlert.slaDays}d)`}
                >
                    {`${slaAlert.daysInStage}d`}
                </span>
            ) : null}
            <div className="lead-card-title-row lead-card-title-row--name-only">
                <span className="lead-card-name" title={String(lead.name || '').trim() || undefined}>
                    {lead.name}
                </span>
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
            {lead.scheduledDate && (
                <div className="lead-meta mt-1 flex items-center gap-2">
                    <Calendar size={12} /> {new Date(lead.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')} {lead.scheduledTime && `às ${lead.scheduledTime}`}
                </div>
            )}
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
            {lead.status === LEAD_STATUS.LOST && lead.lostReason ? (
                <div className="lead-meta mt-1">
                    <span
                        style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            background: 'var(--surface-hover)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            display: 'inline-block',
                        }}
                    >
                        {lead.lostReason}
                    </span>
                </div>
            ) : null}
            <div className="action-bar action-bar--reorganized mt-3">
                <div className="wa-split-btn" data-no-dnd="true">
                    <button
                        type="button"
                        className="wa-main-btn"
                        onClick={(e) => handleSplitWaMain(e, lead)}
                        title="Conversar no WhatsApp"
                        aria-label="Conversar no WhatsApp"
                    >
                        <MessageCircle size={16} aria-hidden />
                    </button>
                    <button
                        type="button"
                        className="wa-drop-toggle"
                        onClick={(e) => toggleWaDropdown(e, lead.id)}
                        title="Templates"
                    >
                        <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                    </button>
                    {waDropdownOpenId === lead.id && (
                        <div className="navi-menu__panel wa-templates-dropdown" onClick={(e) => e.stopPropagation()}>
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
                        </div>
                    )}
                </div>

                <div style={{ position: 'relative', zIndex: openMenuId === lead.id ? 5100 : 1 }} data-no-dnd="true">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === lead.id ? null : lead.id);
                            setWaDropdownOpenId(null);
                        }}
                        title="Mais ações"
                        aria-label="Mais ações"
                        className="action-btn navi-menu-trigger--icon"
                    >
                        <MoreHorizontal size={16} aria-hidden />
                    </button>
                    {openMenuId === lead.id && (
                        <div className="navi-menu__panel navi-menu--elevated action-menu-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="menu-group">
                                {canShowPipelineCloseSale(lead) ? (
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
                                {lead.pipelineStage === 'Aula experimental' && (
                                    <button type="button" className="navi-menu__item navi-menu__item--success" onClick={(e) => handleConfirmPresence(e, lead)}>
                                        <PlusCircle size={16} /> Confirmar {pipelineMenuAttendanceLc}
                                    </button>
                                )}
                                {lead.pipelineStage === 'Aula experimental' && (
                                    <button type="button" className="navi-menu__item navi-menu__item--warning" onClick={(e) => { e.stopPropagation(); setMissedModalLead(lead); setOpenMenuId(null); }}>
                                        <Calendar size={16} /> Não compareceu
                                    </button>
                                )}
                                {['Aguardando decisão', 'Protocolo', 'Matriculado'].includes(lead.pipelineStage) && (
                                    <button type="button" className="navi-menu__item navi-menu__item--primary" onClick={(e) => { e.stopPropagation(); setDragTargetLead(lead); setMatriculaModalOpen(true); setOpenMenuId(null); }}>
                                        <GraduationCap size={16} /> {pipelineMenuEnrollment}
                                    </button>
                                )}
                                <button type="button" className="navi-menu__item" onClick={(e) => openMover(e, lead.id)}>
                                    <ChevronRight size={16} /> Mover para etapa
                                </button>
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
                                <button type="button" className="navi-menu__item navi-menu__item--danger" onClick={(e) => handleMarkAsLost(e, lead)}>
                                    <MessageCircle size={16} /> Marcar como perdido
                                </button>
                                {canDeleteLead ? (
                                    <button type="button" className="navi-menu__item navi-menu__item--danger" onClick={(e) => handleDeleteLead(e, lead.id)}>
                                        <Trash2 size={16} className="text-danger" /> Excluir lead
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {moverOpenId === lead.id && (
                <div className="navi-menu__panel dropdown-panel navi-menu--elevated" onClick={(e) => e.stopPropagation()} data-no-dnd="true">
                    {stages.map(s => {
                        const active = (mapLeadToStageId(lead) === s.id);
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
                </div>
            )}
        </div>
    );
});

const SortableLeadCard = ({ lead, ...props }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: lead.id, data: { lead } });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="lead-card--placeholder"
            />
        );
    }

    return (
        <LeadCard
            ref={setNodeRef}
            lead={lead}
            style={style}
            {...attributes}
            {...listeners}
            {...props}
        />
    );
};

const PIPELINE_VIRTUAL_THRESHOLD = 20;

function PipelineColumnLeads({ scrollRef, leads, cardProps, savingLeadIds, movingLeadIds, slaAlerts }) {
    const shouldVirtualize = leads.length > PIPELINE_VIRTUAL_THRESHOLD;
    const virtualizer = useVirtualizer({
        count: shouldVirtualize ? leads.length : 0,
        getScrollElement: () => scrollRef?.current ?? null,
        estimateSize: () => 112,
        gap: 8,
        overscan: 4,
    });

    const renderLead = (lead) => (
        <SortableLeadCard
            key={lead.id}
            lead={lead}
            isMoving={savingLeadIds.has(lead.id) || movingLeadIds.has(lead.id)}
            slaAlert={slaAlerts[lead.id]}
            {...cardProps}
        />
    );

    if (!shouldVirtualize) {
        return leads.map((lead) => renderLead(lead));
    }

    return (
        <div
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
}

const Column = ({ id, col, color, leads, isOver, hasOverlayOpen, children }) => {
    const scrollRef = useRef(null);
    const { setNodeRef } = useDroppable({ id });
    const setColumnRef = useCallback((node) => {
        setNodeRef(node);
        scrollRef.current = node;
    }, [setNodeRef]);

    return (
        <div
            ref={setColumnRef}
            className={`kanban-column ${isOver ? 'kanban-col--drag-over' : ''} ${hasOverlayOpen ? 'kanban-column--overlay-open' : ''}`}
        >
            <div className="col-header">
                <div className="col-header-titles">
                    <div className="flex items-center gap-2">
                        <span className="col-dot" style={{ background: color.color }} />
                        <h3 className="navi-section-heading pipeline-col-heading">{col.label}</h3>
                        <Hint text={hintForPipelineStage(col.id, col.label)} position="top" />
                    </div>
                </div>
                <span className="col-count" style={{ background: color.bg, color: color.color }}>
                    {leads.length}
                </span>
            </div>
            <div className="col-content">
                {typeof children === 'function' ? children(scrollRef) : children}
            </div>
        </div>
    );
};


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

const leadIsPipelineFunnel = (lead) => String(lead?.origin || '').trim() !== 'Planilha';

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
 * Vista lista agrupada por etapa (mobile). Não altera filtros nem store.
 */
const MobileLeadList = React.memo(function MobileLeadList({
    stages,
    leadsForBoard,
    originFilter,
    navigate,
    mapLeadToStageId,
    handleSplitWaMain,
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
                <div className="pipeline-kanban-loading-hint" role="status" style={{ padding: '8px 0 0' }}>
                    Carregando leads do funil…
                </div>
            ) : null}
            {stages.map((stage, idx) => {
                const stageLeads = leadsForBoard
                    .filter((l) => mapLeadToStageId(l) === stage.id)
                    .filter((l) => (originFilter === 'all' ? true : (l.origin || '') === originFilter))
                    .sort((a, b) => mobileListToDateTime(a) - mobileListToDateTime(b));
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
                                    <div style={{ padding: '8px 12px 12px' }}>
                                        <EmptyState variant="compact" tone="dashed" title={emptyStageHint} role="none" />
                                    </div>
                                ) : (
                                    stageLeads.map((lead, li) => {
                                        const currentStageId = mapLeadToStageId(lead) || '';
                                        const moveOpen = mobileMoveLeadId === lead.id;
                                        return (
                                        <div
                                            key={lead.id}
                                            className="pipeline-mobile-lead-item"
                                            style={{
                                                borderBottom: li < stageLeads.length - 1 ? '0.5px solid var(--border-light)' : 'none',
                                            }}
                                        >
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            className="pipeline-mobile-lead-row"
                                            onMouseEnter={() => { void preloadLeadProfile(); }}
                                            onClick={() => navigate(`/lead/${lead.id}`)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    navigate(`/lead/${lead.id}`);
                                                }
                                            }}
                                        >
                                            <div className="pipeline-mobile-lead-main">
                                                <div className="pipeline-mobile-lead-name">
                                                    {lead.name}
                                                </div>
                                                <div className="pipeline-mobile-lead-phone">
                                                    {lead.phone || '—'}
                                                </div>
                                                {lead.scheduledDate ? (
                                                    <span className="pipeline-mobile-schedule-badge">
                                                        {`${formatMobileListScheduleDate(lead.scheduledDate)}${lead.scheduledTime ? ` às ${lead.scheduledTime}` : ''}`}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="pipeline-mobile-lead-actions">
                                                <button
                                                    type="button"
                                                    title="WhatsApp"
                                                    className="pipeline-mobile-wa-btn"
                                                    onClick={(e) => handleSplitWaMain(e, lead)}
                                                >
                                                    <MessageCircle size={16} aria-hidden />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Abrir perfil do lead"
                                                    className="pipeline-mobile-profile-link"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/lead/${lead.id}`);
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
                                                    className="btn btn-outline btn-sm"
                                                    style={{ flexShrink: 0, minHeight: 44, fontSize: 12, boxSizing: 'border-box' }}
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
                                                            className="btn btn-primary btn-sm"
                                                            style={{ flexShrink: 0, minHeight: 44, boxSizing: 'border-box' }}
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
    const leads = useLeadStore((s) => s.leads);
    const importLeads = useLeadStore((s) => s.importLeads);
    const updateLead = useLeadStore((s) => s.updateLead);
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

    const patchLeadLocal = useCallback((leadId, patch) => {
        useLeadStore.setState((state) => ({
            leads: state.leads.map((l) => (l.id === leadId ? { ...l, ...patch } : l)),
        }));
    }, []);

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
        useLeadStore.setState({ leads: previousLeads });
    }, []);
    const leadsLoading = useLeadStore((s) => s.loading);
    const leadsHasMore = useLeadStore((s) => s.leadsHasMore);
    const loadingMore = useLeadStore((s) => s.loadingMore);
    const getLeadById = useLeadStore((s) => s.getLeadById);
    const kanbanWrapperRef = useRef(null);
    const dragScrollRafRef = useRef(null);
    const lastDragClientXRef = useRef(null);
    const [showImport, setShowImport] = useState(false);
    const [pipelineQuickTimes, setPipelineQuickTimes] = useState([]);
    const [movingLeadIds, setMovingLeadIds] = useState(() => new Set());
    const [savingLeadIds, setSavingLeadIds] = useState(() => new Set());
    const [scheduleModalLead, setScheduleModalLead] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteLead, setNoteLead] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [moverOpenId, setMoverOpenId] = useState(null);
    const [lostModal, setLostModal] = useState(null);
    const [stages, setStages] = useState(() =>
        buildDefaultStages(TERMS[useLeadStore.getState().vertical] || TERMS.fitness)
    );
    /** Rótulo curto da coluna (fitness = «Experimental» como antes; physio = trialShort). */
    const displayStages = useMemo(
        () =>
            stages.map((s) =>
                String(s?.id || '').trim() === 'Aula experimental' ? { ...s, label: terms.trialShort } : s
            ),
        [stages, terms.trialShort]
    );
    const [editStages, setEditStages] = useState(false);
    const [tempStages, setTempStages] = useState(() =>
        buildDefaultStages(TERMS[useLeadStore.getState().vertical] || TERMS.fitness)
    );
    const [originFilter, setOriginFilter] = useState('all'); // all | origin
    const [searchParams] = useSearchParams();
    const followupKanbanFilter = searchParams.get('followup') === 'kanban';
    const [kanbanSearch, setKanbanSearch] = useState('');
    const [profileFilter, setProfileFilter] = useState('all'); // all | Adulto | Criança | Juniores
    const [searchStageScope, setSearchStageScope] = useState('all');
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
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [quickFilter, setQuickFilter] = useState(null);
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
    const [closeSaleLead, setCloseSaleLead] = useState(null);
    const modules = useLeadStore((s) => s.modules);
    const { questions: enrollmentQuestions } = useCustomLeadQuestions(academyId);
    const [noteError, setNoteError] = useState('');
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1023);
    const [nlOpen, setNlOpen] = useState(false);
    const [filtersMenuOpen, setFiltersMenuOpen] = useState(false);
    const [pageActionsMenuOpen, setPageActionsMenuOpen] = useState(false);
    const hiddenAtRef = useRef(null);

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
            // Não ativar se clicar em elementos marcadores com data-no-dnd
            onActivation: ({ event }) => {
                if (event.target.closest('[data-no-dnd]')) {
                    return false;
                }
            }
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
        const handleClickOutside = () => {
            setOpenMenuId(null);
            setWaDropdownOpenId(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth <= 1023);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

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
        useLeadStore.getState().fetchLeads({ reset: true });
    }, [academyId]);

    useEffect(() => {
        const mainEl = document.querySelector('.main-content');
        if (mainEl) {
            mainEl.classList.add('pipeline-active');
            mainEl.scrollTop = 0;
            requestAnimationFrame(() => {
                try {
                    mainEl.scrollTop = 0;
                } catch {
                    void 0;
                }
            });
        }
        return () => {
            if (mainEl) mainEl.classList.remove('pipeline-active');
        };
    }, []);

    const handleLoadMoreLeads = async () => {
        if (loadingMore || leadsLoading || !leadsHasMore) return;
        await fetchMoreLeads();
    };

    const handleImport = (rows) => {
        importLeads(rows);
    };
    const singular = (plural) => {
        if (!plural) return contactLabel;
        const p = String(plural).trim();
        if (p.toLowerCase().endsWith('s') && p.length > 1) return p.slice(0, -1);
        return p;
    };

    useEffect(() => {
        if (!academyId) return;
        const ensureSpecialColumns = (cols) => {
            const base = Array.isArray(cols) ? cols.filter(Boolean) : [];
            const ids = new Set(base.map((c) => String(c?.id || '').trim()).filter(Boolean));
            const out = [...base];
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
        const finalizeStages = (cols) => applyMatriculadoLabel(ensureSpecialColumns(mergeWaitingDecisionStage(cols)));
        databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then(doc => {
                setAcademySettingsRaw(doc?.settings ?? null);
                setPipelineQuickTimes(getAcademyQuickTimeChipValues(doc));
                try {
                    if (doc.stagesConfig) {
                        const conf = typeof doc.stagesConfig === 'string' ? JSON.parse(doc.stagesConfig) : doc.stagesConfig;
                        if (Array.isArray(conf) && conf.length > 0) {
                            const normalized = finalizeStages(conf);
                            setStages(normalized);
                            setTempStages(normalized);
                        } else {
                            const normalized = finalizeStages(buildDefaultStages(terms));
                            setStages(normalized);
                            setTempStages(normalized);
                        }
                    } else {
                        const normalized = finalizeStages(buildDefaultStages(terms));
                        setStages(normalized);
                        setTempStages(normalized);
                    }
                } catch {
                    const normalized = finalizeStages(buildDefaultStages(terms));
                    setStages(normalized);
                    setTempStages(normalized);
                }
            })
            .catch(() => {
                setAcademyAutomationsRaw('');
                setPipelineQuickTimes(getAcademyQuickTimeChipValues(null));
                toast.show({ type: 'error', message: 'Não foi possível carregar configurações do funil.' });
            });
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

    const handleWhatsApp = useCallback((e, lead) => {
        e.stopPropagation();
        const digits = normalizeKanbanPhone(lead?.phone);
        if (!digits) {
            toast.show({ type: 'error', message: `${contactLabel} sem telefone cadastrado` });
            return;
        }
        navigate(`/inbox?phone=${encodeURIComponent(digits)}`);
    }, [navigate, contactLabel, toast]);

    const handleReschedule = async (lead, ymd, time, note) => {
        const patch = buildSchedulePatch(lead, { date: ymd, time });
        const textBody = String(note || '').trim() || `${terms.trial} agendada`;
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
            await updateLead(lead.id, patch);
        } catch {
            await updateLead(lead.id, patch);
        }
        const autoResult = await afterExperimentalScheduled({
            lead: { ...lead, ...patch },
            ymd,
            time,
            ...automationCtxBase(),
            getLead: () => getLeadById(lead.id) || { ...lead, ...patch },
        }).catch(() => null);
        if (autoResult) reportAutomations(autoResult);
        toast.success(`Reagendado para ${ymd} ${time}`);
    };

    const onConfirmSchedulePipeline = async ({ date, time, note }) => {
        if (!scheduleModalLead) return;
        await handleReschedule(scheduleModalLead, date, time, note);
    };

    const openMover = useCallback((e, leadId) => {
        e.stopPropagation();
        setMoverOpenId(prev => prev === leadId ? null : leadId);
    }, []);
    const openLostModal = (leadId, onConfirm) => {
        const lead = getLeadById(leadId);
        setLostModal({ leadId, leadName: lead?.name || contactLabel, onConfirm });
    };
    const handleConfirmPresence = useCallback(async (e, lead) => {
        e.stopPropagation();
        try {
            await updateLead(lead.id, {
                status: LEAD_STATUS.COMPLETED,
                pipelineStage: PIPELINE_WAITING_DECISION_STAGE,
                attendedAt: new Date().toISOString(),
                statusChangedAt: new Date().toISOString()
            });
            const autoResult = await afterPresenceConfirmed({
                lead: { ...lead, status: LEAD_STATUS.COMPLETED, pipelineStage: PIPELINE_WAITING_DECISION_STAGE },
                ...automationCtxBase(),
                getLead: () => getLeadById(lead.id) || lead,
            }).catch(() => null);
            if (autoResult) reportAutomations(autoResult);
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
    }, [updateLead, academyId, automationCtxBase, reportAutomations, userId, permCtx, terms.attendance, toast]);

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
            const autoResult = await afterMissed({
                lead: { ...lead, status: LEAD_STATUS.MISSED, pipelineStage: LEAD_STATUS.MISSED },
                ...automationCtxBase(),
            }).catch(() => null);
            if (autoResult) reportAutomations(autoResult);
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

    const executeMatricula = async (lead, customAnswers = {}, plan = '') => {
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
                academySettingsRaw,
                waAutomation: { waOutbound, academyRaw: academyAutomationsRaw },
                onToast: (msg) => {
                    extraToast = msg;
                },
            });
            toast.show({
                type: 'success',
                message: terms.pipelineEnrollmentSuccessToast + (extraToast ? ` ${extraToast}` : ''),
            });
        } catch (err) {
            toast.error(err, 'action');
            throw err;
        }
    };

    const saveStages = async () => {
        try {
            const cleaned = tempStages
                .filter(s => s && String(s.id).trim())
                .map((s) => ({
                    id: String(s.id).trim(),
                    label: String(s.label || s.id).trim(),
                    slaDays: Number.isFinite(s.slaDays) ? s.slaDays : DEFAULT_STAGE_SLA_DAYS,
                }));
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                stagesConfig: JSON.stringify(cleaned),
            });
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
    const mapLeadToStageId = useCallback((lead) => {
        if (lead?.status === LEAD_STATUS.MISSED) return LEAD_STATUS.MISSED;
        if (lead?.status === LEAD_STATUS.LOST) return LEAD_STATUS.LOST;
        if (lead?.status === LEAD_STATUS.CONVERTED) return 'Matriculado';

        const stageFromStatusOnly = (l) => {
            const hasDirect = stages.find((s) => s.id === l.status);
            if (hasDirect) return l.status;
            const s = (l.status || '').toLowerCase();
            if (s === (LEAD_STATUS.NEW || '').toLowerCase() || s === 'novo') return 'Novo';
            if (s.includes('agendado')) return 'Aula experimental';
            if (s.includes('compareceu')) return PIPELINE_WAITING_DECISION_STAGE;
            if (s.includes('não compareceu') || s.includes('nao compareceu')) return LEAD_STATUS.MISSED;
            if (s.includes('não fechou') || s.includes('nao fechou') || s.includes('perdid')) return LEAD_STATUS.LOST;
            if (s.includes('matricul')) return 'Matriculado';
            return 'Novo';
        };

        let stage = lead?.pipelineStage ? String(lead.pipelineStage).trim() : '';
        if (stage === 'Contato feito') stage = 'Novo';
        if (stage === 'Negociação') stage = 'Matriculado';

        if (stage) {
            if (stage === 'Aula experimental' && lead.status !== LEAD_STATUS.SCHEDULED) {
                return stageFromStatusOnly(lead);
            }
            const known = stages.some((col) => col.id === stage);
            if (known) return stage;
            const st = (lead.status || '').toLowerCase();
            if (st.includes('compareceu')) return PIPELINE_WAITING_DECISION_STAGE;
            if (st.includes('agendado')) return 'Aula experimental';
            if (st.includes('matricul')) return 'Matriculado';
            return 'Novo';
        }

        return stageFromStatusOnly(lead);
    }, [stages]);

    const filterByDate = useCallback((lead) => {
        let from = filterDateFrom;
        let to = filterDateTo;

        if (quickFilter === 'today') {
            const today = new Date().toISOString().split('T')[0];
            from = today; to = today;
        } else if (quickFilter === 'week') {
            const now = new Date();
            from = new Date(now.setDate(now.getDate() - now.getDay()))
                .toISOString().split('T')[0];
            to = new Date(now.setDate(now.getDate() + 6))
                .toISOString().split('T')[0];
        } else if (quickFilter === 'month') {
            const now = new Date();
            from = new Date(now.getFullYear(), now.getMonth(), 1)
                .toISOString().split('T')[0];
            to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
                .toISOString().split('T')[0];
        }

        if (!from && !to) return true;

        const dateRef = lead.scheduledDate || lead.createdAt?.split('T')[0];
        if (!dateRef) return false;
        if (from && dateRef < from) return false;
        if (to && dateRef > to) return false;
        return true;
    }, [filterDateFrom, filterDateTo, quickFilter]);

    /** Primeira carga: evita colunas vazias sem feedback até o fetch do Appwrite. */
    const showKanbanInitialLoading = Boolean(leadsLoading && (!Array.isArray(leads) || leads.length === 0));

    const leadsForBoard = useMemo(() => {
        let list = leads
            .filter((l) => leadIsPipelineFunnel(l))
            .filter((l) => leadMatchesContactType(l))
            .filter((l) => leadMatchesProfileFilter(l, profileFilter))
            .filter(filterByDate);

        const q = String(kanbanSearch || '').trim().toLowerCase();
        const qPhone = normalizeKanbanPhone(kanbanSearch);
        if (q || qPhone) {
            list = list.filter((l) => {
                const name = String(l?.name || '').toLowerCase();
                const phoneNorm = normalizeKanbanPhone(l?.phone);
                if (qPhone && phoneNorm.includes(qPhone)) return true;
                if (q && name.includes(q)) return true;
                return false;
            });
        }

        if (searchStageScope !== 'all') {
            list = list.filter((l) => mapLeadToStageId(l) === searchStageScope);
        }

        if (followupKanbanFilter) {
            list = list.filter(
                (l) => l.status === LEAD_STATUS.COMPLETED || l.status === LEAD_STATUS.MISSED
            );
        }

        return list;
    }, [leads, kanbanSearch, profileFilter, searchStageScope, mapLeadToStageId, filterByDate, followupKanbanFilter]);
    const slaAlerts = useSlaAlerts(leadsForBoard, stages);

    const pipelineHeaderMeta = useMemo(() => {
        const total = leadsForBoard.length;
        const needHumanCount = leadsForBoard.filter((l) => l.needHuman).length;
        const slaCriticalCount = Object.values(slaAlerts).filter((a) => a?.urgency === 'critical').length;
        return { total, needHumanCount, slaCriticalCount };
    }, [leadsForBoard, slaAlerts]);

    const advancedFiltersActive =
        profileFilter !== 'all' ||
        originFilter !== 'all' ||
        Boolean(filterDateFrom || filterDateTo) ||
        searchStageScope !== 'all';

    const clearAdvancedFilters = useCallback(() => {
        setProfileFilter('all');
        setOriginFilter('all');
        setFilterDateFrom('');
        setFilterDateTo('');
        setSearchStageScope('all');
    }, []);

    const pipelineHeaderMetaNode = showKanbanInitialLoading ? (
        'Carregando…'
    ) : (
        <>
            <span className="navi-ui-count">{pipelineHeaderMeta.total}</span>{' '}
            {singular(labels.leads || 'Leads').toLowerCase()}
            {pipelineHeaderMeta.slaCriticalCount > 0 ? (
                <>
                    {' '}
                    · <span className="navi-ui-count">{pipelineHeaderMeta.slaCriticalCount}</span> SLA crítico
                </>
            ) : null}
            {pipelineHeaderMeta.needHumanCount > 0 ? (
                <>
                    {' '}
                    · <span className="navi-ui-count">{pipelineHeaderMeta.needHumanCount}</span> precisam resposta
                </>
            ) : null}
        </>
    );

    const renderAdvancedFiltersPanel = () => (
        <PipelineAdvancedFilters
            profileFilter={profileFilter}
            setProfileFilter={setProfileFilter}
            originFilter={originFilter}
            setOriginFilter={setOriginFilter}
            filterDateFrom={filterDateFrom}
            setFilterDateFrom={setFilterDateFrom}
            filterDateTo={filterDateTo}
            setFilterDateTo={setFilterDateTo}
            setQuickFilter={setQuickFilter}
            searchStageScope={searchStageScope}
            setSearchStageScope={setSearchStageScope}
            searchStageScopeOptions={searchStageScopeOptions}
            onClear={clearAdvancedFilters}
        />
    );

    const renderPageActionsMenu = (panelClassName = 'pipeline-page-actions-menu__panel') => (
        <>
            <button
                type="button"
                className="btn-action-ghost"
                aria-haspopup="menu"
                aria-expanded={pageActionsMenuOpen}
                aria-label="Mais ações do funil"
                onClick={() => setPageActionsMenuOpen((v) => !v)}
            >
                <MoreHorizontal size={18} aria-hidden />
            </button>
            {pageActionsMenuOpen ? (
                <DropdownMenuPanel className={panelClassName} aria-label="Ações do funil">
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
                        disabled={!leadsForBoard.length}
                        onClick={() => {
                            setPageActionsMenuOpen(false);
                            void exportLeadsSpreadsheet(leadsForBoard, 'funil-export');
                        }}
                    >
                        Exportar leads
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
                </DropdownMenuPanel>
            ) : null}
        </>
    );

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
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

        const containerId = String(over?.data?.current?.sortable?.containerId || '');
        if (hasStageId(containerId)) return containerId;

        return null;
    }, [stages, leadsForBoard, mapLeadToStageId]);

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);
        setDragOver(null);

        if (!over) return;

        const status = resolveDropStageId(over);
        if (!status) return;
        const leadId = active.id;
        const lead = getLeadById(leadId);
        
        if (!lead || mapLeadToStageId(lead) === status) return;

        if (status === 'Matriculado') {
            setDragTargetLead(lead);
            setMatriculaModalOpen(true);
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
        const payload = getStageUpdatePayload(status);
        beginLeadMove(leadId);
        patchLeadLocal(leadId, payload);

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
            const autoResult = await afterMovedToPipelineStage({
                lead: getLeadById(leadId) || lead,
                toStage: status,
                ...automationCtxBase(),
                getLead: () => getLeadById(leadId) || lead,
            }).catch(() => null);
            if (autoResult) reportAutomations(autoResult);
            toast.success('Movido no pipeline');
        } catch (err) {
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

    const handleDragOver = (event) => {
        const { over } = event;
        setDragOver(resolveDropStageId(over));
    };

    const moveToStatus = useCallback(async (e, leadId, stageId) => {
        e.stopPropagation();
        const lead = getLeadById(leadId);
        if (!lead) return;
        const fromStage = mapLeadToStageId(lead) || lead.pipelineStage || '';
        const toStage = stageId;

        if (stageId === 'Matriculado') {
            setDragTargetLead(lead);
            setMatriculaModalOpen(true);
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
        const payload = getStageUpdatePayload(toStage);
        beginLeadMove(leadId);
        patchLeadLocal(leadId, payload);

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
            const autoResult = await afterMovedToPipelineStage({
                lead: getLeadById(leadId) || lead,
                toStage,
                ...automationCtxBase(),
                getLead: () => getLeadById(leadId) || lead,
            }).catch(() => null);
            if (autoResult) reportAutomations(autoResult);
            toast.success('Movido no pipeline');
        } catch (err) {
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
        patchLeadLocal,
        updateLead,
        revertLeads,
        endLeadMove,
        automationCtxBase,
        reportAutomations,
        toast,
    ]);

    const handleSplitWaMain = useCallback((e, lead) => {
        e.stopPropagation();
        handleWhatsApp(e, lead);
    }, [handleWhatsApp]);

    const toggleWaDropdown = useCallback((e, leadId) => {
        e.stopPropagation();
        setWaDropdownOpenId(prev => prev === leadId ? null : leadId);
        setOpenMenuId(null);
    }, []);
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
            openNote,
            openMenuId,
            scheduleModalLeadId,
            moverOpenId,
            setOpenMenuId,
            setWaDropdownOpenId,
            handleSplitWaMain,
            toggleWaDropdown,
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
            onOpenScheduleModal: setScheduleModalLead,
            onCloseSale: setCloseSaleLead,
            handleConfirmPresence,
            setMissedModalLead,
            setMatriculaModalOpen,
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
            handleSplitWaMain,
            toggleWaDropdown,
            handleConfirmPresence,
            openMover,
            mapLeadToStageId,
            pipelineMenuTrialLc,
            pipelineMenuAttendanceLc,
            pipelineMenuEnrollment,
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
                            subtitle="Mova leads entre etapas e registre follow-ups."
                            meta={pipelineHeaderMetaNode}
                            toolbar={
                            <>
                            <div className="page-header-row navi-toolbar">
                                <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
                                <div className="page-header-sep" />
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
                                <div style={{ flex: 1 }} />
                                <DropdownMenu
                                    open={filtersMenuOpen}
                                    onOpenChange={setFiltersMenuOpen}
                                    className="pipeline-filters-menu"
                                >
                                    <button
                                        type="button"
                                        className={`btn-action-ghost pipeline-filters-trigger${advancedFiltersActive ? ' is-active' : ''}`}
                                        aria-haspopup="dialog"
                                        aria-expanded={filtersMenuOpen}
                                        onClick={() => setFiltersMenuOpen((v) => !v)}
                                    >
                                        <SlidersHorizontal size={14} aria-hidden /> Filtros
                                    </button>
                                    {filtersMenuOpen ? (
                                        <DropdownMenuPanel className="pipeline-filters-menu__panel" aria-label="Filtros do funil">
                                            {renderAdvancedFiltersPanel()}
                                        </DropdownMenuPanel>
                                    ) : null}
                                </DropdownMenu>
                                <DropdownMenu
                                    open={pageActionsMenuOpen}
                                    onOpenChange={setPageActionsMenuOpen}
                                    className="pipeline-page-actions-menu"
                                    align="end"
                                >
                                    {renderPageActionsMenu()}
                                </DropdownMenu>
                                <button
                                    type="button"
                                    className="btn-action-primary"
                                    onClick={() => navigate('/new-lead')}
                                >
                                    <PlusCircle size={14} /> Novo lead
                                </button>
                            </div>
                            <FilterBar className="page-header-row">
                                <button type="button" className={`filter-chip${quickFilter === 'today' ? ' is-active' : ''}`} onClick={() => { setQuickFilter('today'); setFilterDateFrom(''); setFilterDateTo(''); }}>Hoje</button>
                                <button type="button" className={`filter-chip${quickFilter === 'week' ? ' is-active' : ''}`} onClick={() => { setQuickFilter('week'); setFilterDateFrom(''); setFilterDateTo(''); }}>Esta sem.</button>
                                <button type="button" className={`filter-chip${quickFilter === 'month' ? ' is-active' : ''}`} onClick={() => { setQuickFilter('month'); setFilterDateFrom(''); setFilterDateTo(''); }}>Este mês</button>
                                <button type="button" className={`filter-chip${quickFilter === null && !filterDateFrom && !filterDateTo ? ' is-active' : ''}`} onClick={() => { setQuickFilter(null); setFilterDateFrom(''); setFilterDateTo(''); }}>Todos</button>
                            </FilterBar>
                            </>
                            }
                        />
                    </div>
                ) : (
                    <div className="container">
                        <PageHeader
                            className="navi-page-header--flush"
                            title={labels.pipeline || 'Funil'}
                            subtitle="Mova leads entre etapas e registre follow-ups."
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
                            >
                                <button
                                    type="button"
                                    className={`btn-action-ghost pipeline-mobile-filters-trigger${advancedFiltersActive ? ' is-active' : ''}`}
                                    aria-haspopup="dialog"
                                    aria-expanded={filtersMenuOpen}
                                    aria-label="Filtros do funil"
                                    onClick={() => setFiltersMenuOpen((v) => !v)}
                                >
                                    <SlidersHorizontal size={16} aria-hidden />
                                </button>
                                {filtersMenuOpen ? (
                                    <DropdownMenuPanel className="pipeline-filters-menu__panel" aria-label="Filtros do funil">
                                        {renderAdvancedFiltersPanel()}
                                    </DropdownMenuPanel>
                                ) : null}
                            </DropdownMenu>
                            <DropdownMenu
                                open={pageActionsMenuOpen}
                                onOpenChange={setPageActionsMenuOpen}
                                className="pipeline-page-actions-menu"
                                align="end"
                            >
                                {renderPageActionsMenu()}
                            </DropdownMenu>
                            <button
                                type="button"
                                className="btn-action-primary"
                                onClick={() => navigate('/new-lead')}
                            >
                                <PlusCircle size={14} aria-hidden /> Novo lead
                            </button>
                        </div>
                        <FilterBar className="page-header-row" style={{ paddingBottom: 8 }}>
                            <button type="button" className={`filter-chip${quickFilter === 'today' ? ' is-active' : ''}`} onClick={() => { setQuickFilter('today'); setFilterDateFrom(''); setFilterDateTo(''); }}>Hoje</button>
                            <button type="button" className={`filter-chip${quickFilter === 'week' ? ' is-active' : ''}`} onClick={() => { setQuickFilter('week'); setFilterDateFrom(''); setFilterDateTo(''); }}>Esta sem.</button>
                            <button type="button" className={`filter-chip${quickFilter === 'month' ? ' is-active' : ''}`} onClick={() => { setQuickFilter('month'); setFilterDateFrom(''); setFilterDateTo(''); }}>Este mês</button>
                            <button type="button" className={`filter-chip${quickFilter === null && !filterDateFrom && !filterDateTo ? ' is-active' : ''}`} onClick={() => { setQuickFilter(null); setFilterDateFrom(''); setFilterDateTo(''); }}>Todos</button>
                        </FilterBar>
                    </div>
                )}
                {editStages && (
                    <div className="container stage-editor">
                        <div className="stage-editor-head">
                            <span>Nome da etapa</span>
                            <span title="Alerta quando o interessado permanece mais dias que o limite nesta etapa">SLA (dias)</span>
                        </div>
                        {tempStages.map((st, idx) => (
                            <div className="stage-row" key={st.id}>
                                <input
                                    className="stage-input"
                                    value={st.label}
                                    disabled={st.id === LEAD_STATUS.MISSED || st.id === LEAD_STATUS.LOST}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setTempStages(prev => prev.map((s, i) => i === idx ? { ...s, label: v } : s));
                                    }}
                                />
                                <input
                                    className="stage-sla"
                                    type="number"
                                    min="1"
                                    value={st.slaDays ?? DEFAULT_STAGE_SLA_DAYS}
                                    disabled={st.id === LEAD_STATUS.MISSED || st.id === LEAD_STATUS.LOST}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        setTempStages(prev => prev.map((s, i) => i === idx ? { ...s, slaDays: v } : s));
                                    }}
                                    title="SLA (dias)"
                                />
                            </div>
                        ))}
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
                <div className="container" style={{ paddingTop: 10 }}>
                    <ErrorBanner
                        message="Não foi possível carregar os leads do funil."
                        onRetry={() => void fetchLeads({ reset: true })}
                    />
                </div>
            ) : null}

            {!isMobile && showKanbanInitialLoading ? (
                <div className="pipeline-kanban-loading-hint" role="status">
                    Carregando leads do funil…
                </div>
            ) : null}

            {isMobile ? (
                <MobileLeadList
                    stages={displayStages}
                    leadsForBoard={leadsForBoard}
                    originFilter={originFilter}
                    navigate={navigate}
                    mapLeadToStageId={mapLeadToStageId}
                    handleSplitWaMain={handleSplitWaMain}
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
            >
                <div
                    ref={kanbanWrapperRef}
                    className="kanban-wrapper"
                    onDragOverCapture={showKanbanInitialLoading ? undefined : onKanbanWrapperDragOverCapture}
                    aria-busy={showKanbanInitialLoading || undefined}
                    aria-label={showKanbanInitialLoading ? 'Carregando leads do funil' : undefined}
                >
                    {displayStages.map((col, idx) => {
                        const color = getPipelineStageColor(stage.id, idx);
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

                        const colLeads = leadsForBoard
                            .filter(l => mapLeadToStageId(l) === col.id)
                            .filter(l => originFilter === 'all' ? true : (l.origin || '') === originFilter)
                            .sort((a, b) => {
                                const toDateTime = (lead) => {
                                    const base = lead.scheduledDate || lead.createdAt || '';
                                    if (!base) return new Date(8640000000000000);
                                    const [y, m, d] = base.split('T')[0].split('-').map(Number);
                                    let hh = 23, mm = 59;
                                    if (lead.scheduledTime && /^\d{2}:\d{2}$/.test(lead.scheduledTime)) {
                                        const [h, mi] = lead.scheduledTime.split(':').map(Number);
                                        if (Number.isFinite(h) && Number.isFinite(mi)) {
                                            hh = h; mm = mi;
                                        }
                                    }
                                    return new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
                                };
                                return toDateTime(a) - toDateTime(b);
                            });

                        return (
                            <Column
                                key={col.id}
                                id={col.id}
                                col={col}
                                color={color}
                                isOver={dragOver === col.id}
                                hasOverlayOpen={colLeads.some((l) => l.id === openMenuId || l.id === scheduleModalLead?.id || l.id === moverOpenId)}
                                leads={colLeads}
                            >
                                {(scrollRef) => (
                                    <>
                                <SortableContext items={colLeads.map(l => l.id)} strategy={verticalListSortingStrategy}>
                                    <PipelineColumnLeads
                                        scrollRef={scrollRef}
                                        leads={colLeads}
                                        savingLeadIds={savingLeadIds}
                                        movingLeadIds={movingLeadIds}
                                        slaAlerts={slaAlerts}
                                        cardProps={cardProps}
                                    />
                                </SortableContext>

                                {colLeads.length === 0 && (() => {
                                    const scopeLabel = searchStageScopeOptions.find((o) => o.value === searchStageScope)?.label || '';
                                    const hasSearchQuery = Boolean(String(kanbanSearch || '').trim() || normalizeKanbanPhone(kanbanSearch));
                                    const inStageScope = searchStageScope === 'all' || col.id === searchStageScope;
                                    const isEnrollmentDropCol = String(col.id || '').trim() === 'Matriculado';
                                    let hint = 'Arraste um card de outra coluna ou use “Novo” no menu para cadastrar.';
                                    let emptyTitle = `Nenhum ${singular(labels.leads).toLowerCase()} nesta etapa`;
                                    if (isEnrollmentDropCol && searchStageScope === 'all' && !hasSearchQuery) {
                                        emptyTitle = 'Arraste aqui para matricular';
                                        hint =
                                            'Esta coluna não guarda cards: ao confirmar a matrícula, o contato vira aluno e some do funil. Use o arraste para abrir o cadastro.';
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

                <DragOverlay dropAnimation={dropAnimationConfig}>
                    {activeId ? (
                        <LeadCard
                            lead={getLeadById(activeId)}
                            slaAlert={slaAlerts[activeId]}
                            isOverlay
                            navigate={navigate}
                            openNote={openNote}
                            openMenuId={openMenuId}
                            scheduleModalLeadId={scheduleModalLead?.id ?? null}
                            moverOpenId={moverOpenId}
                            setOpenMenuId={setOpenMenuId}
                            setWaDropdownOpenId={setWaDropdownOpenId}
                            handleSplitWaMain={handleSplitWaMain}
                            toggleWaDropdown={toggleWaDropdown}
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
                            onCloseSale={setCloseSaleLead}
                            handleConfirmPresence={handleConfirmPresence}
                            setMissedModalLead={setMissedModalLead}
                            setMatriculaModalOpen={setMatriculaModalOpen}
                            openMover={openMover}
                            setDragTargetLead={setDragTargetLead}
                            mapLeadToStageId={mapLeadToStageId}
                            pipelineMenuTrialLc={terms.trial.toLowerCase()}
                            pipelineMenuAttendanceLc={terms.attendance.toLowerCase()}
                            pipelineMenuEnrollment={terms.enrollment}
                        />
                    ) : null}
                </DragOverlay>
            </DndContext>
            </div>
            )}

            <LeadCloseSaleModal
                open={Boolean(closeSaleLead)}
                lead={closeSaleLead}
                academyId={academyId}
                userId={userId}
                permissionContext={permCtx}
                onClose={() => setCloseSaleLead(null)}
            />

            <ScheduleModal
                open={scheduleModalLead !== null}
                onClose={() => setScheduleModalLead(null)}
                onConfirm={onConfirmSchedulePipeline}
                lead={scheduleModalLead}
                quickTimes={pipelineQuickTimes}
                initialDate={scheduleModalLead?.scheduledDate || ''}
                initialTime={scheduleModalLead?.scheduledTime || ''}
            />

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

            <ImportSheet
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onImport={handleImport}
                defaultStatus={LEAD_STATUS.NEW}
                title={`Importar ${labels.leads}`}
                financeConfig={financeConfig}
            />

            <MatriculaModal
                isOpen={matriculaModalOpen}
                leadId={dragTargetLead?.id || ''}
                showContractPrompt={modules?.finance === true}
                enrollmentQuestions={enrollmentQuestions}
                financeConfig={financeConfig}
                submitting={matriculaSubmitting}
                onClose={() => {
                    if (matriculaSubmitting) return;
                    setMatriculaModalOpen(false);
                    setDragTargetLead(null);
                }}
                onSendContract={(id) => {
                    setMatriculaModalOpen(false);
                    setDragTargetLead(null);
                    setPostMatriculaContractLeadId(id);
                    setPostMatriculaContractOpen(true);
                }}
                onSkipAfterEnroll={(studentId) => {
                    setMatriculaModalOpen(false);
                    setDragTargetLead(null);
                    if (studentId) navigate(`/student/${studentId}?edit=enrollment`);
                }}
                onConfirmSimple={async (plan) => {
                    if (!dragTargetLead) return;
                    setMatriculaSubmitting(true);
                    try {
                        await executeMatricula(dragTargetLead, {}, plan);
                    } finally {
                        setMatriculaSubmitting(false);
                    }
                }}
                onConfirmFull={async (customAnswers, plan) => {
                    if (!dragTargetLead) return;
                    setMatriculaSubmitting(true);
                    try {
                        await executeMatricula(dragTargetLead, customAnswers, plan);
                    } finally {
                        setMatriculaSubmitting(false);
                    }
                }}
            />

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

            {missedModalLead && (
                <div className="note-overlay" onClick={() => setMissedModalLead(null)}>
                    <div className="note-modal mini-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '340px' }}>
                        <h4 className="navi-section-heading" style={{ marginBottom: 16, fontSize: '0.95rem' }}>Por que não compareceu?</h4>
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
                        <div className="note-footer" style={{ marginTop: 20 }}>
                            <button className="btn-ghost" onClick={() => setMissedModalLead(null)} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
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
                        <h3 className="navi-section-heading" style={{ marginBottom: 8 }}>{confirmModal.title}</h3>
                        <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>{confirmModal.description}</p>
                        <div className="note-footer">
                            <button className="btn-outline" onClick={() => setConfirmModal(null)}>Cancelar</button>
                            <button className="btn-secondary" onClick={() => void confirmModal.onConfirm?.()}>{confirmModal.confirmLabel || 'Confirmar'}</button>
                        </div>
                    </div>
                </div>
            )}
            {noteOpen && (
                <div className="note-overlay" onClick={() => setNoteOpen(false)}>
                    <div className="note-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="navi-section-heading" style={{ marginBottom: 8 }}>Adicionar observação</h3>
                        <textarea
                            className="note-textarea"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Ex.: Ligação realizada, reagendado para quinta às 19:00"
                        />
                        {noteError ? <p className="text-small" style={{ color: 'var(--danger)', marginTop: 8 }}>{noteError}</p> : null}
                        <div className="note-footer">
                            <button className="btn-outline" onClick={() => setNoteOpen(false)}>Cancelar</button>
                            <button className="btn-secondary" onClick={saveNote} disabled={!String(noteText || '').trim()}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
            <NlCommandBar open={nlOpen} onOpenChange={setNlOpen} context="funil" pipelineStages={displayStages} />
        </div>
    );
};

export default Pipeline;
