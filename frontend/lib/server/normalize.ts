import AdmZip from 'adm-zip'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'

export type NormalizerSummary = {
  total: number
  passed: number
  failed: number
  steps: number
  pass_rate: number
}

type ParsedTest = {
  title: string
  project_name: string
  ok: boolean
  results: Array<Record<string, unknown>>
}

function deriveOk(testObj: Record<string, unknown>): boolean {
  if (typeof testObj.ok === 'boolean') {
    return testObj.ok
  }

  const status = String(testObj.status || '').toLowerCase()
  if (['passed', 'expected', 'ok'].includes(status)) return true
  if (['failed', 'timedout', 'interrupted'].includes(status)) return false

  const results = Array.isArray(testObj.results) ? testObj.results : []
  const normalized = results
    .filter((result): result is Record<string, unknown> => typeof result === 'object' && result !== null)
    .map((result) => String(result.status || '').toLowerCase())

  if (normalized.some((value) => ['failed', 'timedout', 'interrupted'].includes(value))) return false
  if (normalized.length > 0 && normalized.every((value) => ['passed', 'expected', 'skipped'].includes(value))) return true
  return false
}

function parseSingleTestJson(fileData: Record<string, unknown>): ParsedTest[] {
  const testsList = Array.isArray(fileData.tests) ? fileData.tests : []
  return testsList
    .filter((testData): testData is Record<string, unknown> => typeof testData === 'object' && testData !== null)
    .map((testData) => ({
      title: String(testData.title || ''),
      project_name: String(testData.projectName || 'unknown'),
      ok: deriveOk(testData),
      results: Array.isArray(testData.results)
        ? testData.results.filter((result): result is Record<string, unknown> => typeof result === 'object' && result !== null)
        : [],
    }))
}

function parsePlaywrightTests(reportData: Record<string, unknown>): ParsedTest[] {
  const suites = Array.isArray(reportData.suites) ? reportData.suites : []
  const parsedTests: ParsedTest[] = []
  const stack = [...suites].reverse().filter((suite): suite is Record<string, unknown> => typeof suite === 'object' && suite !== null)

  while (stack.length > 0) {
    const suite = stack.pop()!
    const childSuites = Array.isArray(suite.suites) ? suite.suites : []
    for (const child of [...childSuites].reverse()) {
      if (typeof child === 'object' && child !== null) stack.push(child as Record<string, unknown>)
    }

    const specs = Array.isArray(suite.specs) ? suite.specs : []
    for (const spec of specs) {
      if (typeof spec !== 'object' || spec === null) continue
      const specObj = spec as Record<string, unknown>
      const tests = Array.isArray(specObj.tests) ? specObj.tests : []
      for (const test of tests) {
        if (typeof test !== 'object' || test === null) continue
        const testObj = test as Record<string, unknown>
        parsedTests.push({
          title: String(testObj.title || specObj.title || ''),
          project_name: String(testObj.projectName || 'unknown'),
          ok: deriveOk(testObj),
          results: Array.isArray(testObj.results)
            ? testObj.results.filter((result): result is Record<string, unknown> => typeof result === 'object' && result !== null)
            : [],
        })
      }
    }
  }

  return parsedTests
}

function normalizeStep(stepObj: Record<string, unknown>): { title: string; skipped: boolean } {
  const title = String(stepObj.title || '')
  const stepStatus = String(stepObj.status || '').toLowerCase()
  const skipped = Boolean(stepObj.skipped || stepStatus === 'skipped')
  return { title, skipped }
}

function normalizeSteps(rootSteps: Array<Record<string, unknown>>): Array<{ title: string; skipped: boolean }> {
  if (rootSteps.length === 0) return []

  const allSteps = rootSteps.map((step) => normalizeStep(step))
  const beforeHooks = allSteps.find((step) => step.title === 'Before Hooks')
  const afterHooks = allSteps.find((step) => step.title === 'After Hooks')
  const middleSteps = allSteps.filter((step) => !['Before Hooks', 'After Hooks'].includes(step.title))

  return [beforeHooks || { title: 'Before Hooks', skipped: false }, ...middleSteps, afterHooks || { title: 'After Hooks', skipped: false }]
}

function transformTests(parsedTests: ParsedTest[]): Array<Record<string, unknown>> {
  return parsedTests.map((test) => ({
    title: test.title,
    projectName: test.project_name,
    ok: test.ok,
    results: test.results.map((result) => ({
      steps: normalizeSteps(
        Array.isArray(result.steps)
          ? result.steps.filter((step): step is Record<string, unknown> => typeof step === 'object' && step !== null)
          : [],
      ),
    })),
  }))
}

function collectJsonEntries(zip: AdmZip): string[] {
  return zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.json'))
    .map((entry) => entry.entryName)
}

function findReportJson(entries: string[]): string | null {
  const candidates = entries.filter((entry) => path.basename(entry).toLowerCase() === 'report.json')
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const aScore = a.toLowerCase().includes('playwright-report') ? 0 : 1
    const bScore = b.toLowerCase().includes('playwright-report') ? 0 : 1
    return aScore - bScore || a.length - b.length
  })
  return candidates[0]
}

export async function normalizeZipBuffer(zipBuffer: Buffer): Promise<{ result: Record<string, unknown>; summary: NormalizerSummary }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nova-normalizer-'))
  const zipPath = path.join(tempDir, 'report.zip')

  try {
    await writeFile(zipPath, zipBuffer)
    const zip = new AdmZip(zipBuffer)
    const entries = collectJsonEntries(zip)
    const testEntries = entries.filter((entry) => path.basename(entry).toLowerCase() !== 'report.json' && !path.basename(entry).toLowerCase().includes('normalized_report'))

    let parsedTests: ParsedTest[] = []
    for (const entryName of testEntries) {
      try {
        const data = JSON.parse(zip.readAsText(entryName)) as Record<string, unknown>
        parsedTests.push(...parseSingleTestJson(data))
      } catch {
      }
    }

    if (parsedTests.length === 0) {
      const reportEntry = findReportJson(entries)
      if (!reportEntry) {
        throw new Error('report.json not found inside extracted ZIP')
      }
      const reportData = JSON.parse(zip.readAsText(reportEntry)) as Record<string, unknown>
      parsedTests = parsePlaywrightTests(reportData)
    }

    const tests = transformTests(parsedTests)
    const result = { tests }

    let passed = 0
    let steps = 0
    for (const test of tests) {
      if (test.ok === true) passed += 1
      const results = Array.isArray(test.results) ? test.results : []
      for (const resultItem of results) {
        if (typeof resultItem !== 'object' || resultItem === null) continue
        const resultObj = resultItem as Record<string, unknown>
        const stepList = Array.isArray(resultObj.steps) ? resultObj.steps : []
        steps += stepList.length
      }
    }

    const total = tests.length
    const failed = total - passed
    const summary: NormalizerSummary = {
      total,
      passed,
      failed,
      steps,
      pass_rate: total > 0 ? Number(((passed / total) * 100).toFixed(2)) : 0,
    }

    return { result, summary }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
