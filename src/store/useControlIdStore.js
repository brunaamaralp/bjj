import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as controlId from '../services/controlIdService';
import { createSessionJwt } from '../lib/appwrite';
import { attendanceApiUrl } from '../lib/controlidApi.js';

const CONTROLID_STORE_KEY = 'controlid-store';

/** Remove senha legada persistida antes do hydrate do Zustand. */
function migrateControlIdStoreLegacyPassword() {
  if (typeof localStorage === 'undefined') return;
  try {
    const stored = localStorage.getItem(CONTROLID_STORE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (parsed?.state?.devicePassword) {
      delete parsed.state.devicePassword;
      localStorage.setItem(CONTROLID_STORE_KEY, JSON.stringify(parsed));
    }
  } catch {
    void 0;
  }
}

migrateControlIdStoreLegacyPassword();

// Gera device_id numérico a partir do $id do Appwrite (últimos 8 chars hex → decimal, capped em 99999)
function buildDeviceId(appwriteId) {
  const hex = String(appwriteId || '').slice(-8);
  return Math.abs(parseInt(hex, 16)) % 99999 + 1;
}

export const useControlIdStore = create(
  persist(
    (set, get) => ({
      // --- Configuração do equipamento ---
      deviceIp: '',
      deviceUsername: 'admin',
      devicePassword: 'admin',

      // --- Estado de conexão ---
      connected: false,
      connecting: false,
      error: null,

      // --- Estado de sincronização ---
      syncing: false,
      lastSync: null, // ISO string

      // --- Cache local de presença ---
      attendance: [],

      setConfig: (ip, username = 'admin', password = 'admin') => {
        set({ deviceIp: ip, deviceUsername: username, devicePassword: password, connected: false, error: null });
      },

      testConnection: async () => {
        const { deviceIp, deviceUsername, devicePassword } = get();
        if (!deviceIp) {
          set({ error: 'Configure o IP do equipamento' });
          return false;
        }
        set({ connecting: true, error: null });
        const result = await controlId.testConnection(deviceIp, deviceUsername, devicePassword);
        set({ connecting: false, connected: result.ok, error: result.error || null });
        return result.ok;
      },

      // Envia um aluno para o equipamento
      pushStudent: async (student) => {
        const { deviceIp, deviceUsername, devicePassword } = get();
        if (!deviceIp) throw new Error('IP do equipamento não configurado');

        const deviceId = student.device_id || buildDeviceId(student.$id || student.id);
        return controlId.pushUser(deviceIp, deviceUsername, devicePassword, {
          device_id: deviceId,
          name: student.name,
          cpf: student.cpf || '',
        });
      },

      // Remove aluno do equipamento
      removeStudent: async (deviceId) => {
        const { deviceIp, deviceUsername, devicePassword } = get();
        return controlId.removeDeviceUser(deviceIp, deviceUsername, devicePassword, deviceId);
      },

      // Busca logs do equipamento e salva como presença no Appwrite
      syncAttendance: async (academyId) => {
        const { deviceIp, deviceUsername, devicePassword, lastSync } = get();
        if (!deviceIp) throw new Error('IP do equipamento não configurado');

        set({ syncing: true, error: null });
        try {
          // Busca logs desde o último sync (ou últimos 7 dias se nunca sincronizou)
          const since = lastSync
            ? new Date(lastSync).getTime()
            : Date.now() - 7 * 24 * 60 * 60 * 1000;

          const data = await controlId.getAccessLogs(deviceIp, deviceUsername, devicePassword, { since });
          const logs = data?.access_logs || [];

          if (logs.length === 0) {
            set({ syncing: false, lastSync: new Date().toISOString() });
            return { synced: 0 };
          }

          const jwt = await createSessionJwt();
          const res = await fetch(attendanceApiUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`,
              'x-academy-id': academyId,
            },
            body: JSON.stringify({ logs }),
          });

          const result = await res.json();
          if (!result.sucesso) throw new Error(result.erro || 'Erro ao salvar presença');

          const newSync = new Date().toISOString();
          set({ syncing: false, lastSync: newSync });
          return { synced: result.count };
        } catch (err) {
          set({ syncing: false, error: err.message });
          throw err;
        }
      },

      // Busca registros de presença do Appwrite
      fetchAttendance: async (academyId, { studentId, startDate, endDate } = {}) => {
        const jwt = await createSessionJwt();
        const params = new URLSearchParams();
        if (studentId) params.set('student_id', studentId);
        if (startDate) params.set('start', startDate);
        if (endDate) params.set('end', endDate);

        const res = await fetch(attendanceApiUrl(params), {
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'x-academy-id': academyId,
          },
        });
        const data = await res.json();
        if (!data.sucesso) throw new Error(data.erro);
        set({ attendance: data.records });
        return data.records;
      },
    }),
    {
      name: CONTROLID_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Só persiste IP/usuário e última sync — nunca senha nem presença
      partialize: (state) => ({
        deviceIp: state.deviceIp,
        deviceUsername: state.deviceUsername,
        lastSync: state.lastSync,
      }),
    }
  )
);
