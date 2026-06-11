import { describe, it, expect, beforeEach } from 'vitest';
import { useChatWidgetStore } from '../store/useChatWidgetStore';

const STORAGE_KEY = 'navi-chat-widget';

function resetStore() {
  useChatWidgetStore.setState({
    academyId: '',
    isOpen: false,
    isPinned: false,
    activePhone: '',
    leadId: '',
    leadName: '',
    launcherOpen: false,
    shortcutLoading: false,
  });
  sessionStorage.removeItem(STORAGE_KEY);
}

describe('useChatWidgetStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('pinConversation fixa conversa e abre painel por padrão', () => {
    useChatWidgetStore.getState().pinConversation({
      phone: '5511999999999',
      leadId: 'lead-1',
      leadName: 'Maria',
      academyId: 'acad-1',
    });
    const s = useChatWidgetStore.getState();
    expect(s.isPinned).toBe(true);
    expect(s.isOpen).toBe(true);
    expect(s.activePhone).toBe('5511999999999');
    expect(s.leadId).toBe('lead-1');
    expect(s.leadName).toBe('Maria');
    expect(s.academyId).toBe('acad-1');
  });

  it('persiste estado fixado no sessionStorage', () => {
    useChatWidgetStore.getState().pinConversation({
      phone: '5511888888888',
      leadName: 'João',
      academyId: 'acad-2',
      openPanel: false,
    });
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const data = JSON.parse(raw);
    expect(data.isPinned).toBe(true);
    expect(data.isOpen).toBe(false);
    expect(data.activePhone).toBe('5511888888888');
  });

  it('minimizePanel fecha painel sem desfixar', () => {
    useChatWidgetStore.getState().pinConversation({ phone: '5511777777777', academyId: 'a1' });
    useChatWidgetStore.getState().minimizePanel();
    const s = useChatWidgetStore.getState();
    expect(s.isPinned).toBe(true);
    expect(s.isOpen).toBe(false);
  });

  it('closeWidget limpa conversa fixada', () => {
    useChatWidgetStore.getState().pinConversation({ phone: '5511666666666', academyId: 'a1' });
    useChatWidgetStore.getState().closeWidget();
    const s = useChatWidgetStore.getState();
    expect(s.isPinned).toBe(false);
    expect(s.activePhone).toBe('');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('switchConversation troca telefone ativo', () => {
    useChatWidgetStore.getState().pinConversation({ phone: '5511111111111', academyId: 'a1' });
    useChatWidgetStore.getState().switchConversation({
      phone: '5522222222222',
      leadId: 'l2',
      leadName: 'Pedro',
    });
    const s = useChatWidgetStore.getState();
    expect(s.activePhone).toBe('5522222222222');
    expect(s.leadId).toBe('l2');
    expect(s.leadName).toBe('Pedro');
    expect(s.isOpen).toBe(true);
  });

  it('resetForAcademy limpa ao trocar academia', () => {
    useChatWidgetStore.getState().pinConversation({ phone: '5511999999999', academyId: 'acad-a' });
    useChatWidgetStore.getState().resetForAcademy('acad-b');
    const s = useChatWidgetStore.getState();
    expect(s.academyId).toBe('acad-b');
    expect(s.isPinned).toBe(false);
    expect(s.activePhone).toBe('');
  });

  it('openLauncher abre seletor e fecha painel', () => {
    useChatWidgetStore.getState().pinConversation({ phone: '5511999999999', academyId: 'a1' });
    useChatWidgetStore.getState().openLauncher();
    const s = useChatWidgetStore.getState();
    expect(s.launcherOpen).toBe(true);
    expect(s.isOpen).toBe(false);
    expect(s.isPinned).toBe(true);
  });

  it('pinConversation fecha launcher e shortcutLoading', () => {
    useChatWidgetStore.getState().openLauncher();
    useChatWidgetStore.getState().setShortcutLoading(true);
    useChatWidgetStore.getState().pinConversation({
      phone: '5511999999999',
      leadName: 'Ana',
      academyId: 'a1',
    });
    const s = useChatWidgetStore.getState();
    expect(s.launcherOpen).toBe(false);
    expect(s.shortcutLoading).toBe(false);
    expect(s.isPinned).toBe(true);
  });

  it('closeWidget limpa launcher', () => {
    useChatWidgetStore.getState().openLauncher();
    useChatWidgetStore.getState().closeWidget();
    const s = useChatWidgetStore.getState();
    expect(s.launcherOpen).toBe(false);
    expect(s.shortcutLoading).toBe(false);
  });
});
