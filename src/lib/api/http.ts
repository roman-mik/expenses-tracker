/**
 * Small helpers shared by the API route handlers: consistent JSON responses and
 * a Zod-body parser. Auth is enforced per-route via the DAL (`verifySession`),
 * with Postgres RLS as the backstop.
 */
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function badRequest(details: unknown): NextResponse {
  return NextResponse.json(
    { error: 'Invalid request', details },
    { status: 400 }
  );
}

export function notFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/** Parse + validate a JSON body. Returns the value or a 400 NextResponse. */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<{ data: T } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: badRequest('Body must be valid JSON') };
  }
  const result = schema.safeParse(raw);
  if (!result.success) return { response: badRequest(result.error.flatten()) };
  return { data: result.data };
}
