import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createPortal } from 'react-dom';
import { useTaskStore } from '../store/useTaskStore';
import { useLeadStore } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import {
  buildTaskLinkablePeople,
  filterTaskLinkablePeople,
  profilePathForLinkablePerson,
} from '../lib/taskLinkablePeople.js';
import { useUiStore } from '../store/useUiStore';
import { teams } from '../lib/appwrite';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { DateInputField } from '../components/DateInput';
import {
  CheckSquare,
  PlusCircle,
  Pencil,
  Trash2,
  Calendar,
  User,
  X,
  ClipboardList,
  AlertTriangle,
  Users,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { progressLabelForLead } from '../lib/taskTemplates.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import ErrorBanner from '../components/shared/ErrorBanner.jsx';
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx';
import { friendlyError } from '../lib/errorMessages';
import { useTerms, contactLabelSingular } from '../lib/terminology.js';
import CollectionResultModal from '../components/CollectionResultModal.jsx';
import {
  isCollectionTask,
  parseCollectionTaskDescription,
  formatCollectionAttemptText,
} from '../lib/collectionRules.js';
import { addLeadEvent } from '../lib/leadEvents.js';
import { membershipPrimaryLabel } from '../lib/teamMembershipLabel.js';

const VIEW_STORAGE_KEY = 'nave_tasks_view';
/** Tarefas visíveis por aluno antes de exigir "Ver mais". */
const STUDENT_TASKS_PREVIEW = 4;
/** Id sintético para expandir/recolher o grupo de tarefas sem aluno. */
const UNLINKED_STUDENT_GROUP_ID = '__unlinked__';

function initialsFromName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function sortTasksForStudentGroup(tasks, isOverdue) {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'done';
    const bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aLate = !aDone && isOverdue(a.due_date);
    const bLate = !bDone && isOverdue(b.due_date);
    if (aLate !== bLate) return aLate ? -1 : 1;
    const aDue = String(a.due_date || '').trim().slice(0, 10) || '9999-12-31';
    const bDue = String(b.due_date || '').trim().slice(0, 10) || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
  });
}

function buildStudentTaskGroup(leadId, leadName, tasks, isOverdue) {
  const tasksSorted = sortTasksForStudentGroup(tasks, isOverdue);
  let pendingCount = 0;
  let doneCount = 0;
  let overdueCount = 0;
  for (const t of tasksSorted) {
    if (t.status === 'done') {
      doneCount += 1;
    } else {
      pendingCount += 1;
      if (isOverdue(t.due_date)) overdueCount += 1;
    }
  }
  return { leadId, leadName, tasks: tasksSorted, pendingCount, doneCount, overdueCount };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Segunda-feira 00:00 local da semana que contém `ref`. */
function startOfWeekMondayLocal(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isDueInCurrentWeek(dueStr) {
  if (!dueStr || !String(dueStr).trim()) return false;
  const mon = startOfWeekMondayLocal();
  const ymdDue = String(dueStr).trim().slice(0, 10);
  const due = new Date(ymdDue.length === 10 ? `${ymdDue}T00:00:00` : ymdDue);
  const dDue = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const dSun = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate(), 0, 0, 0, 0);
  return dDue.getTime() >= mon.getTime() && dDue.getTime() <= dSun.getTime();
}

const TASKS_KANBAN_VIRTUAL_THRESHOLD = 20;

function TasksKanbanColumnBody({
  tasks,
  renderCard,
  hasMore,
  loadingMore,
  onLoadMore,
}) {
  const scrollRef = useRef(null);
  const shouldVirtualize = tasks.length > TASKS_KANBAN_VIRTUAL_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? tasks.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  return (
    <div
      ref={scrollRef}
      className="tasks-kanban-col-body task-list"
      style={{ overflow: 'auto', maxHeight: 'min(70vh, 720px)', position: 'relative' }}
    >
      {shouldVirtualize ? (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const t = tasks[virtualRow.index];
            if (!t) return null;
            return (
              <div
                key={t.id}
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
                {renderCard(t)}
              </div>
            );
          })}
        </div>
      ) : (
        tasks.map((t) => <React.Fragment key={t.id}>{renderCard(t)}</React.Fragment>)
      )}
      {hasMore ? (
        <button
          type="button"
          className="btn-action-ghost"
          style={{ width: '100%', marginTop: 8 }}
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? 'Carregando…' : 'Carregar mais'}
        </button>
      ) : null}
    </div>
  );
}

