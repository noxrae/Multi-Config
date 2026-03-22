import { NextResponse } from 'next/server'

import { readJob } from '@/lib/server/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { job_id: string } }): Promise<Response> {
  const job = await readJob(params.job_id)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: job.status,
    phase: job.phase,
    current_phase: job.current_phase,
    total_phases: job.total_phases,
    message: job.message,
    summary: job.summary || {},
  })
}
