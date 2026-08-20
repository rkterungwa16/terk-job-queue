import { AuthProvider, useAuth } from './auth/AuthContext';
import { AuthGate } from './components/AuthGate';
import { AdminOnlyNotice } from './components/AdminOnlyNotice';
import { Dashboard } from './components/Dashboard';
import { assertNever } from './types/utils';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

/**
 * TYPE NARROWING: switching on `state.status` (an `AuthState` discriminated
 * union) picks exactly one screen per auth state, with `assertNever` in the
 * default case keeping this exhaustive against `types/auth.ts` - the same
 * pattern used for `AsyncState` in `StatsPanel`/`Dashboard`.
 */
function AppShell() {
  const { state, logout } = useAuth();

  switch (state.status) {
    case 'authenticating':
      return <p className="loading-state">Checking session…</p>;
    case 'anonymous':
    case 'error':
      return <AuthGate />;
    case 'authenticated':
      return state.user.role === 'admin' ? <Dashboard /> : <AdminOnlyNotice email={state.user.email} onLogout={logout} />;
    default:
      return assertNever(state, 'AppShell');
  }
}
