import { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { badRequest, json, unauthorized } from '@/lib/api/http';
import { monthParamSchema } from '@/lib/validation';
import { getSummary } from '@/lib/queries/summary';

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const monthParsed = monthParamSchema.safeParse(
    request.nextUrl.searchParams.get('month')
  );
  if (!monthParsed.success) return badRequest(monthParsed.error.flatten());

  const supabase = await createClient();
  try {
    const summary = await getSummary(supabase, user.id, monthParsed.data);
    return json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
