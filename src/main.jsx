import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles.css";

const App = lazy(() => import("./App.jsx"));
const Login = lazy(() => import("./auth/Login.jsx"));
const Consent = lazy(() => import("./auth/Consent.jsx"));
const ResetPassword = lazy(() => import("./auth/ResetPassword.jsx"));
const TenantBootstrap = lazy(() => import("./auth/TenantBootstrap.jsx"));
const ProcurementPage = lazy(() => import("./modules/procurement/ProcurementPage.jsx"));

const fullPage = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  fontFamily: "Manrope, system-ui, sans-serif",
  color: "#0f2a20",
};

function Loading({ label = "Yüklənir…" }) {
  return <div style={fullPage}>{label}</div>;
}

function ProtectedApp() {
  const { profile, memberships, loading } = useAuth();
  if (loading) return <Loading />;
  const activeTenant = profile?.active_tenant_id ?? null;
  if (!memberships?.length || !activeTenant) {
    return (
      <Suspense fallback={<Loading />}>
        <TenantBootstrap />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<Loading label="Tətbiq yüklənir…" />}>
      <App />
    </Suspense>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/.lovable/oauth/consent" element={<Consent />} />
        <Route
          path="/satinalma/*"
          element={
            <ProtectedRoute>
              <Suspense fallback={<Loading />}><ProcurementPage /></Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <ProtectedApp />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

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
