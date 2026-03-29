import { NextRequest, NextResponse } from 'next/server';
import { lookupWhoisRecord } from '../../../lib/domain-utils';

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get('domain') ?? '';

  if (!domain.trim()) {
    return NextResponse.json({ error: 'No domain provided' }, { status: 400 });
  }

  const result = await lookupWhoisRecord(domain);
  return NextResponse.json(result);
}
