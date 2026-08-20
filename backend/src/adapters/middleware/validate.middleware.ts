import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/**
 * GENERICS + TYPE INFERENCE: `validateQuery`/`validateBody` are generic over
 * the *schema* type `TSchema` (constrained to `ZodTypeAny`) rather than over
 * its output directly - Zod schemas that use `.transform()` (see
 * `failedQuerySchema`'s `page`/`limit` string->number coercion) have a
 * different input type than output type, so a signature generic only over
 * the output would reject exactly the schemas this app needs to validate.
 * `z.infer<TSchema>` inside the closure lets TypeScript *infer* the parsed
 * result type from whatever concrete schema is passed at each call site,
 * with zero repetition of the shape at the call site.
 */
export function validateQuery<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: 'Bad Query parameters.', details: result.error.format() });
      return;
    }
    req.query = result.data as unknown as Request['query'];
    next();
  };
}

export function validateBody<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Bad JSON Body payload.', details: result.error.format() });
      return;
    }
    req.body = result.data as z.infer<TSchema>;
    next();
  };
}
