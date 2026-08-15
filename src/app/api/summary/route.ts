import { NextRequest } from 'next/server';
import { badRequest, json, requireHousehold } from '@/lib/api/http';
import { monthParamSchema } from '@/lib/validation';
import { getSummary } from '@/lib/queries/summary';

export async function GET(request: NextRequest) {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  const monthParsed = monthParamSchema.safeParse(
    request.nextUrl.searchParams.get('month')
  );
  if (!monthParsed.success) return badRequest(monthParsed.error.flatten());

  try {
    const summary = await getSummary(
      ctx.supabase,
      ctx.householdId,
      monthParsed.data
    );
    return json(summary);
  } catch (error) {
    console.error('GET /api/summary failed', error);
    return json({ error: 'Failed to load the summary' }, { status: 500 });
  }
}
