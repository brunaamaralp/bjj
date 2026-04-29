import React, { useState, useEffect } from 'react';
import { useControlIdStore } from '../store/useControlIdStore';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { Wifi, WifiOff, RefreshCw, Settings, CheckCircle2, Clock, User, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatDate(iso) {
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso || '-';
  }
}

export default function Attendance() {
  const { academyId } = useLeadStore();
  const addToast = useUiStore((s) => s.addToast);

  const {
    deviceIp, deviceUsername, devicePassword,
    connected, connecting, syncing, lastSync, error, attendance,
    setConfig, testConnection, syncAttendance, fetchAttendance,
  } = useControlIdStore();

  const [showSettings, setShowSettings] = useState(!deviceIp);
  const [form, setForm] = useState({ ip: deviceIp, username: deviceUsername, password: devicePassword });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (academyId && deviceIp) {
      fetchAttendance(academyId).catch(() => {});
    }
  }, [academyId, deviceIp]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveConfig(e) {
    e.preventDefault();
    if (!form.ip.trim()) return;
    setConfig(form.ip.trim(), form.username.trim() || 'admin', form.password || 'admin');
    setShowSettings(false);
  }

  async function handleConnect() {
    const ok = await testConnection();
    if (ok) {
      addToast({ type: 'success', message: 'Equipamento conectado com sucesso' });
    } else {
      addToast({ type: 'error', message: error || 'Falha ao conectar com o equipamento' });
    }
  }

  async function handleSync() {
    if (!academyId) return;
    try {
      const result = await syncAttendance(academyId);
      addToast({
        type: 'success',
        message: result.synced > 0
          ? `${result.synced} registro(s) de presença importado(s)`
          : 'Nenhum registro novo encontrado',
      });
      await fetchAttendance(academyId);
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Erro ao sincronizar' });
    }
  }

  const statusColor = connected ? 'text-green-600' : 'text-gray-400';
  const StatusIcon = connected ? Wifi : WifiOff;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Presença</h1>
          <p className="text-sm text-gray-500 mt-1">Registros importados do equipamento Control iD</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            title="Configurações do equipamento"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={handleConnect}
            disabled={!deviceIp || connecting}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm text-gray-700 disabled:opacity-50"
          >
            <StatusIcon size={16} className={statusColor} />
            {connecting ? 'Conectando...' : connected ? 'Conectado' : 'Testar conexão'}
          </button>
          <button
            onClick={handleSync}
            disabled={!connected || syncing || !academyId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
        </div>
      </div>

      {/* Device info bar */}
      {deviceIp && (
        <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-600">
          <span>Equipamento: <strong className="text-gray-900">{deviceIp}</strong></span>
          {lastSync && (
            <span>Última sync: <strong className="text-gray-900">{formatDate(lastSync)}</strong></span>
          )}
          {error && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertCircle size={14} /> {error}
            </span>
          )}
        </div>
      )}

      {/* Attendance table */}
      {attendance.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {deviceIp
              ? 'Nenhum registro de presença. Clique em "Sincronizar agora" para importar.'
              : 'Configure o IP do equipamento para começar.'}
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Aluno</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Data / Horário</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Portal</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {attendance.map((record) => (
                <tr key={record.$id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                        {(record.student_name || '?')[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{record.student_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="flex items-center gap-1">
                      <Clock size={13} className="text-gray-400" />
                      {formatDate(record.checked_in_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{record.portal_id || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                      {record.event_type === 3 ? 'Acesso liberado' : `Evento ${record.event_type ?? '-'}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Configuração do Equipamento</h2>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IP do equipamento</label>
                <input
                  type="text"
                  placeholder="192.168.0.100"
                  value={form.ip}
                  onChange={(e) => setForm(f => ({ ...f, ip: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
