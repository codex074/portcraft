import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RecordTrade from "./pages/RecordTrade";
import Settings from "./pages/Settings";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Portfolio from "./pages/Portfolio";
import Performance from "./pages/Performance";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ExchangeRateProvider } from "./contexts/ExchangeRateContext";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ExchangeRateProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/record" element={<RecordTrade />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Redirect root to portfolio */}
          <Route path="/" element={<Navigate to="/portfolio" replace />} />
          <Route path="*" element={<Navigate to="/portfolio" replace />} />
        </Routes>
        </ExchangeRateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
