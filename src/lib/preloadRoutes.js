/** Preload de rotas de perfil (hover em listas). */
export function preloadLeadProfile() {
  return import('../pages/LeadProfile.jsx');
}

export function preloadStudentProfile() {
  return import('../pages/StudentProfile.jsx');
}

export function preloadInbox() {
  return import('../pages/Inbox.jsx');
}

/** Painel de thread + mensagens virtualizadas (hover na lista / antes de abrir conversa). */
export function preloadInboxThreadChunks() {
  return Promise.all([
    import('../components/inbox/InboxThreadPanel.jsx'),
    import('../components/inbox/InboxThreadMessages.jsx'),
    import('../components/inbox/InboxComposer.jsx'),
  ]);
}
