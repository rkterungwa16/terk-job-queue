import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { UserModel } from '../model/user.model.js';
import type { AuthResult, AuthUser, JwtPayload, UserRole } from '../../types/auth.types.js';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'YOUR_SYSTEM_SUPER_SECRET_KEY';
// jsonwebtoken types `expiresIn` as `number | StringValue` (a branded
// template-literal type like "2h"/"7d") rather than a plain `string`, since
// it validates the format at the type level for literals written in code.
// An env var is necessarily a plain `string` at compile time, so this is an
// explicit, single, well-documented assertion that ops-provided config
// matches jsonwebtoken's expected format - preferable to widening the
// parameter's type everywhere else that touches it.
const JWT_EXPIRES_IN = (process.env['JWT_EXPIRES_IN'] ?? '2h') as SignOptions['expiresIn'];
const SALT_ROUNDS = 10;

export interface RegisterInput {
  email: string;
  password: string;
  /** Optional bootstrap key — see the ADMIN_REGISTRATION_KEY comment below. */
  adminKey?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

function toAuthUser(user: { _id: unknown; email: string; role: UserRole }): AuthUser {
  return { id: String(user._id), email: user.email, role: user.role };
}

function issueToken(user: AuthUser): string {
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * There is no admin UI to promote users, and no seed script in this app, so
 * something has to be the first admin account. `ADMIN_REGISTRATION_KEY` is a
 * shared-secret env var: if set, and a registration request includes a
 * matching `adminKey`, that account is created with `role: 'admin'` instead
 * of the default `'user'`. Leave the env var unset in any environment where
 * self-service admin signup shouldn't be possible at all.
 */
export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();
  const existing = await UserModel.findOne({ email });
  if (existing) {
    return { ok: false, error: 'An account with that email already exists.' };
  }

  const adminBootstrapKey = process.env['ADMIN_REGISTRATION_KEY'];
  const role: UserRole = adminBootstrapKey && input.adminKey === adminBootstrapKey ? 'admin' : 'user';

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const created = await UserModel.create({ email, passwordHash, role });

  const user = toAuthUser(created);
  return { ok: true, user, token: issueToken(user) };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();
  const existing = await UserModel.findOne({ email });

  // Deliberately the same error message whether the account doesn't exist
  // or the password is wrong - distinguishing the two in the response
  // would let an attacker enumerate registered email addresses.
  const genericError = { ok: false as const, error: 'Invalid email or password.' };
  if (!existing) return genericError;

  const matches = await bcrypt.compare(input.password, existing.passwordHash);
  if (!matches) return genericError;

  const user = toAuthUser(existing);
  return { ok: true, user, token: issueToken(user) };
}
