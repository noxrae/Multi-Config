import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

function detectRepoRoot(): string {
  const cwd = process.cwd()
  const candidates = [cwd, path.resolve(cwd, '..')]

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'core')) && existsSync(path.join(candidate, 'cli.py'))) {
      return candidate
    }
  }

  return path.resolve(cwd, '..')
}

export const repoRoot = detectRepoRoot()
export const uploadsDir = path.join(repoRoot, 'uploads')
export const outputDir = path.join(repoRoot, 'output')
export const extractedDir = path.join(repoRoot, 'extracted')
export const jobsDir = path.join(repoRoot, '.runtime', 'jobs')
export const workerScriptPath = path.join(repoRoot, 'node_worker.py')

export async function ensureRuntimeDirs(): Promise<void> {
  await Promise.all([
    mkdir(uploadsDir, { recursive: true }),
    mkdir(outputDir, { recursive: true }),
    mkdir(extractedDir, { recursive: true }),
    mkdir(jobsDir, { recursive: true }),
  ])
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}
