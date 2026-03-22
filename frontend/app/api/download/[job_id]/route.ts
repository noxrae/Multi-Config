import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'

import { readJob } from '@/lib/server/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { job_id: string } }): Promise<Response> {
  const job = await readJob(params.job_id)
  if (!job?.output_file) {
    return NextResponse.json({ error: 'Download not available' }, { status: 404 })
  }

  try {
    const content = await readFile(job.output_file)
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="normalized_report.json"',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Download not available' }, { status: 404 })
  }
}
