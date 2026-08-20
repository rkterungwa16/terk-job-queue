import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'YOUR_SYSTEM_SUPER_SECRET_KEY';

/** Shape we require the decoded JWT payload to have - narrowed via `isUserPayload` below. */
interface AuthenticatedUser {
  role: string;
  [key: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

function isUserPayload(payload: string | jwt.JwtPayload): payload is AuthenticatedUser {
  return typeof payload === 'object' && payload !== null && typeof (payload as { role?: unknown }).role === 'string';
}

/**
 * Variadic generic-ish usage: `allowedRoles` is a `string[]` collected via
 * rest params, matching the original call sites (`authorizeRoles('admin')`).
 */
export function authorizeRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing token.' });
        return;
      }
      const token = authHeader.split(' ')[1] ?? '';
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!isUserPayload(decoded)) {
        res.status(401).json({ error: 'Malformed session.' });
        return;
      }
      req.user = decoded;
      if (!allowedRoles.includes(req.user.role)) {
        res.status(403).json({ error: 'Clearance denied.' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: 'Session expired.' });
    }
  };
}
