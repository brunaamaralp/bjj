import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PortalLogin from './PortalLogin.jsx';
import PortalActivate from './PortalActivate.jsx';
import PortalForgotPassword from './PortalForgotPassword.jsx';
import PortalLayout from './PortalLayout.jsx';
import PortalHome from './PortalHome.jsx';
import PortalFinance from './PortalFinance.jsx';
import PortalAttendance from './PortalAttendance.jsx';
import PortalProfile from './PortalProfile.jsx';
import PortalGuides from './PortalGuides.jsx';
import PortalMore from './PortalMore.jsx';
import PortalContracts from './PortalContracts.jsx';
import PortalChangePassword from './PortalChangePassword.jsx';

export default function PortalApp() {
  return (
    <Routes>
      <Route path="login" element={<PortalLogin />} />
      <Route path="esqueci-senha" element={<PortalForgotPassword />} />
      <Route path="ativar/:token" element={<PortalActivate />} />
      <Route path="trocar-senha" element={<PortalChangePassword />} />
      <Route element={<PortalLayout />}>
        <Route index element={<PortalHome />} />
        <Route path="financeiro" element={<PortalFinance />} />
        <Route path="presenca" element={<PortalAttendance />} />
        <Route path="perfil" element={<PortalProfile />} />
        <Route path="orientacoes" element={<PortalGuides />} />
        <Route path="orientacoes/:slug" element={<PortalGuides />} />
        <Route path="contratos" element={<PortalContracts />} />
        <Route path="mais" element={<PortalMore />} />
      </Route>
      <Route path="*" element={<Navigate to="/portal/login" replace />} />
    </Routes>
  );
}
