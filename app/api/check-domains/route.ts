import { NextRequest, NextResponse } from 'next/server';
import { checkDomainAvailability } from '../../../lib/domain-utils';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const raw = (body?.domains ?? '').toString();
  const lines = raw.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);

  if (lines.length === 0) {
    return NextResponse.json({ error: 'No domains provided' }, { status: 400 });
  }
  if (lines.length > 15) {
    return NextResponse.json({ error: 'Limit is 15 domains per check chunk' }, { status: 400 });
  }

  const results = await Promise.all(lines.map((domain: string) => checkDomainAvailability(domain)));
  return NextResponse.json({ results });
}