export default function Tasks() {
  const navigate = useNavigate();
  const terms = useTerms();
  const labels = useLeadStore((s) => s.labels);
  const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);
  const academyId = useLeadStore((s) => s.academyId);
  const teamId = useLeadStore((s) => s.teamId);
  const leads = useLeadStore((s) => s.leads);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);
  const students = useStudentStore((s) => s.students);
  const tasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const loadingMore = useTaskStore((s) => s.loadingMore);
  const tasksHasMore = useTaskStore((s) => s.tasksHasMore);
  const error = useTaskStore((s) => s.error);
  const filters = useTaskStore((s) => s.filters);
  const setFilter = useTaskStore((s) => s.setFilter);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const fetchMoreTasks = useTaskStore((s) => s.fetchMoreTasks);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const patchTaskLocal = useTaskStore((s) => s.patchTaskLocal);
  const isUpdating = useTaskStore((s) => s.isUpdating);
  const addToast = useUiStore((s) => s.addToast);

  const [searchParams] = useSearchParams();
  const initLeadId = searchParams.get('lead_id') || '';
  const initNew = searchParams.get('new') === '1';

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(false);

  const effectiveTeamId = useMemo(() => {
    const acad = (academyList || []).find((a) => a.id === academyId);
    return String(acad?.teamId || teamId || '').trim();
  }, [academyList, academyId, teamId]);

  const linkablePeople = useMemo(
    () => buildTaskLinkablePeople(leads, students),
    [leads, students]
  );

  const linkableById = useMemo(() => {
    const map = new Map();
    for (const p of linkablePeople) map.set(p.id, p);
    return map;
  }, [linkablePeople]);

  const [collectionModalTask, setCollectionModalTask] = useState(null);
  const [collectionSaving, setCollectionSaving] = useState(false);
  const [showModal, setShowModal] = useState(initNew);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', due_date: '', assigned_to: '', lead_id: initLeadId });
  const [saving, setSaving] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const leadDropRef = useRef(null);

  const filteredLinkablePeople = useMemo(
    () => filterTaskLinkablePeople(linkablePeople, leadSearch),
    [linkablePeople, leadSearch]
  );

  // Carrega todas as páginas de leads + alunos ao abrir o modal (matriculados saem de leads).
  useEffect(() => {
    if (!showModal || !academyId) return;
    let cancelled = false;
    (async () => {
      let guard = 0;
      while (!cancelled && useLeadStore.getState().leadsHasMore && guard < 40) {
        await useLeadStore.getState().fetchMoreLeads();
        guard += 1;
      }
      guard = 0;
      while (!cancelled && useStudentStore.getState().studentsHasMore && guard < 40) {
        await useStudentStore.getState().fetchMoreStudents();
        guard += 1;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showModal, academyId]);

  useEffect(() => {
    if (!initLeadId) return;
    const person = linkableById.get(initLeadId);
    if (person?.name) setLeadSearch(person.name);
  }, [initLeadId, linkableById]);

  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === 'kanban' || v === 'calendar' || v === 'by_student' || v === 'list') return v;
      return 'by_student';
    } catch {
      return 'by_student';
    }
  });
  const [estaSemanaOn, setEstaSemanaOn] = useState(false);
  const [expandedStudentIds, setExpandedStudentIds] = useState(() => new Set());
  const [detailTask, setDetailTask] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    if (!showModal) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  // Sincronizar filtro ao carregar a página se tiver lead_id na URL
  useEffect(() => {
    if (initLeadId && filters.lead_id !== initLeadId) {
      setFilter('lead_id', initLeadId);
    }
  }, [initLeadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Membros da equipe (responsável) — teamId da academia ativa, não só o do store global
  useEffect(() => {
    if (!effectiveTeamId) {
      setMembers([]);
      setMembersError(false);
      setMembersLoading(false);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(false);
    teams
      .listMemberships(effectiveTeamId)
      .then((res) => {
        if (!cancelled) setMembers(res.memberships || []);
      })
      .catch((e) => {
        console.error('Erro ao buscar membros', e);
        if (!cancelled) {
          setMembers([]);
          setMembersError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveTeamId]);

  const filterLeadId = filters.lead_id;
  const filterStatus = filters.status;
  const filterAssigned = filters.assigned_to;
  const tasksLastFetchedAt = useTaskStore((s) => s.tasksLastFetchedAt);
  const STALE_MS = 5 * 60 * 1000;

  useEffect(() => {
    if (!academyId) return;
    const stale = !tasksLastFetchedAt || Date.now() - tasksLastFetchedAt > STALE_MS;
    const hasFilter =
      (filterStatus && filterStatus !== 'all') ||
      Boolean(filterAssigned) ||
      Boolean(filterLeadId);
    if (!stale && !hasFilter && tasks.length > 0) return;
    void fetchTasks(academyId, { reset: true });
  }, [
    academyId,
    filterLeadId,
    filterStatus,
    filterAssigned,
    fetchTasks,
    tasksLastFetchedAt,
    tasks.length,
  ]);

  const handleLoadMoreTasks = useCallback(() => {
    if (!academyId || loadingMore || !tasksHasMore) return;
    void fetchMoreTasks(academyId);
  }, [academyId, loadingMore, tasksHasMore, fetchMoreTasks]);

  useEffect(() => {
    if (!showLeadDrop) return;
    const handler = (e) => {
      if (leadDropRef.current && !leadDropRef.current.contains(e.target)) setShowLeadDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLeadDrop]);

  useEffect(() => {
    if (!detailTask) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailTask(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailTask]);

  function isVencida(dateStr) {
    if (!dateStr) return false;
    const due = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr).getTime();
    const now = new Date().setHours(0,0,0,0);
    return due < now;
  }

  function formatDueRelative(dateStr) {
    if (!dateStr) return null;
    const due = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDay = new Date(due);
    dueDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return { text: 'Hoje', title: 'Vence hoje' };
    if (diffDays === 1) return { text: 'Amanhã', title: 'Vence amanhã' };
    if (diffDays === -1) return { text: 'Ontem', title: 'Venceu ontem' };
    if (diffDays > 1) return { text: `${diffDays} dias`, title: `Vence em ${diffDays} dias` };
    return { text: `${Math.abs(diffDays)} dias`, title: `Atrasada há ${Math.abs(diffDays)} dias` };
  }

  const [quickTitle, setQuickTitle] = useState('');
  const [quickError, setQuickError] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const todayYmd = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  const handleQuickCreate = async () => {
    const title = String(quickTitle || '').trim();
    if (!title) {
      setQuickError('Digite um título');
      return;
    }
    if (!academyId) return;
    setQuickSaving(true);
    setQuickError('');
    try {
      await createTask({
        title,
        description: '',
        due_date: todayYmd,
        assigned_to: '',
        lead_id: filters.lead_id || '',
        lead_name: filters.lead_id ? linkableById.get(filters.lead_id)?.name || '' : '',
      });
      setQuickTitle('');
      addToast({ type: 'success', message: 'Tarefa criada' });
    } catch {
      setQuickError('Não foi possível criar. Tente novamente.');
    } finally {
      setQuickSaving(false);
    }
  };

  const filteredTasksBase = useMemo(() => {
    const userId = useLeadStore.getState().userId;
    return tasks.filter(t => {
      if (filters.status === 'minhas' && t.assigned_to !== userId) return false;
      if (filters.status === 'vencidas' && (t.status === 'done' || !isVencida(t.due_date))) return false;
      if (filters.status === 'concluidas' && t.status !== 'done') return false;
      if (filters.lead_id && t.lead_id !== filters.lead_id) return false;
      return true;
    });
  }, [tasks, filters.status, filters.lead_id]);

  const filteredTasks = useMemo(() => {
    if (!estaSemanaOn) return filteredTasksBase;
    return filteredTasksBase.filter((t) => isDueInCurrentWeek(t.due_date));
  }, [filteredTasksBase, estaSemanaOn]);

  const semPrazoExcluidasCount = useMemo(
    () => filteredTasksBase.filter((t) => !t.due_date || !String(t.due_date).trim()).length,
    [filteredTasksBase]
  );

  const semPrazoTasksForCalendar = useMemo(
    () => filteredTasksBase.filter((t) => !t.due_date || !String(t.due_date).trim()),
    [filteredTasksBase]
  );

  const tasksByDueYmd = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) {
      const raw = String(t.due_date || '').trim().slice(0, 10);
      if (!raw || raw.length < 10) continue;
      if (!map[raw]) map[raw] = [];
      map[raw].push(t);
    }
    return map;
  }, [filteredTasks]);

  const tasksByLead = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) {
      const lid = String(t.lead_id || '').trim();
      if (!lid) continue;
      if (!map[lid]) {
        map[lid] = {
          leadId: lid,
          leadName: String(t.lead_name || '').trim() || linkableById.get(lid)?.name || 'Aluno',
          tasks: [],
        };
      }
      map[lid].tasks.push(t);
    }
    return Object.values(map)
      .map((group) => buildStudentTaskGroup(group.leadId, group.leadName, group.tasks, isVencida))
      .sort((a, b) => String(a.leadName).localeCompare(String(b.leadName), 'pt-BR'));
  }, [filteredTasks, linkableById]);

  const unlinkedTasksGroup = useMemo(() => {
    const tasks = filteredTasks.filter((t) => !String(t.lead_id || '').trim());
    if (tasks.length === 0) return null;
    return buildStudentTaskGroup(UNLINKED_STUDENT_GROUP_ID, 'Sem aluno vinculado', tasks, isVencida);
  }, [filteredTasks]);

  const kanbanColumns = useMemo(() => {
    const atrasadas = [];
    const aFazer = [];
    const concluidas = [];
    filteredTasks.forEach((t) => {
      if (t.status === 'done') {
        concluidas.push(t);
      } else if (isVencida(t.due_date)) {
        atrasadas.push(t);
      } else {
        aFazer.push(t);
      }
    });
    return { atrasadas, aFazer, concluidas };
  }, [filteredTasks]);

  const calMatrix = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const firstDow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calMonth.y, calMonth.m]);

  const calMonthLabel = useMemo(
    () =>
      new Date(calMonth.y, calMonth.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [calMonth.y, calMonth.m]
  );

  function shiftCalMonth(delta) {
    setCalMonth((prev) => {
      const d = new Date(prev.y, prev.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function detailStatusMeta(t) {
    if (t.status === 'done') return { label: 'Concluída', cls: 'task-drawer-badge--done' };
    if (isVencida(t.due_date)) return { label: 'Atrasada', cls: 'task-drawer-badge--late' };
    return { label: 'Pendente', cls: 'task-drawer-badge--pending' };
  }

  const groupedTasks = useMemo(() => {
    const vencidas = [];
    const pendentes = [];
    const concluidas = [];
    
    filteredTasks.forEach(t => {
      if (t.status === 'done') {
        concluidas.push(t);
      } else if (isVencida(t.due_date)) {
        vencidas.push(t);
      } else {
        pendentes.push(t);
      }
    });
    
    return { vencidas, pendentes, concluidas };
  }, [filteredTasks]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      addToast({ type: 'error', message: 'Título é obrigatório' });
      return;
    }
    
    setSaving(true);
    try {
      let leadName = '';
      if (form.lead_id) {
        leadName = linkableById.get(form.lead_id)?.name || '';
      }
      
      const payload = { ...form, lead_name: leadName };
      
      if (editingTask) {
        await updateTask(editingTask.id, payload);
        addToast({ type: 'success', message: 'Tarefa atualizada' });
      } else {
        await createTask(payload);
        addToast({ type: 'success', message: 'Tarefa criada' });
      }
      setShowModal(false);
    } catch {
      addToast({ type: 'error', message: 'Erro ao salvar tarefa' });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (t) => {
    setEditingTask(t);
    setForm({
      title: t.title || '',
      description: t.description || '',
      due_date: t.due_date || '',
      assigned_to: t.assigned_to || '',
      lead_id: t.lead_id || ''
    });
    const person = linkableById.get(t.lead_id);
    setLeadSearch(person?.name || '');
    setShowModal(true);
  };

  const openEditFromDetail = () => {
    const t = detailTask;
    setDetailTask(null);
    if (t) openEdit(t);
  };

  const openNew = () => {
    setEditingTask(null);
    const lid = filters.lead_id || '';
    setForm({ title: '', description: '', due_date: '', assigned_to: '', lead_id: lid });
    setLeadSearch(lid ? linkableById.get(lid)?.name || '' : '');
    setShowModal(true);
  };

  const permCtx = useMemo(() => {
    const acad = (academyList || []).find((a) => a.id === academyId) || {};
    return { ownerId: acad.ownerId, teamId: acad.teamId || teamId, userId: userId || '' };
  }, [academyList, academyId, teamId, userId]);

  const toggleDone = async (t) => {
    if (t.status !== 'done' && isCollectionTask(t)) {
      setCollectionModalTask(t);
      return;
    }
    if (isUpdating(t.id)) return;
    const previousStatus = t.status;
    const newStatus = previousStatus === 'done' ? 'pending' : 'done';
    patchTaskLocal(t.id, { status: newStatus });
    try {
      await updateTask(t.id, { status: newStatus });
    } catch {
      patchTaskLocal(t.id, { status: previousStatus });
      addToast({ type: 'error', message: 'Erro ao atualizar status' });
    }
  };

  const handleCollectionConfirm = async ({ result, notes }) => {
    const t = collectionModalTask;
    if (!t?.id || !academyId) return;
    const meta = parseCollectionTaskDescription(t.description);
    setCollectionSaving(true);
    try {
      await updateTask(t.id, { status: 'done' });
      if (t.lead_id) {
        await addLeadEvent({
          academyId,
          leadId: t.lead_id,
          type: 'collection_attempt',
          text: formatCollectionAttemptText({
            stage: meta?.stage || t.title,
            result,
            notes,
          }),
          createdBy: userId || 'user',
          payloadJson: {
            date: new Date().toISOString(),
            stage: meta?.stage || '',
            stage_day: meta?.day ?? null,
            result,
            notes: notes || '',
            task_id: t.id,
          },
          permissionContext: permCtx,
        });
      }
      setCollectionModalTask(null);
      addToast({ type: 'success', message: 'Tarefa concluída e resultado registrado.' });
    } catch {
      addToast({ type: 'error', message: 'Erro ao registrar cobrança' });
    } finally {
      setCollectionSaving(false);
    }
  };

  const handleDelete = (id) => {
    setDeleteConfirmId(id);
  };

  const runDeleteConfirmed = async () => {
    const id = deleteConfirmId;
    if (!id) return;
    setDeleteConfirmId(null);
    try {
      await deleteTask(id);
      if (detailTask?.id === id) setDetailTask(null);
      addToast({ type: 'success', message: 'Tarefa excluída' });
    } catch {
      addToast({ type: 'error', message: 'Erro ao excluir' });
    }
  };

  const toggleStudentTasksExpanded = useCallback((leadId) => {
    setExpandedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  const renderTaskLeadBadge = (t, { compact = false } = {}) => {
    if (!t.lead_id) return null;
    const person = linkableById.get(t.lead_id);
    const name = String(t.lead_name || person?.name || '').trim() || terms.student;
    const kindLabel =
      person?.kind === 'student' ? terms.student : person?.kind === 'lead' ? contactLabel : null;
    const path = profilePathForLinkablePerson(person) || `/student/${t.lead_id}`;
    return (
      <span
        className={`task-badge lead-badge${compact ? ' task-badge--compact' : ''}`}
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          navigate(path);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            navigate(path);
          }
        }}
      >
        <User size={12} aria-hidden="true" /> {name}
        {kindLabel ? ` · ${kindLabel}` : ''}
      </span>
    );
  };

  const renderOneTaskCard = (t, opts = {}) => {
    const compact = Boolean(opts.compact);
    const vencida = isVencida(t.due_date) && t.status !== 'done';
    const showLinkedPerson = Boolean(t.lead_id) && !opts.hideLead;
    return (
      <div
        key={t.id}
        className={`task-card ${compact ? 'task-card--compact' : ''} ${t.status === 'done' ? 'done' : ''}`}
      >
        <span className="task-checkbox-wrap" onClick={(e) => e.stopPropagation()}>
          {isUpdating(t.id) ? (
            <Loader2 size={16} className="navi-async-btn__spin task-checkbox-spinner" aria-hidden />
          ) : (
            <input
              type="checkbox"
              checked={t.status === 'done'}
              onChange={() => void toggleDone(t)}
              className="task-checkbox"
              aria-label={t.status === 'done' ? 'Marcar como pendente' : 'Marcar como concluída'}
            />
          )}
        </span>
        <div
          className="task-content"
          role="button"
          tabIndex={0}
          onClick={() => setDetailTask(t)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailTask(t);
            }
          }}
        >
          <span className={`task-title ${t.status === 'done' ? 'line-through' : ''}`}>{t.title}</span>
          {showLinkedPerson ? (
            <div className={`task-linked-person${compact ? ' task-linked-person--compact' : ''}`}>
              {renderTaskLeadBadge(t, { compact })}
            </div>
          ) : null}
          {!compact || opts.showMeta ? (
            <div className={`task-meta${compact ? ' task-meta--compact' : ''}`}>
              {t.due_date ? (
                (() => {
                  const rel = formatDueRelative(t.due_date);
                  return (
                    <span
                      className={`task-badge ${vencida ? 'text-danger' : ''}`}
                      title={rel?.title || undefined}
                    >
                      <Calendar size={12} /> {rel?.text || new Date(t.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  );
                })()
              ) : null}
              {t.assigned_to ? (
                <span
                  className="task-badge assign-badge"
                  title={
                    membershipPrimaryLabel(members.find((m) => m.userId === t.assigned_to) || {}) ||
                    t.assigned_to
                  }
                >
                  {(members.find((m) => m.userId === t.assigned_to)
                    ? membershipPrimaryLabel(members.find((m) => m.userId === t.assigned_to))
                    : t.assigned_to)
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="task-actions dropdown-container" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="task-action-btn" onClick={() => openEdit(t)}>
            <Pencil size={14} />
          </button>
          <button type="button" className="task-action-btn text-danger" onClick={() => handleDelete(t.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderTasksLoadingSkeleton = () => (
    <div
      className="tasks-skeleton-root"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando tarefas"
    >
      <span className="tasks-skeleton-sr">Carregando tarefas…</span>
      {[0, 1].map((section) => (
        <div key={section} className="tasks-skeleton-section">
          <div className="tasks-skeleton-group-title" aria-hidden />
          <div className="tasks-skeleton-list">
            {[0, 1, 2].map((row) => (
              <div key={`${section}-${row}`} className="tasks-skeleton-card" aria-hidden>
                <div className="tasks-skeleton-check" />
                <div className="tasks-skeleton-body">
                  <div className="tasks-skeleton-line tasks-skeleton-line--title" />
                  <div className={`tasks-skeleton-line tasks-skeleton-line--sub ${row % 2 === 1 ? 'tasks-skeleton-line--short' : ''}`} />
                  <div className="tasks-skeleton-badges">
                    <span className="tasks-skeleton-pill" />
                    <span className="tasks-skeleton-pill tasks-skeleton-pill--narrow" />
                  </div>
                </div>
                <div className="tasks-skeleton-actions">
                  <span className="tasks-skeleton-icon" />
                  <span className="tasks-skeleton-icon" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTaskList = (list, title, titleColor) => {
    if (list.length === 0) return null;
    return (
      <div className="task-group">
        <h3 className="task-group-title" style={{ color: titleColor }}>{title} ({list.length})</h3>
        <div className="task-list">
          {list.map((t) => renderOneTaskCard(t))}
        </div>
      </div>
    );
  };

  const renderStudentTasksGroupCard = (group, { unlinked = false } = {}) => {
    const canCollapse = group.tasks.length > STUDENT_TASKS_PREVIEW;
    const isExpanded = expandedStudentIds.has(group.leadId);
    const visibleTasks =
      canCollapse && !isExpanded ? group.tasks.slice(0, STUDENT_TASKS_PREVIEW) : group.tasks;
    const hiddenCount = Math.max(0, group.tasks.length - STUDENT_TASKS_PREVIEW);
    const countsMarkup = (
      <span className="tasks-student-card__counts">
        {group.pendingCount > 0 ? (
          <span>
            {group.pendingCount} pendente{group.pendingCount === 1 ? '' : 's'}
          </span>
        ) : null}
        {group.doneCount > 0 ? (
          <span>
            {group.pendingCount > 0 ? ' · ' : ''}
            {group.doneCount} concluída{group.doneCount === 1 ? '' : 's'}
          </span>
        ) : null}
        {group.overdueCount > 0 ? (
          <span className="tasks-student-card__overdue">
            {group.pendingCount > 0 || group.doneCount > 0 ? ' · ' : ''}
            {group.overdueCount} atrasada{group.overdueCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </span>
    );

    return (
      <article
        key={group.leadId}
        className={`tasks-student-card${unlinked ? ' tasks-student-card--unlinked' : ''}${canCollapse && !isExpanded ? ' tasks-student-card--collapsed' : ''}`}
        role="listitem"
      >
        <header className="tasks-student-card__head">
          {unlinked ? (
            <div className="tasks-student-card__profile-static">
              <span className="tasks-student-card__avatar tasks-student-card__avatar--unlinked" aria-hidden="true">
                <ClipboardList size={18} />
              </span>
              <span className="tasks-student-card__identity">
                <span className="tasks-student-card__name-row">
                  <span className="tasks-student-card__name">{group.leadName}</span>
                  <span className="tasks-student-card__kind">Geral</span>
                </span>
                {countsMarkup}
              </span>
            </div>
          ) : (
            <>
              {(() => {
                const linkedPerson = linkableById.get(group.leadId);
                const linkedKindLabel =
                  linkedPerson?.kind === 'lead'
                    ? contactLabel
                    : linkedPerson?.kind === 'student'
                      ? terms.student
                      : null;
                const profilePath =
                  profilePathForLinkablePerson(linkedPerson) || `/student/${group.leadId}`;
                return (
                  <button
                    type="button"
                    className="tasks-student-card__profile"
                    onClick={() => navigate(profilePath)}
                    aria-label={`Abrir perfil de ${group.leadName}`}
                  >
                    <span className="tasks-student-card__avatar" aria-hidden="true">
                      {initialsFromName(group.leadName)}
                    </span>
                    <span className="tasks-student-card__identity">
                      <span className="tasks-student-card__name-row">
                        <span className="tasks-student-card__name">{group.leadName}</span>
                        {linkedKindLabel ? (
                          <span className="tasks-student-card__kind">{linkedKindLabel}</span>
                        ) : null}
                      </span>
                      {countsMarkup}
                    </span>
                    <ChevronRight size={16} className="tasks-student-card__chevron" aria-hidden="true" />
                  </button>
                );
              })()}
            </>
          )}
          <div className="tasks-student-card__toolbar">
            {(() => {
              if (unlinked) return null;
              const progress = progressLabelForLead(group.leadId, filteredTasks);
              return progress ? (
                <span
                  className="tasks-student-card__progress"
                  title="Progresso do checklist de processo automático"
                >
                  {progress}
                </span>
              ) : null;
            })()}
            <button
              type="button"
              className="tasks-student-card__add"
              onClick={() =>
                unlinked ? openNew() : navigate(`/tarefas?lead_id=${group.leadId}&new=1`)
              }
            >
              <PlusCircle size={14} aria-hidden="true" /> Nova
            </button>
          </div>
        </header>
        <div className="tasks-student-card__body">
          <div className="task-list tasks-student-card__tasks">
            {visibleTasks.map((t) =>
              renderOneTaskCard(t, { compact: true, hideLead: true, showMeta: true })
            )}
          </div>
          {canCollapse ? (
            <button
              type="button"
              className="tasks-student-card__toggle"
              onClick={() => toggleStudentTasksExpanded(group.leadId)}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={16} aria-hidden="true" />
                  Recolher tarefas
                </>
              ) : (
                <>
                  <ChevronDown size={16} aria-hidden="true" />
                  Ver mais {hiddenCount} tarefa{hiddenCount === 1 ? '' : 's'}
                </>
              )}
            </button>
          ) : null}
        </div>
      </article>
    );
  };

  function formatCreatedByLabel(task) {
    const raw = String(task?.created_by || '').trim();
    if (!raw) return '—';
    const creator = members.find(
      (m) => String(m.userId) === raw || String(m.id) === raw
    );
    return creator ? membershipPrimaryLabel(creator) : raw;
  }

  return (
    <div className="container navi-hub-page" style={{ paddingBottom: 30 }}>
      <header className="animate-in">
        <PageHeader
          className="navi-page-header--flush"
          title="Tarefas"
          subtitle="Organize pendências por aluno, lista, kanban ou calendário."
          actions={
            <>
              <Link to="/automacoes?tab=processos" className="edit-link text-small">
                Configurar processos automáticos
              </Link>
              <button type="button" className="btn-primary" onClick={openNew}>
                <PlusCircle size={16} /> Nova tarefa
              </button>
            </>
          }
        />

        <HubTabBar
          tabs={[
            { id: 'by_student', label: 'Por aluno' },
            { id: 'list', label: 'Lista' },
            { id: 'kanban', label: 'Kanban' },
            { id: 'calendar', label: 'Calendário' },
          ]}
          activeId={viewMode}
          onChange={setViewMode}
          ariaLabel="Visualização de tarefas"
          variant="secondary"
          size="sm"
          fullWidth
          className="tasks-view-toggle mb-3"
        />
        
        <div className="filter-bar task-filters">
          {['all', 'minhas', 'vencidas', 'concluidas'].map(f => (
            <button 
              key={f}
              type="button" 
              className={`filter-chip ${filters.status === f ? 'is-active' : ''}`}
              onClick={() => setFilter('status', f)}
            >
              {f === 'all' ? 'Todas' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip ${estaSemanaOn ? 'is-active' : ''}`}
            onClick={() => setEstaSemanaOn((v) => !v)}
          >
            Esta semana
          </button>
          {filters.lead_id && (
            <button 
              type="button" 
              className="filter-chip is-active"
              onClick={() => {
                setFilter('lead_id', null);
                searchParams.delete('lead_id');
                searchParams.delete('new');
                navigate('/tarefas');
              }}
            >
              Aluno: {linkableById.get(filters.lead_id)?.name || 'Desconhecido'} ✕
            </button>
          )}
        </div>
        {estaSemanaOn && semPrazoExcluidasCount > 0 ? (
          <p className="task-week-hint text-muted text-sm mt-2 mb-0" style={{ lineHeight: 1.45 }}>
            {semPrazoExcluidasCount} {semPrazoExcluidasCount === 1 ? 'tarefa sem prazo definido não aparece' : 'tarefas sem prazo definido não aparecem'} neste filtro.
          </p>
        ) : null}
      </header>

      {error ? (
        <ErrorBanner className="mt-3" message={friendlyError(error, 'load')} onRetry={() => fetchTasks(academyId, { reset: true })} />
      ) : null}

      {tasks.length >= 500 ? (
        <div className="tasks-limit-notice" role="status">
          <AlertTriangle className="tasks-limit-notice__icon" size={18} strokeWidth={2} aria-hidden />
          <span>
            Exibindo 500 tarefas — o limite máximo. Use os filtros para encontrar o que precisa.
          </span>
        </div>
      ) : null}

      <div className={`tasks-board mt-4${loading && tasks.length === 0 ? ' tasks-board--loading' : ''}`}>
        {loading && tasks.length === 0 ? (
          renderTasksLoadingSkeleton()
        ) : tasks.length === 0 ? (
          <EmptyState
            variant="default"
            tone="dashed"
            icon={CheckSquare}
            title="Nenhuma tarefa por aqui ainda"
            primaryAction={{ label: '+ Nova tarefa', onClick: openNew }}
            secondaryAction={{
              label: 'Configurar processos automáticos',
              variant: 'link',
              onClick: () => navigate('/automacoes?tab=processos'),
            }}
            role="status"
          />
        ) : filteredTasks.length === 0 && viewMode !== 'calendar' ? (
          <EmptyState
            variant="default"
            tone="dashed"
            title="Nenhuma tarefa corresponde a este filtro."
            secondaryAction={
              filters.status !== 'all' || filters.lead_id || estaSemanaOn
                ? {
                    label: 'Limpar filtros',
                    variant: 'link',
                    onClick: () => {
                      setFilter('status', 'all');
                      setFilter('lead_id', null);
                      setEstaSemanaOn(false);
                      navigate('/tarefas');
                    },
                  }
                : undefined
            }
            role="status"
            className="mt-2"
          />
        ) : viewMode === 'by_student' ? (
          <div className="tasks-by-student">
            {tasksByLead.length === 0 && !unlinkedTasksGroup ? (
              <EmptyState variant="compact" tone="dashed" title="Nenhuma tarefa neste filtro." />
            ) : (
              <>
                {unlinkedTasksGroup ? (
                  <section
                    className="tasks-by-student-section tasks-by-student-section--unlinked"
                    aria-labelledby="tasks-unlinked-heading"
                  >
                    <h3 id="tasks-unlinked-heading" className="tasks-by-student-section__title">
                      Sem aluno vinculado
                    </h3>
                    <p className="tasks-by-student-section__hint">
                      Tarefas gerais que não estão ligadas a nenhum aluno.
                    </p>
                    {renderStudentTasksGroupCard(unlinkedTasksGroup, { unlinked: true })}
                  </section>
                ) : null}
                {tasksByLead.length > 0 ? (
                  <div className="tasks-by-student-grid" role="list">
                    {tasksByLead.map((group) => renderStudentTasksGroupCard(group))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="tasks-lists-wrap">
            {renderTaskList(groupedTasks.vencidas, 'Vencidas', 'var(--danger)')}
            {renderTaskList(groupedTasks.pendentes, 'Pendentes', 'var(--text)')}
            {renderTaskList(groupedTasks.concluidas, 'Concluídas', 'var(--success)')}
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="tasks-kanban">
            {kanbanColumns.atrasadas.length > 0 ? (
            <div className="tasks-kanban-col tasks-kanban-col--late">
              <div className="tasks-kanban-col-head">
                <span className="tasks-kanban-col-title">Atrasadas</span>
                <span className="tasks-kanban-badge">{kanbanColumns.atrasadas.length}</span>
              </div>
              <TasksKanbanColumnBody
                tasks={kanbanColumns.atrasadas}
                renderCard={(t) => renderOneTaskCard(t)}
                hasMore={tasksHasMore}
                loadingMore={loadingMore}
                onLoadMore={handleLoadMoreTasks}
              />
            </div>
            ) : null}
            <div className="tasks-kanban-col tasks-kanban-col--todo">
              <div className="tasks-kanban-col-head">
                <span className="tasks-kanban-col-title">A fazer</span>
                <span className="tasks-kanban-badge">{kanbanColumns.aFazer.length}</span>
              </div>
              <div className="tasks-quick-create" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  className="form-input tasks-quick-create-input"
                  placeholder="+ Digite o título da tarefa..."
                  value={quickTitle}
                  onChange={(e) => {
                    setQuickTitle(e.target.value);
                    if (quickError) setQuickError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleQuickCreate();
                    }
                  }}
                  disabled={quickSaving}
                  aria-invalid={quickError ? true : undefined}
                />
                <button
                  type="button"
                  className="btn-primary tasks-quick-create-btn"
                  disabled={quickSaving}
                  onClick={() => void handleQuickCreate()}
                >
                  {quickSaving ? '…' : 'Criar'}
                </button>
                <button
                  type="button"
                  className="btn-outline tasks-quick-create-settings"
                  title="Configurações avançadas"
                  aria-label="Abrir formulário completo"
                  onClick={openNew}
                >
                  ⚙
                </button>
              </div>
              {quickError ? <p className="tasks-quick-create-error">{quickError}</p> : null}
              <TasksKanbanColumnBody
                tasks={kanbanColumns.aFazer}
                renderCard={(t) => renderOneTaskCard(t)}
                hasMore={tasksHasMore}
                loadingMore={loadingMore}
                onLoadMore={handleLoadMoreTasks}
              />
            </div>
            <div className="tasks-kanban-col tasks-kanban-col--done">
              <div className="tasks-kanban-col-head">
                <span className="tasks-kanban-col-title">Concluídas</span>
                <span className="tasks-kanban-badge">{kanbanColumns.concluidas.length}</span>
              </div>
              <TasksKanbanColumnBody
                tasks={kanbanColumns.concluidas}
                renderCard={(t) => renderOneTaskCard(t)}
                hasMore={tasksHasMore}
                loadingMore={loadingMore}
                onLoadMore={handleLoadMoreTasks}
              />
            </div>
          </div>
        ) : (
          <div className="tasks-cal-layout">
            <div className="tasks-cal-main">
              <div className="tasks-cal-toolbar flex flex-wrap justify-between items-center gap-2 mb-3">
                <button type="button" className="btn-secondary" onClick={() => shiftCalMonth(-1)}>
                  Mês anterior
                </button>
                <span className="tasks-cal-month-label">{calMonthLabel}</span>
                <button type="button" className="btn-secondary" onClick={() => shiftCalMonth(1)}>
                  Próximo mês
                </button>
              </div>
              <div className="tasks-cal-weekdays">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
                  <div key={w} className="tasks-cal-weekday">
                    {w}
                  </div>
                ))}
              </div>
              <div className="tasks-cal-grid">
                {calMatrix.map((cell, idx) => {
                  if (cell === null) {
                    return <div key={`e-${idx}`} className="tasks-cal-cell tasks-cal-cell--empty" />;
                  }
                  const ymd = `${calMonth.y}-${pad2(calMonth.m + 1)}-${pad2(cell)}`;
                  const now = new Date();
                  const isToday =
                    cell === now.getDate() &&
                    calMonth.m === now.getMonth() &&
                    calMonth.y === now.getFullYear();
                  const dayTasks = tasksByDueYmd[ymd] || [];
                  return (
                    <div
                      key={ymd}
                      className={`tasks-cal-cell ${isToday ? 'tasks-cal-cell--today' : ''}`}
                    >
                      <div className="tasks-cal-day-num">{cell}</div>
                      <div className="tasks-cal-day-tasks">
                        {dayTasks.map((t) => renderOneTaskCard(t, { compact: true }))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <section className="tasks-cal-semprazo" aria-label="Tarefas sem prazo">
              <h4 className="tasks-cal-semprazo-title">Sem prazo</h4>
              {semPrazoTasksForCalendar.length === 0 ? (
                <EmptyState variant="bare" title="Nenhuma tarefa sem prazo neste filtro." role="none" />
              ) : (
                <div className="tasks-cal-semprazo-grid">
                  {semPrazoTasksForCalendar.map((t) => renderOneTaskCard(t, { compact: true }))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {showModal &&
        createPortal(
        <div
          role="presentation"
          className="task-modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setShowModal(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
            className="task-modal-panel"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="task-modal-header">
              <div className="task-modal-title-row">
                <div className="task-modal-icon-wrap">
                  <ClipboardList size={16} />
                </div>
                <span id="task-modal-title" className="task-modal-title">
                  {editingTask ? 'Editar tarefa' : 'Nova tarefa'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => !saving && setShowModal(false)}
                aria-label="Fechar"
                className="task-modal-close"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="task-modal-form">
              {/* Título */}
              <div className="task-field">
                <label className="task-field-label">Título <span className="task-field-required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={form.title}
                  onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="Ex: Ligar para confirmar aula experimental"
                  autoFocus
                  required
                />
              </div>

              {/* Descrição */}
              <div className="task-field">
                <label className="task-field-label">Descrição</label>
                <textarea
                  className="form-input task-textarea"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Detalhes opcionais..."
                />
              </div>

              {/* Prazo + Responsável — grid 2 colunas */}
              <div className="task-field-row">
                <div className="task-field">
                  <label className="task-field-label">Prazo</label>
                  <DateInputField
                    type="date"
                    className="form-input"
                    value={form.due_date}
                    onChange={e => setForm({...form, due_date: e.target.value})}
                  />
                </div>
                <div className="task-field">
                  <label className="task-field-label">Responsável</label>
                  <select
                    className="form-input task-select"
                    value={form.assigned_to}
                    disabled={membersLoading}
                    onChange={e => setForm({...form, assigned_to: e.target.value})}
                  >
                    <option value="">
                      {membersLoading ? 'Carregando equipe…' : 'Sem responsável'}
                    </option>
                    {members.map((m) => (
                      <option key={m.userId || m.$id} value={m.userId}>
                        {membershipPrimaryLabel(m)}
                      </option>
                    ))}
                  </select>
                  {!effectiveTeamId && !membersLoading ? (
                    <p className="task-field-hint">Equipe não vinculada a esta academia.</p>
                  ) : null}
                  {membersError ? (
                    <p className="task-field-hint task-field-hint--error">Não foi possível carregar a equipe.</p>
                  ) : null}
                  {!membersError && effectiveTeamId && !membersLoading && members.length === 0 ? (
                    <p className="task-field-hint">
                      Nenhum membro.{' '}
                      <Link to="/equipe" className="edit-link">
                        Cadastre na Equipe
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Vincular aluno / lead */}
              <div className="task-field" ref={leadDropRef} style={{ position: 'relative' }}>
                <label className="task-field-label">{`Vincular ${terms.student.toLowerCase()} / ${contactLabel.toLowerCase()}`}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={leadSearch}
                    onChange={e => {
                      setLeadSearch(e.target.value);
                      setForm(f => ({ ...f, lead_id: '' }));
                      setShowLeadDrop(true);
                    }}
                    onFocus={() => setShowLeadDrop(true)}
                    placeholder="Buscar por nome..."
                    autoComplete="off"
                    style={form.lead_id ? { paddingRight: 32 } : {}}
                  />
                  {form.lead_id && (
                    <button
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, lead_id: '' })); setLeadSearch(''); }}
                      className="task-lead-clear"
                      aria-label="Limpar"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                {showLeadDrop && (
                  <div className="task-lead-drop">
                    {filteredLinkablePeople.slice(0, 80).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="task-lead-option"
                          onMouseDown={() => {
                            setForm(f => ({ ...f, lead_id: p.id }));
                            setLeadSearch(p.name);
                            setShowLeadDrop(false);
                          }}
                        >
                          <span className="task-lead-name">{p.name}</span>
                          <span className="task-lead-phone">
                            {p.phone || ''}
                            {p.kind === 'student' ? ` · ${terms.student}` : ` · ${contactLabel}`}
                          </span>
                        </button>
                      ))}
                    {filteredLinkablePeople.length > 80 ? (
                      <p className="task-lead-more-hint text-muted text-sm px-3 py-2 mb-0">
                        Mostrando 80 de {filteredLinkablePeople.length}. Refine a busca por nome ou telefone.
                      </p>
                    ) : null}
                    {filteredLinkablePeople.length === 0 ? (
                      <EmptyState variant="bare" title="Nenhum resultado" role="none" className="task-lead-empty-state" />
                    ) : null}
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="task-modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : editingTask ? 'Salvar alterações' : 'Criar tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
        )}

      {detailTask ? (
        <>
          <div
            role="presentation"
            className="task-drawer-backdrop"
            onMouseDown={() => setDetailTask(null)}
          />
          <aside className="task-drawer-panel" aria-labelledby="task-drawer-heading">
            <div className="task-drawer-header">
              <h2 id="task-drawer-heading" className="task-drawer-heading">
                Detalhes da tarefa
              </h2>
              <button
                type="button"
                className="task-drawer-close"
                aria-label="Fechar"
                onClick={() => setDetailTask(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="task-drawer-body">
              <div className="task-drawer-field">
                <span className="task-drawer-label">Título</span>
                <p className="task-drawer-value">{detailTask.title || '—'}</p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Descrição</span>
                <p className="task-drawer-value task-drawer-value--multiline">
                  {String(detailTask.description || '').trim() ? detailTask.description : 'Sem descrição'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Status</span>
                <div>
                  <span className={`task-drawer-badge ${detailStatusMeta(detailTask).cls}`}>
                    {detailStatusMeta(detailTask).label}
                  </span>
                </div>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Prazo</span>
                <p className="task-drawer-value">
                  {detailTask.due_date && String(detailTask.due_date).trim()
                    ? new Date(String(detailTask.due_date).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR')
                    : 'Sem prazo'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Responsável</span>
                <p className="task-drawer-value">
                  {detailTask.assigned_to
                    ? membershipPrimaryLabel(
                        members.find((m) => m.userId === detailTask.assigned_to) || {}
                      ) || detailTask.assigned_to
                    : '—'}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">{`${contactLabel} vinculado`}</span>
                {detailTask.lead_id ? (
                  <button
                    type="button"
                    className="task-drawer-link"
                    onClick={() => {
                      setDetailTask(null);
                      const path =
                        profilePathForLinkablePerson(linkableById.get(detailTask.lead_id)) ||
                        `/student/${detailTask.lead_id}`;
                      navigate(path);
                    }}
                  >
                    {detailTask.lead_name || linkableById.get(detailTask.lead_id)?.name || detailTask.lead_id}
                  </button>
                ) : (
                  <p className="task-drawer-value">—</p>
                )}
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Criado por</span>
                <p className="task-drawer-value">
                  {formatCreatedByLabel(detailTask)}
                  {detailTask.created_at
                    ? ` · ${new Date(detailTask.created_at).toLocaleString('pt-BR')}`
                    : ''}
                </p>
              </div>
              <div className="task-drawer-field">
                <span className="task-drawer-label">Atualizado em</span>
                <p className="task-drawer-value">
                  {detailTask.updated_at
                    ? new Date(detailTask.updated_at).toLocaleString('pt-BR')
                    : '—'}
                </p>
              </div>
            </div>
            <div className="task-drawer-footer">
              <button type="button" className="btn-primary task-drawer-edit" onClick={openEditFromDetail}>
                Editar
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <CollectionResultModal
        open={Boolean(collectionModalTask)}
        stageLabel={parseCollectionTaskDescription(collectionModalTask?.description)?.stage || ''}
        saving={collectionSaving}
        onCancel={() => !collectionSaving && setCollectionModalTask(null)}
        onConfirm={handleCollectionConfirm}
      />

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes tasksSkeletonShimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        .tasks-skeleton-sr {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        .tasks-board--loading { position: relative; min-height: 280px; }
        .tasks-skeleton-root {
          pointer-events: none;
          display: flex; flex-direction: column; gap: 28px;
          padding: 4px 0 8px;
        }
        .tasks-skeleton-section { display: flex; flex-direction: column; gap: 12px; }
        .tasks-skeleton-group-title {
          height: 13px; width: 140px; border-radius: 6px;
          background: linear-gradient(90deg, rgba(148,163,184,0.16) 25%, rgba(148,163,184,0.3) 50%, rgba(148,163,184,0.16) 75%);
          background-size: 200% 100%;
          animation: tasksSkeletonShimmer 1.15s ease-in-out infinite;
        }
        .tasks-skeleton-list { display: flex; flex-direction: column; gap: 8px; }
        .tasks-skeleton-card {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .tasks-skeleton-check {
          flex-shrink: 0; width: 16px; height: 16px; margin-top: 3px; border-radius: 4px;
          border: 1px solid var(--border-mid);
          background: linear-gradient(90deg, rgba(148,163,184,0.1) 25%, rgba(148,163,184,0.2) 50%, rgba(148,163,184,0.1) 75%);
          background-size: 200% 100%;
          animation: tasksSkeletonShimmer 1.15s ease-in-out infinite;
        }
        .tasks-skeleton-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
        .tasks-skeleton-line {
          height: 12px; border-radius: 6px;
          background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.26) 50%, rgba(148,163,184,0.12) 75%);
          background-size: 200% 100%;
          animation: tasksSkeletonShimmer 1.15s ease-in-out infinite;
        }
        .tasks-skeleton-line--title { width: 78%; max-width: 420px; height: 14px; }
        .tasks-skeleton-line--sub { width: 52%; max-width: 280px; }
        .tasks-skeleton-line--short { width: 38%; max-width: 200px; }
        .tasks-skeleton-badges { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .tasks-skeleton-pill {
          height: 22px; width: 72px; border-radius: 999px;
          background: linear-gradient(90deg, rgba(148,163,184,0.1) 25%, rgba(148,163,184,0.22) 50%, rgba(148,163,184,0.1) 75%);
          background-size: 200% 100%;
          animation: tasksSkeletonShimmer 1.15s ease-in-out infinite;
        }
        .tasks-skeleton-pill--narrow { width: 52px; }
        .tasks-skeleton-actions {
          display: flex; flex-direction: row; gap: 4px; padding-top: 2px; opacity: 0.85;
        }
        .tasks-skeleton-icon {
          width: 26px; height: 26px; border-radius: 8px;
          border: 1px solid var(--border-light);
          background: rgba(148,163,184,0.08);
        }
        @media (prefers-reduced-motion: reduce) {
          .tasks-skeleton-group-title,
          .tasks-skeleton-check,
          .tasks-skeleton-line,
          .tasks-skeleton-pill {
            animation: none;
            background: rgba(148,163,184,0.18);
          }
        }

        /* ── Lista de tarefas ── */
        .tasks-limit-notice {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          background: var(--color-background-warning, var(--warn-bg));
          color: var(--color-text-warning, var(--warn-text));
          font-size: 13px;
          font-weight: 500;
          line-height: 1.45;
          border: 1px solid rgba(138, 107, 26, 0.2);
        }
        .tasks-limit-notice__icon {
          flex-shrink: 0;
          margin-top: 1px;
          color: var(--color-text-warning, var(--warn-text));
          opacity: 0.95;
        }
        .task-filters { display: flex; gap: 8px; flex-wrap: wrap; }
        .task-lead-empty-state { padding: 8px 10px !important; }
        .task-lead-empty-state .navi-empty__title { font-size: 12px !important; font-weight: 500 !important; }
        .tasks-lists-wrap { display: flex; flex-direction: column; gap: 24px; }
        .task-group-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
        .task-list { display: flex; flex-direction: column; gap: 8px; }
        .task-card { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); transition: var(--transition); }
        .task-card:hover { border-color: var(--border-mid); }
        .task-card.done { opacity: 0.7; background: var(--surface-hover); }
        .task-checkbox-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          margin-top: 3px;
          flex-shrink: 0;
        }
        .task-checkbox-spinner { color: var(--v500); }
        .task-checkbox { margin-top: 0; width: 16px; height: 16px; cursor: pointer; accent-color: var(--success); }
        .task-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; cursor: pointer; }
        .task-title { font-weight: 600; font-size: 14px; color: var(--text); }
        .task-title.line-through { text-decoration: line-through; color: var(--text-muted); }
        .task-meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .task-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--border-light); color: var(--text-secondary); font-weight: 500; }
        .task-badge.text-danger { color: var(--danger); background: var(--danger-light); }
        .lead-badge { cursor: pointer; }
        .lead-badge:hover { background: var(--accent-light); color: var(--accent); }
        .assign-badge { width: 22px; height: 22px; justify-content: center; border-radius: 50%; padding: 0; font-size: 9px; font-weight: 800; background: var(--accent-light); color: var(--accent); border: 1px solid var(--accent); }
        .task-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s; }
        .task-card:hover .task-actions { opacity: 1; }
        .task-action-btn { background: transparent; border: none; padding: 6px; border-radius: 6px; cursor: pointer; color: var(--text-muted); }
        .task-action-btn:hover { background: var(--border-light); color: var(--text); }
        .task-action-btn.text-danger:hover { background: var(--danger-light); color: var(--danger); }

        /* ── Modal ── */
        .task-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0, 4, 53, 0.55);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; padding: 16px;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        .task-modal-panel {
          background: var(--white);
          border-radius: 20px;
          width: 100%; max-width: 480px;
          margin: auto;
          flex-shrink: 0;
          box-shadow: 0 24px 60px rgba(0, 4, 53, 0.18), 0 2px 8px rgba(108, 71, 216,0.08);
          border: 0.5px solid var(--border-light);
          max-height: min(92vh, calc(100dvh - 32px)); overflow-y: auto;
        }
        .task-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px 18px;
          border-bottom: 0.5px solid var(--v100);
        }
        .task-modal-title-row { display: flex; align-items: center; gap: 10px; }
        .task-modal-icon-wrap {
          width: 32px; height: 32px; border-radius: 9px;
          background: var(--v50); color: var(--v500);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .task-modal-title { font-size: 15px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
        .task-modal-close {
          width: 32px; height: 32px; min-height: 32px; padding: 0;
          background: transparent; border: 0.5px solid var(--v100);
          border-radius: 8px; color: var(--faint);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .task-modal-close:hover { background: var(--v50); color: var(--mid); border-color: var(--v200); }

        /* ── Formulário ── */
        .task-modal-form {
          display: flex; flex-direction: column; gap: 18px;
          padding: 24px;
        }
        .task-field { display: flex; flex-direction: column; gap: 6px; }
        .task-field-label {
          font-family: var(--ff-mono);
          font-size: 10px; font-weight: 400;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: var(--mid);
        }
        .task-field-required { color: var(--c500); }
        .task-textarea { resize: vertical; min-height: 88px; font-family: var(--ff-ui) !important; }
        .task-select { cursor: pointer; }
        .task-modal-panel select.form-input,
        .task-modal-panel select.task-select {
          appearance: auto;
          -webkit-appearance: menulist;
          color-scheme: light;
          background-color: #ffffff !important;
          color: var(--ink, #0e0d1a) !important;
          -webkit-text-fill-color: var(--ink, #0e0d1a);
          border: 1px solid var(--v100);
        }
        .task-modal-panel select.form-input option,
        .task-modal-panel select.task-select option {
          background-color: #ffffff;
          color: #0e0d1a;
        }
        .task-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .task-field-hint {
          margin: 0;
          font-size: 11px;
          line-height: 1.35;
          color: var(--mid);
        }
        .task-field-hint--error { color: var(--danger, #dc2626); }

        /* ── Busca de lead ── */
        .task-lead-clear {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; padding: 2px;
          color: var(--faint); display: flex; align-items: center;
          min-height: auto; width: auto; border-radius: 4px;
        }
        .task-lead-clear:hover { color: var(--mid); }
        .task-lead-drop {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 300;
          background: var(--white);
          border: 0.5px solid var(--border-light);
          border-radius: 12px;
          box-shadow: 0 8px 28px rgba(0, 4, 53, 0.12);
          max-height: 220px; overflow-y: auto;
          padding: 6px;
        }
        .task-lead-option {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 9px 12px;
          background: none; border: none; border-radius: 8px;
          cursor: pointer; text-align: left; gap: 8px;
          min-height: auto;
          transition: background 0.1s;
        }
        .task-lead-option:hover { background: var(--v50); }
        .task-lead-name { font-size: 13px; font-weight: 500; color: var(--ink); }
        .task-lead-phone { font-size: 11px; color: var(--faint); font-family: var(--ff-mono); }

        /* ── Footer do modal ── */
        .task-modal-footer {
          display: flex; justify-content: flex-end; gap: 8px;
          padding-top: 8px;
          border-top: 0.5px solid var(--v100);
          margin-top: 2px;
        }
        .task-modal-footer .btn-outline { min-height: 38px; font-size: 13px; padding: 0 16px; }
        .task-modal-footer .btn-primary { min-height: 38px; font-size: 13px; padding: 0 20px; }

        .tasks-kanban {
          display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px;
          align-items: stretch;
        }
        @media (max-width: 900px) {
          .tasks-kanban { grid-template-columns: 1fr; }
        }
        .tasks-kanban-col {
          border: 1px solid var(--border-mid); border-radius: var(--radius-sm);
          background: var(--surface); overflow: hidden; display: flex; flex-direction: column;
          min-height: 120px;
        }
        .tasks-kanban-col-head {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 12px 14px; border-bottom: 1px solid var(--border);
        }
        .tasks-kanban-col--late .tasks-kanban-col-head { background: rgba(220, 38, 38, 0.08); }
        .tasks-kanban-col--todo .tasks-kanban-col-head { background: rgba(108, 71, 216, 0.08); }
        .tasks-kanban-col--done .tasks-kanban-col-head { background: rgba(22, 163, 74, 0.1); }
        .tasks-kanban-col-title { font-size: 13px; font-weight: 700; color: var(--ink); }
        .tasks-quick-create {
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 0 10px 10px;
          flex-wrap: wrap;
        }
        .tasks-quick-create-input { flex: 1 1 160px; min-width: 0; min-height: 38px; font-size: 13px; }
        .tasks-quick-create-btn { flex-shrink: 0; min-height: 38px; padding: 6px 12px; font-size: 13px; }
        .tasks-quick-create-settings { flex-shrink: 0; min-width: 38px; min-height: 38px; padding: 0 10px; }
        .tasks-quick-create-error {
          margin: -4px 10px 8px;
          font-size: 12px;
          color: var(--danger);
          line-height: 1.35;
        }
        .tasks-kanban-col--late .tasks-kanban-col-title { color: var(--danger); }
        .tasks-kanban-col--todo .tasks-kanban-col-title { color: var(--v500); }
        .tasks-kanban-col--done .tasks-kanban-col-title { color: var(--success-text); }
        .tasks-kanban-badge {
          font-size: 11px; font-weight: 800; min-width: 22px; height: 22px; padding: 0 7px;
          border-radius: 99px; background: var(--white); border: 1px solid var(--border-mid);
          display: inline-flex; align-items: center; justify-content: center; color: var(--ink);
        }
        .tasks-kanban-col-body { padding: 10px; flex: 1; overflow-y: auto; max-height: min(62vh, 520px); }

        .tasks-cal-layout {
          display: flex;
          flex-direction: column;
          gap: 22px;
          align-items: stretch;
        }
        .tasks-cal-main { width: 100%; min-width: 0; overflow-x: auto; }
        .tasks-cal-month-label {
          font-size: 15px; font-weight: 700; color: var(--ink);
          text-transform: capitalize;
        }
        .tasks-cal-weekdays {
          display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-bottom: 6px;
        }
        .tasks-cal-weekday {
          font-size: 10px; font-weight: 700; text-align: center; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .tasks-cal-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(100px, 1fr));
          gap: 8px;
        }
        .tasks-cal-cell {
          border: 1px solid var(--border-mid); border-radius: 10px; background: var(--surface);
          min-height: 118px; padding: 8px 8px 10px; display: flex; flex-direction: column;
          min-width: 0;
        }
        .tasks-cal-cell--empty { background: transparent; border: none; min-height: 0; }
        .tasks-cal-cell--today {
          border-color: var(--v500); box-shadow: 0 0 0 1px rgba(108, 71, 216, 0.25);
          background: rgba(108, 71, 216, 0.04);
        }
        .tasks-cal-day-num {
          font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;
        }
        .tasks-cal-cell--today .tasks-cal-day-num {
          width: 26px; height: 26px; border-radius: 50%; background: var(--petroleo); color: #fff;
          display: flex; align-items: center; justify-content: center;
        }
        .tasks-cal-day-tasks {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-height: 0;
          min-width: 0;
          width: 100%;
          overflow-x: hidden;
          overflow-y: auto;
        }
        /* Grid em vez de flex em linha: colunas do calendário são estreitas; checkbox+ações
           consumiam quase toda a largura e o título ficava com ~0px (uma letra por linha). */
        .tasks-cal-day-tasks .task-card {
          display: grid;
          grid-template-columns: auto 1fr auto;
          grid-template-rows: auto auto;
          column-gap: 8px;
          row-gap: 4px;
          align-items: start;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .tasks-cal-day-tasks .task-checkbox {
          grid-column: 1;
          grid-row: 1;
          margin-top: 2px;
        }
        .tasks-cal-day-tasks .task-actions {
          grid-column: 3;
          grid-row: 1;
          justify-self: end;
        }
        .tasks-cal-day-tasks .task-content {
          grid-column: 1 / -1;
          grid-row: 2;
          min-width: 0;
          width: 100%;
        }
        .tasks-cal-day-tasks .task-title {
          display: block;
          width: 100%;
          min-width: 0;
          white-space: normal;
          word-break: normal;
          overflow-wrap: break-word;
          line-height: 1.35;
        }
        .tasks-cal-semprazo {
          width: 100%;
          border: 1px solid var(--border-mid);
          border-radius: var(--radius-sm);
          background: var(--surface);
          padding: 16px 18px;
        }
        .tasks-cal-semprazo-title {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 12px;
          color: var(--text-secondary);
        }
        .tasks-cal-semprazo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 8px;
        }
        .tasks-cal-semprazo-grid .task-card { min-width: 0; }

        .task-card--compact { padding: 8px 10px; gap: 8px; }
        .task-card--compact .task-checkbox { margin-top: 2px; width: 14px; height: 14px; }
        .task-card--compact .task-title { font-size: 13px; line-height: 1.35; }
        .task-card--compact .task-actions { opacity: 1; }
        .task-linked-person { margin-top: 4px; }
        .task-linked-person--compact { margin-top: 3px; }
        .task-badge--compact { font-size: 10px; padding: 2px 5px; }
        .task-meta--compact { gap: 6px; }
        .task-meta--compact .task-badge { font-size: 10px; padding: 2px 5px; }

        .tasks-by-student { width: 100%; }
        .tasks-by-student-section--unlinked {
          margin-bottom: 18px;
        }
        .tasks-by-student-section__title {
          margin: 0 0 4px;
          font-size: 13px;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: 0.01em;
        }
        .tasks-by-student-section__hint {
          margin: 0 0 10px;
          font-size: 12px;
          line-height: 1.45;
          color: var(--text-muted);
        }
        .tasks-by-student-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 640px) {
          .tasks-by-student-grid { grid-template-columns: 1fr; }
        }
        .tasks-student-card {
          border: 1px solid var(--border-mid);
          border-radius: var(--radius-sm);
          background: var(--surface);
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 4, 53, 0.04);
        }
        .tasks-student-card__head {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(180deg, rgba(108, 71, 216, 0.05) 0%, transparent 100%);
        }
        .tasks-student-card__profile {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          min-height: auto;
        }
        .tasks-student-card__profile-static {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
        }
        .tasks-student-card__profile:hover .tasks-student-card__name { color: var(--v500); }
        .tasks-student-card__profile:hover .tasks-student-card__chevron { color: var(--v500); transform: translateX(2px); }
        .tasks-student-card__avatar {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
          color: var(--v700);
          background: var(--v50);
          border: 1px solid rgba(108, 71, 216, 0.18);
        }
        .tasks-student-card__avatar--unlinked {
          color: var(--text-muted);
          background: var(--surface-2, var(--surface));
          border-color: var(--border-mid);
        }
        .tasks-student-card--unlinked .tasks-student-card__head {
          background: linear-gradient(180deg, rgba(0, 4, 53, 0.03) 0%, transparent 100%);
        }
        .tasks-student-card__identity {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .tasks-student-card__name-row {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .tasks-student-card__name {
          font-size: 14px;
          font-weight: 700;
          color: var(--ink);
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          transition: color 0.15s;
          min-width: 0;
        }
        .tasks-student-card__kind {
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: var(--text-muted);
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--surface-hover);
          border: 1px solid var(--border);
        }
        .tasks-student-card__counts {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-secondary);
          line-height: 1.35;
        }
        .tasks-student-card__overdue { color: var(--danger); font-weight: 600; }
        .tasks-student-card__chevron {
          flex-shrink: 0;
          color: var(--text-muted);
          transition: transform 0.15s, color 0.15s;
        }
        .tasks-student-card__toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tasks-student-card__progress {
          font-size: 11px;
          font-weight: 700;
          color: var(--v700);
          background: var(--v50);
          border: 1px solid rgba(108, 71, 216, 0.15);
          border-radius: 999px;
          padding: 3px 10px;
          line-height: 1.2;
        }
        .tasks-student-card__add {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-left: auto;
          padding: 5px 10px;
          border-radius: 8px;
          border: 1px solid var(--border-mid);
          background: var(--white);
          color: var(--v600);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          min-height: auto;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        .tasks-student-card__add:hover {
          border-color: var(--v500);
          background: var(--v50);
          color: var(--v700);
        }
        .tasks-student-card__body { padding: 10px 12px 12px; }
        .tasks-student-card__tasks { gap: 6px; }
        .tasks-student-card__tasks .task-card {
          background: var(--white);
          border-color: var(--border-light);
        }
        .tasks-student-card__tasks .task-card:hover { border-color: var(--border-mid); }
        .tasks-student-card__toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          margin-top: 8px;
          padding: 8px 12px;
          border: 1px dashed var(--border-mid);
          border-radius: 8px;
          background: transparent;
          color: var(--v600);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          min-height: auto;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .tasks-student-card__toggle:hover {
          background: var(--v50);
          border-color: var(--v500);
          color: var(--v700);
        }
        .tasks-student-card--collapsed .tasks-student-card__body {
          padding-bottom: 10px;
        }

        .task-drawer-backdrop {
          position: fixed; inset: 0; z-index: 9500;
          background: rgba(0, 4, 53, 0.35);
        }
        .task-drawer-panel {
          position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw);
          z-index: 9600; background: var(--surface);
          box-shadow: -8px 0 40px rgba(0, 4, 53, 0.12);
          border-left: 1px solid var(--border-mid);
          display: flex; flex-direction: column;
          animation: taskDrawerIn 0.22s ease-out;
        }
        @keyframes taskDrawerIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .task-drawer-panel { animation: none; }
        }
        .task-drawer-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px; border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .task-drawer-heading { font-size: 16px; font-weight: 700; margin: 0; color: var(--ink); }
        .task-drawer-close {
          width: 36px; height: 36px; border-radius: var(--radius-sm);
          border: 1px solid var(--border-light); background: var(--surface);
          color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .task-drawer-close:hover { border-color: var(--border-mid); color: var(--ink); }
        .task-drawer-body { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 16px; }
        .task-drawer-field { display: flex; flex-direction: column; gap: 4px; }
        .task-drawer-label {
          font-family: var(--ff-mono); font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--mid);
        }
        .task-drawer-value { margin: 0; font-size: 14px; color: var(--ink); line-height: 1.45; }
        .task-drawer-value--multiline { white-space: pre-wrap; }
        .task-drawer-badge {
          display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 99px;
          font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;
        }
        .task-drawer-badge--pending { background: var(--v50); color: var(--v700); }
        .task-drawer-badge--late { background: var(--danger-light); color: var(--danger); }
        .task-drawer-badge--done { background: var(--success-light); color: var(--success-text); }
        .task-drawer-link {
          background: none; border: none; padding: 0; margin: 0;
          font-size: 14px; font-weight: 600; color: var(--v500); cursor: pointer; text-align: left;
          text-decoration: underline; font-family: inherit;
        }
        .task-drawer-link:hover { color: var(--v700); }
        .task-drawer-footer {
          padding: 14px 18px; border-top: 1px solid var(--border); flex-shrink: 0;
        }
        .task-drawer-edit { width: 100%; justify-content: center; }
      `}} />

      <ConfirmDialog
        open={Boolean(deleteConfirmId)}
        title="Excluir tarefa?"
        description="Tem certeza que deseja excluir esta tarefa?"
        confirmLabel="Excluir"
        onConfirm={() => void runDeleteConfirmed()}
        onClose={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}
