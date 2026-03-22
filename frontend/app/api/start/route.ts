import { randomUUID } from 'crypto'
import { writeFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import path from 'path'

import { createQueuedJob } from '@/lib/server/jobs'
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

    if (process.env.VERCEL) {
      const normalizeForm = new FormData()
      normalizeForm.append('file', file)

      const normalizeUrl = new URL('/api/normalize', req.url)
      const normalizeResponse = await fetch(normalizeUrl, {
        method: 'POST',
        body: normalizeForm,
        cache: 'no-store',
      })

      const normalizeData = await normalizeResponse.json()
      if (!normalizeResponse.ok) {
        return NextResponse.json(
          { error: normalizeData?.detail || normalizeData?.error || 'Normalization failed' },
          { status: normalizeResponse.status || 500 },
        )
      }

      return NextResponse.json({
        job_id: jobId,
        status: 'completed',
        result: normalizeData.result,
        summary: normalizeData.summary,
      })
    }

    await ensureRuntimeDirs()
    const zipPath = path.join(uploadsDir, `${jobId}.zip`)
    const buffer = Buffer.from(await file.arrayBuffer())

    await writeFile(zipPath, buffer)
    await createQueuedJob(jobId)
    await spawnNormalizationWorker(jobId, zipPath)

    return NextResponse.json({ job_id: jobId, status: 'queued' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to start job' }, { status: 500 })
  }
}
