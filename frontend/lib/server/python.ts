import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

import { ensureRuntimeDirs, extractedDir, jobsDir, outputDir, repoRoot, workerScriptPath } from './runtime'

export function getPythonCommand(): string {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN
  }

  return process.platform === 'win32' ? 'python' : 'python3'
}

export async function spawnNormalizationWorker(jobId: string, zipPath: string): Promise<void> {
  await ensureRuntimeDirs()

  const child = spawn(
    getPythonCommand(),
    [
      workerScriptPath,
      '--job-id',
      jobId,
      '--input',
      zipPath,
      '--state',
      path.join(jobsDir, `${jobId}.json`),
      '--output-dir',
      outputDir,
      '--extracted-dir',
      extractedDir,
    ],
    {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
    },
  )

  child.unref()
}

export function resolvePythonWeightageScript(): string {
  const candidates = [
    path.join(process.cwd(), 'scripts', 'weightage.py'),
    path.join(repoRoot, 'frontend', 'scripts', 'weightage.py'),
    path.join(repoRoot, 'scripts', 'weightage.py'),
  ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error('Python weightage script not found')
  }

  return found
}
