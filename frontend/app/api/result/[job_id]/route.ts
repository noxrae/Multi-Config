import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'

import { readJob } from '@/lib/server/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { job_id: string } }): Promise<Response> {
  const job = await readJob(params.job_id)
  if (!job?.output_file) {
    return NextResponse.json({ error: 'Result not available' }, { status: 404 })
  }

  try {
    const raw = await readFile(job.output_file, 'utf8')
    return NextResponse.json(JSON.parse(raw))
  } catch {
    return NextResponse.json({ error: 'Result not available' }, { status: 404 })
  }
}
