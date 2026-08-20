interface AdminOnlyNoticeProps {
  email: string;
  onLogout: () => void;
}

/**
 * The admin API (`/api/admin/*`) rejects non-admin tokens with a 403
 * regardless of what the frontend does, so this is UX rather than a real
 * security boundary - the actual enforcement lives entirely in
 * `authorizeRoles('admin')` on the backend. This screen just avoids
 * showing a logged-in user a dashboard that would fail every request.
 */
export function AdminOnlyNotice({ email, onLogout }: AdminOnlyNoticeProps) {
  return (
    <div className="auth-gate">
      <div className="auth-card">
        <h1>Job Queue Dashboard</h1>
        <p>
          Signed in as <strong>{email}</strong>, but this account doesn&apos;t have admin access. Ask an existing admin
          to upgrade your account, or sign in with an admin account.
        </p>
        <button type="button" className="primary" onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
