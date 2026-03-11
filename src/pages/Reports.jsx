import React, { useMemo, useState } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { Calendar, Download, TrendingUp, TrendingDown, Users, CheckCircle2, XCircle, UserPlus } from 'lucide-react';

const presets = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês anterior' },
  { key: 'custom', label: 'Personalizado' },
];

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const startOfWeek = (d) => {
  const dd = new Date(d); const day = dd.getDay(); const diff = (day + 6) % 7;
  dd.setDate(dd.getDate() - diff); dd.setHours(0,0,0,0);
  return dd;
};
const endOfWeek = (d) => { const dd = startOfWeek(d); dd.setDate(dd.getDate() + 6); dd.setHours(23,59,59,999); return dd; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const parseYMD = (s) => { if (!s) return null; const [Y,M,D] = s.split('-').map(Number); return new Date(Y, (M||1)-1, D||1); };
const inRange = (ts, a, b) => { if (!ts) return false; const t = new Date(ts).getTime(); return t >= a.getTime() && t <= b.getTime(); };

const Card = ({ title, value, variation, icon, color }) => {
  const isUp = (typeof variation === 'number') ? variation >= 0 : true;
  return (
    <div className="card kpi-card">
      <div className="kpi-head">
        <span className="kpi-title">{title}</span>
        <span className="kpi-icon" style={{ background: `var(--${color}-light)` }}>{icon}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {typeof variation === 'number' && (
        <div className={`kpi-var ${isUp ? 'up' : 'down'}`}>
          {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {variation}%
        </div>
      )}
    </div>
  );
};

const BarChart = ({ series, height = 180 }) => {
  const padding = 24;
  const w = Math.max(320, series.length * 48 + padding * 2);
  const max = Math.max(1, Math.max(...series.map(s => s.value || 0)));
  const barW = 32;
  const gap = 16;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} style={{ display: 'block' }}>
      <line x1={padding} y1={height - padding} x2={w - padding} y2={height - padding} stroke="var(--border)" />
      {series.map((s, i) => {
        const x = padding + i * (barW + gap);
        const h = Math.round(((s.value || 0) / max) * (height - padding * 2));
        const y = height - padding - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx="6" fill="var(--accent)" opacity="0.9" />
            <text x={x + barW / 2} y={height - padding + 14} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{s.label}</text>
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">{s.value}</text>
          </g>
        );
      })}
    </svg>
  );
};

