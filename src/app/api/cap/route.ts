import { NextResponse } from 'next/server';
import { capUpdateSchema } from '@/lib/validation';
import { json, parseBody, requireHousehold } from '@/lib/api/http';
import { getCap } from '@/lib/queries/cap';
import { upsertCap } from '@/lib/mutations/cap';

export async function GET() {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  try {
    const cap = await getCap(ctx.supabase, ctx.householdId);
    // A 204 must not carry a body — the Fetch spec forbids it, and
    // NextResponse.json(null, { status: 204 }) throws.
    if (!cap) return new NextResponse(null, { status: 204 });
    return json(cap);
  } catch (error) {
    console.error('GET /api/cap failed', error);
    return json({ error: 'Failed to get the monthly cap' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  const parsed = await parseBody(request, capUpdateSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const cap = await upsertCap(ctx.supabase, ctx.householdId, parsed.data);
    return json(cap);
  } catch (error) {
    console.error('PUT /api/cap failed', error);
    return json({ error: 'Failed to save the monthly cap' }, { status: 500 });
  }
}
