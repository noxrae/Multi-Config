import { randomUUID } from 'crypto'
import { writeFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import path from 'path'

import { createQueuedJob } from '@/lib/server/jobs'
import { normalizeZipBuffer } from '@/lib/server/normalize'
import { spawnNormalizationWorker } from '@/lib/server/python'
import { ensureRuntimeDirs, uploadsDir } from '@/lib/server/runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'ZIP file is required' }, { status: 400 })
    }

    const jobId = randomUUID().replace(/-/g, '')
    const buffer = Buffer.from(await file.arrayBuffer())

    if (process.env.VERCEL) {
      const normalized = await normalizeZipBuffer(buffer)
      return NextResponse.json({
        job_id: jobId,
        status: 'completed',
        result: normalized.result,
        summary: normalized.summary,
      })
    }

    await ensureRuntimeDirs()
    const zipPath = path.join(uploadsDir, `${jobId}.zip`)
    await writeFile(zipPath, buffer)
    await createQueuedJob(jobId)
    await spawnNormalizationWorker(jobId, zipPath)

    return NextResponse.json({ job_id: jobId, status: 'queued' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to start job' }, { status: 500 })
  }
}
