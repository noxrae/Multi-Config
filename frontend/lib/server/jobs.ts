import path from 'path'

import { jobsDir, readJsonFile, writeJsonFile } from './runtime'

export type JobSummary = {
  total?: number
  passed?: number
  failed?: number
  steps?: number
  pass_rate?: number
}

export type JobState = {
  job_id: string
  status: string
  phase: string
  current_phase: number
  total_phases: number
  message: string
  created_at: string
  updated_at: string
  output_file?: string | null
  summary?: JobSummary
  error?: string
}

export function jobStatePath(jobId: string): string {
  return path.join(jobsDir, `${jobId}.json`)
}

export async function createQueuedJob(jobId: string): Promise<JobState> {
  const now = new Date().toISOString()
  const state: JobState = {
    job_id: jobId,
    status: 'queued',
    phase: 'Queued',
    current_phase: 0,
    total_phases: 5,
    message: 'Upload received. Waiting for processing.',
    created_at: now,
    updated_at: now,
    output_file: null,
    summary: {},
  }

  await writeJsonFile(jobStatePath(jobId), state)
  return state
}

export async function readJob(jobId: string): Promise<JobState | null> {
  try {
    return await readJsonFile<JobState>(jobStatePath(jobId))
  } catch {
    return null
  }
}
