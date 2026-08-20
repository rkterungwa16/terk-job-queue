import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../adapters/middleware/validate.middleware.js';
import { authenticate, type AuthenticatedRequest } from '../adapters/middleware/auth.middleware.js';
import { loginUser, registerUser } from '../domain/auth/authService.js';

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  adminKey: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', validateBody(registerSchema), async (req: Request, res: Response) => {
  const { email, password, adminKey } = req.body as z.infer<typeof registerSchema>;
  const result = await registerUser({ email, password, adminKey });
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }
  res.status(201).json({ user: result.user, token: result.token });
});

router.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const result = await loginUser({ email, password });
  if (!result.ok) {
    res.status(401).json({ error: result.error });
    return;
  }
  res.status(200).json({ user: result.user, token: result.token });
});

/** Lets the frontend validate a persisted token on load instead of trusting it blindly. */
router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({ user: req.user });
});

export default router;
