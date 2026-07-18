import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import App from "./App.jsx";
import Login from "./auth/Login.jsx";
import Consent from "./auth/Consent.jsx";
import ResetPassword from "./auth/ResetPassword.jsx";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import TenantBootstrap from "./auth/TenantBootstrap.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles.css";

function ProtectedApp() {
  const { profile, memberships, loading } = useAuth();
  if (loading) return <div style={fullPage}>Yüklənir…</div>;
  const activeTenant = profile?.active_tenant_id ?? null;
  if (!memberships?.length || !activeTenant) return <TenantBootstrap />;
  return <App />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/.lovable/oauth/consent" element={<Consent />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <ProtectedApp />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

const fullPage = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  fontFamily: "Manrope, system-ui, sans-serif",
  color: "#0f2a20",
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