const Reports = () => {
  const { leads } = useLeadStore();
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(ymd(startOfMonth(new Date())));
  const [to, setTo] = useState(ymd(endOfMonth(new Date())));
  const [chartMetric, setChartMetric] = useState('new'); // 'new' | 'scheduled' | 'converted'
  const [chartMode, setChartMode] = useState('weekly'); // 'weekly' | 'monthly'

  const range = useMemo(() => {
    const now = new Date();
    if (preset === 'today') return { from: ymd(now), to: ymd(now) };
    if (preset === 'week') return { from: ymd(startOfWeek(now)), to: ymd(endOfWeek(now)) };
    if (preset === 'month') return { from: ymd(startOfMonth(now)), to: ymd(endOfMonth(now)) };
    if (preset === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: ymd(startOfMonth(d)), to: ymd(endOfMonth(d)) };
    }
    return { from, to };
  }, [preset, from, to]);

  const { metrics, filteredLeads } = useMemo(() => {
    const fromD = parseYMD(range.from);
    const toD = parseYMD(range.to);
    const prevFromD = (() => {
      if (preset === 'today') { const d = new Date(fromD); d.setDate(d.getDate() - 1); return d; }
      if (preset === 'week') { const d = new Date(fromD); d.setDate(d.getDate() - 7); return d; }
      if (preset === 'month' || preset === 'last_month') {
        const d = new Date(fromD.getFullYear(), fromD.getMonth() - 1, 1);
        return startOfMonth(d);
      }
      const span = Math.max(1, Math.ceil((toD - fromD) / 86400000));
      const d = new Date(fromD); d.setDate(d.getDate() - span);
      return d;
    })();
    const prevToD = (() => {
      if (preset === 'today') { const d = new Date(toD); d.setDate(d.getDate() - 1); return d; }
      if (preset === 'week') { const d = new Date(toD); d.setDate(d.getDate() - 1); return d; }
      if (preset === 'month' || preset === 'last_month') {
        return endOfMonth(new Date(prevFromD));
      }
      const span = Math.max(1, Math.ceil((toD - fromD) / 86400000));
      const d = new Date(toD); d.setDate(d.getDate() - span);
      return d;
    })();

    const within = (ts) => inRange(ts, fromD, toD);
    const withinPrev = (ts) => inRange(ts, prevFromD, prevToD);
    const stageEventWithin = (lead, toStatus, cmp) => {
      const evs = Array.isArray(lead.notes) ? lead.notes : [];
      const hit = evs.find(e => e && e.type === 'stage_change' && e.to === toStatus && cmp(e.at || e.date));
      if (hit) return true;
      if (lead.status === toStatus && lead.statusChangedAt && cmp(lead.statusChangedAt)) return true;
      return false;
    };

    const newLeads = leads.filter(l => within(l.createdAt));
    const newLeadsPrev = leads.filter(l => withinPrev(l.createdAt));
    const scheduled = leads.filter(l => {
      const d = parseYMD(l.scheduledDate);
      return d && inRange(d, fromD, toD);
    });
    const scheduledPrev = leads.filter(l => {
      const d = parseYMD(l.scheduledDate);
      return d && inRange(d, prevFromD, prevToD);
    });
    const converted = leads.filter(l => stageEventWithin(l, LEAD_STATUS.CONVERTED, within));
    const convertedPrev = leads.filter(l => stageEventWithin(l, LEAD_STATUS.CONVERTED, withinPrev));
    const showed = leads.filter(l => stageEventWithin(l, LEAD_STATUS.COMPLETED, within));
    const showedPrev = leads.filter(l => stageEventWithin(l, LEAD_STATUS.COMPLETED, withinPrev));
    const missed = leads.filter(l => stageEventWithin(l, LEAD_STATUS.MISSED, within));
    const missedPrev = leads.filter(l => stageEventWithin(l, LEAD_STATUS.MISSED, withinPrev));

    const pctVar = (cur, prev) => {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    };

    return {
      metrics: {
        newLeads: { cur: newLeads.length, prev: newLeadsPrev.length, var: pctVar(newLeads.length, newLeadsPrev.length) },
        scheduled: { cur: scheduled.length, prev: scheduledPrev.length, var: pctVar(scheduled.length, scheduledPrev.length) },
        converted: { cur: converted.length, prev: convertedPrev.length, var: pctVar(converted.length, convertedPrev.length) },
        showed: { cur: showed.length, prev: showedPrev.length, var: pctVar(showed.length, showedPrev.length) },
        missed: { cur: missed.length, prev: missedPrev.length, var: pctVar(missed.length, missedPrev.length) },
        conversionRate: {
          cur: newLeads.length ? Math.round((converted.length / newLeads.length) * 100) : 0,
          prev: newLeadsPrev.length ? Math.round((convertedPrev.length / newLeadsPrev.length) * 100) : 0,
          var: pctVar(
            newLeads.length ? Math.round((converted.length / newLeads.length) * 100) : 0,
            newLeadsPrev.length ? Math.round((convertedPrev.length / newLeadsPrev.length) * 100) : 0
          )
        }
      },
      filteredLeads: newLeads,
    };
  }, [leads, range.from, range.to, preset]);

  const exportCSV = () => {
    const rows = (filteredLeads || []).map(l => ({
      nome: l.name || '',
      telefone: l.phone || '',
      origem: l.origin || '',
      status: l.status || '',
      data_aula: l.scheduledDate || '',
      horario: l.scheduledTime || '',
      criado_em: l.createdAt ? new Date(l.createdAt).toISOString() : '',
    }));
    const header = Object.keys(rows[0] || { nome:'', telefone:'', origem:'', status:'', data_aula:'', horario:'', criado_em:'' });
    const csv = [
      header.join(';'),
      ...rows.map(r => header.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'relatorio-leads.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="flex justify-between items-center">
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 2 }}>Relatórios</h1>
          <p className="text-small">Indicadores de desempenho com filtros por período</p>
        </div>
        <button className="btn-secondary" onClick={exportCSV}>
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      <div className="card mt-4 filters-card" style={{ padding: 14 }}>
        <div className="filters-row">
          <Calendar size={16} />
          {presets.map(p => (
            <button key={p.key} className={`filter-chip ${preset === p.key ? 'active' : ''}`} onClick={() => setPreset(p.key)}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="custom-range">
              <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} />
              <span>até</span>
              <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div className="kpi-grid mt-4">
        <Card title="Novos leads" value={metrics.newLeads.cur} variation={metrics.newLeads.var} icon={<UserPlus size={16} color="var(--accent)" />} color="accent" />
        <Card title="Aulas agendadas" value={metrics.scheduled.cur} variation={metrics.scheduled.var} icon={<Calendar size={16} color="var(--warning)" />} color="warning" />
        <Card title="Compareceram" value={metrics.showed.cur} variation={metrics.showed.var} icon={<CheckCircle2 size={16} color="var(--success)" />} color="success" />
        <Card title="Não compareceram" value={metrics.missed.cur} variation={metrics.missed.var} icon={<XCircle size={16} color="var(--danger)" />} color="danger" />
        <Card title="Matrículas" value={metrics.converted.cur} variation={metrics.converted.var} icon={<Users size={16} color="var(--purple)" />} color="purple" />
        <Card title="Taxa de conversão" value={`${metrics.conversionRate.cur}%`} variation={metrics.conversionRate.var} icon={<TrendingUp size={16} color="var(--text)" />} color="accent" />
      </div>

      <div className="card mt-4">
        <div className="evo-header">
          <h3 className="evo-title">Evolução</h3>
          <div className="evo-controls">
            <div className="evo-group">
              <span className="text-small">Métrica:</span>
              <div className="chip-row">
                <button className={`filter-chip ${chartMetric === 'new' ? 'active' : ''}`} onClick={() => setChartMetric('new')}>Novos leads</button>
                <button className={`filter-chip ${chartMetric === 'scheduled' ? 'active' : ''}`} onClick={() => setChartMetric('scheduled')}>Agendados</button>
                <button className={`filter-chip ${chartMetric === 'converted' ? 'active' : ''}`} onClick={() => setChartMetric('converted')}>Matrículas</button>
              </div>
            </div>
            <div className="evo-group">
              <span className="text-small">Período:</span>
              <div className="chip-row">
                <button className={`filter-chip ${chartMode === 'weekly' ? 'active' : ''}`} onClick={() => setChartMode('weekly')}>Semanal</button>
                <button className={`filter-chip ${chartMode === 'monthly' ? 'active' : ''}`} onClick={() => setChartMode('monthly')}>Mensal</button>
              </div>
            </div>
          </div>
        </div>
        {(() => {
          const mkRange = () => {
            if (chartMode === 'weekly') {
              const now = new Date();
              const arr = [];
              for (let i = 7; i >= 0; i--) {
                const start = startOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7));
                const end = endOfWeek(start);
                const label = `${String(start.getDate()).padStart(2,'0')}/${String(start.getMonth()+1).padStart(2,'0')}`;
                arr.push({ start, end, label });
              }
              return arr;
            }
            // monthly
            const now = new Date();
            const arr = [];
            for (let i = 5; i >= 0; i--) {
              const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
              const end = endOfMonth(start);
              const label = `${String(start.getMonth()+1).padStart(2,'0')}/${String(start.getFullYear()).slice(-2)}`;
              arr.push({ start, end, label });
            }
            return arr;
          };
          const buckets = mkRange();
          const within = (ts, a, b) => inRange(ts, a, b);
          const parseYMD = (s) => { if (!s) return null; const [Y,M,D] = s.split('-').map(Number); return new Date(Y,(M||1)-1,D||1); };
          const stageEventWithin = (lead, toStatus, a, b) => {
            const evs = Array.isArray(lead.notes) ? lead.notes : [];
            const hit = evs.find(e => e && e.type === 'stage_change' && e.to === toStatus && within(e.at || e.date, a, b));
            if (hit) return true;
            if (lead.status === toStatus && lead.statusChangedAt && within(lead.statusChangedAt, a, b)) return true;
            return false;
          };
          const series = buckets.map(({ start, end, label }) => {
            let value = 0;
            if (chartMetric === 'new') {
              value = leads.filter(l => within(l.createdAt, start, end)).length;
            } else if (chartMetric === 'scheduled') {
              value = leads.filter(l => { const d = parseYMD(l.scheduledDate); return d && within(d, start, end); }).length;
            } else {
              value = leads.filter(l => stageEventWithin(l, LEAD_STATUS.CONVERTED, start, end)).length;
            }
            return { label, value };
          });
          return <BarChart series={series} />;
        })()}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; }
        @media (min-width: 1400px) { .kpi-grid { grid-template-columns: repeat(6, minmax(0,1fr)); } }
        @media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        @media (max-width: 640px) { .kpi-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        .kpi-card { padding: 14px; }
        .kpi-head { display: flex; align-items: center; justify-content: space-between; }
        .kpi-title { font-size: 0.82rem; color: var(--text-secondary); font-weight: 700; }
        .kpi-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .kpi-value { font-size: 1.6rem; font-weight: 800; margin-top: 6px; }
        .kpi-var { margin-top: 6px; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; }
        .kpi-var.up { color: var(--success); }
        .kpi-var.down { color: var(--danger); }
        .filters-card { margin-top: 12px; }
        .filters-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .filters-row .filter-chip { margin-right: 0; }
        .custom-range { display: inline-flex; align-items: center; gap: 8px; }
        .evo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .evo-title { margin: 0; margin-right: 12px; }
        .evo-controls { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .evo-group { display: inline-flex; align-items: center; gap: 8px; }
        .chip-row { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .filter-chip {
          min-height: 30px; padding: 4px 10px; border-radius: var(--radius-full); 
          border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary);
          font-size: 0.78rem; font-weight: 700;
        }
        .filter-chip.active { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
      `}} />
    </div>
  );
};

export default Reports;
