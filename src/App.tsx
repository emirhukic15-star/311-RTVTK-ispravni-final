import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAutoLogout } from './hooks/useAutoLogout';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dispozicija from './pages/Dispozicija';
import Admin from './pages/Admin';
import Uposlenici from './pages/Uposlenici';
import EmployeeSchedule from './pages/EmployeeSchedule';
import Dashboard from './pages/Dashboard';
import Statistika from './pages/Statistika';
import Permissions from './pages/Permissions';
import AutoLogoutWarning from './components/AutoLogoutWarning';
import ErrorBoundary from './components/ErrorBoundary';

// Protected Route Component with Auto Logout
const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredRoles?: string[] }> = ({ 
  children, 
  requiredRoles = [] 
}) => {
  const { user, loading } = useAuth();
  const { showWarning, timeLeft, extendSession, logoutNow } = useAutoLogout({
    timeoutMinutes: 15, // 15 minutes
    warningMinutes: 2,  // 2 minutes warning
    onLogout: () => {
      // Optional: Add any cleanup logic here
      // Debug logging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log('Auto logout triggered');
      }
    }
  });

  const handleExtendSession = () => {
    extendSession();
    toast.success('Sesija je produžena za još 15 minuta', {
      duration: 3000,
      icon: '⏰',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check role-based access
  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      {children}
      {showWarning && timeLeft !== null && (
        <AutoLogoutWarning
          timeLeft={timeLeft}
          onExtendSession={handleExtendSession}
          onLogoutNow={logoutNow}
        />
      )}
    </>
  );
};

// Admin Route Component
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProtectedRoute requiredRoles={['ADMIN']}>
      {children}
    </ProtectedRoute>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <div className="App">
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#22c55e',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />

          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/dispozicija" element={
              <ProtectedRoute requiredRoles={['PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM', 'CAMERA']}>
                <Layout>
                  <Dispozicija />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/uposlenici" element={
              <ProtectedRoute requiredRoles={['ADMIN', 'PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA']}>
                <Layout>
                  <Uposlenici />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/employee-schedule" element={
              <ProtectedRoute requiredRoles={['PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CAMERA', 'JOURNALIST']}>
                <Layout>
                  <EmployeeSchedule />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/statistika" element={
              <ProtectedRoute requiredRoles={['PRODUCER', 'EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM']}>
                <Layout>
                  <Statistika />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <AdminRoute>
                <Layout>
                  <Admin />
                </Layout>
              </AdminRoute>
            } />

            <Route path="/permissions" element={
              <ProtectedRoute requiredRoles={['ADMIN']}>
                <Layout>
                  <Permissions />
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;