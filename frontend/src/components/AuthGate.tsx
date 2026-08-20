import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

export function AuthGate() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <h1>Job Queue Dashboard</h1>
        {mode === 'login' ? <LoginForm /> : <RegisterForm />}
        <button type="button" className="auth-switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
