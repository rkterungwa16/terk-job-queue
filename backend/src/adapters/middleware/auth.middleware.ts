import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser, JwtPayload, UserRole } from '../../types/auth.types.js';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'YOUR_SYSTEM_SUPER_SECRET_KEY';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/** TYPE NARROWING on `unknown`/`jwt.JwtPayload` - only trusted once every field is checked. */
function isJwtPayload(payload: string | jwt.JwtPayload): payload is JwtPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { sub?: unknown }).sub === 'string' &&
    typeof (payload as { email?: unknown }).email === 'string' &&
    typeof (payload as { role?: unknown }).role === 'string'
  );
}

/**
 * Verifies the bearer token and attaches `req.user` - no role check. Used
 * directly by routes any logged-in user may call (`GET /api/auth/me`), and
 * as the shared foundation `authorizeRoles` builds on below, so the token-
 * verification logic exists in exactly one place.
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing token.' });
      return;
    }
    const token = authHeader.split(' ')[1] ?? '';
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!isJwtPayload(decoded)) {
      res.status(401).json({ error: 'Malformed session.' });
      return;
    }
    req.user = { id: decoded.sub, email: decoded.email, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ error: 'Session expired.' });
  }
}

/**
 * Same call shape as before (`authorizeRoles('admin')`), now expressed as
 * "authenticate, then check role" instead of re-implementing token
 * verification a second time. Typed over `UserRole` (not `string`) so a
 * typo'd role name at a call site (`authorizeRoles('admni')`) is a compile
 * error, not a route nobody can ever pass.
 */
export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    authenticate(req, res, () => {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        res.status(403).json({ error: 'Clearance denied.' });
        return;
      }
      next();
    });
  };
}
