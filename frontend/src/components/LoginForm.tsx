import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';

export function LoginForm() {
  const { login, state } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isSubmitting = state.status === 'authenticating';

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void login(email, password);
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <label htmlFor={emailId}>Email</label>
      <input
        id={emailId}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />

      <label htmlFor={passwordId}>Password</label>
      <input
        id={passwordId}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
      />

      {state.status === 'error' && <p className="error-banner">{state.error}</p>}

      <button type="submit" className="primary" disabled={isSubmitting}>
        {isSubmitting ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
