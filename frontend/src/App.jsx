import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { BrandingProvider } from "./context/BrandingContext";
import { RequireAuth, RequireOwner } from "./components/RouteGuards";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PendingPayments from "./pages/PendingPayments";
import Analytics from "./pages/Analytics";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Users from "./pages/Users";

export default function App() {
  return (
    <BrandingProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />

            <Route
              path="/pending-payments"
              element={
                <RequireAuth>
                  <PendingPayments />
                </RequireAuth>
              }
            />

            <Route
              path="/analytics"
              element={
                <RequireOwner>
                  <Analytics />
                </RequireOwner>
              }
            />

            <Route
              path="/history"
              element={
                <RequireOwner>
                  <History />
                </RequireOwner>
              }
            />

            <Route
              path="/settings"
              element={
                <RequireOwner>
                  <Settings />
                </RequireOwner>
              }
            />

            <Route
              path="/users"
              element={
                <RequireOwner>
                  <Users />
                </RequireOwner>
              }
            />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </BrandingProvider>
  );
}
