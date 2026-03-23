type TestMetrics = {
  asserts: number
  lines: number
}

type ParsedPythonTest = {
  name: string
  body: string
  complexity: number
  metrics: TestMetrics
}

type WeightedTestcase = {
  name: string
  weightage: number
  reason?: string
}

function orderedUnique(values: string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const value of values) {
    if (value && !seen.has(value)) {
      seen.add(value)
      ordered.push(value)
    }
  }
  return ordered
}

function fallbackParsePythonTests(inputText: string): ParsedPythonTest[] {
  const testPattern = /def\s+(test_[a-zA-Z0-9_]+)\s*\(/g
  const lines = inputText.split(/\r?\n/)
  const testData: ParsedPythonTest[] = []

  let currentTest: string | null = null
  let testBody: string[] = []

  for (const line of lines) {
    const match = line.match(/def\s+(test_[a-zA-Z0-9_]+)\s*\(/)
    if (match) {
      if (currentTest) {
        const body = testBody.join('\n')
        const assertCount = (body.match(/\bassert\b/g) || []).length
        const lineCount = body.split(/\r?\n/).length
        testData.push({
          name: currentTest,
          body,
          complexity: assertCount * 3 + lineCount,
          metrics: { asserts: assertCount, lines: lineCount },
        })
      }
      currentTest = match[1]
      testBody = []
      testPattern.lastIndex = 0
    } else if (currentTest) {
      testBody.push(line)
    }
  }

  if (currentTest) {
    const body = testBody.join('\n')
    const assertCount = (body.match(/\bassert\b/g) || []).length
    const lineCount = body.split(/\r?\n/).length
    testData.push({
      name: currentTest,
      body,
      complexity: assertCount * 3 + lineCount,
      metrics: { asserts: assertCount, lines: lineCount },
    })
  }

  return testData
}

function parsePythonTests(inputText: string): ParsedPythonTest[] {
  const regex = /^(?:async\s+def|def)\s+(test_[a-zA-Z0-9_]+)\s*\([^\n]*\):/gm
  const matches = Array.from(inputText.matchAll(regex))
  if (matches.length === 0) {
    return fallbackParsePythonTests(inputText)
  }

  const tests: ParsedPythonTest[] = []
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const start = match.index ?? 0
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? inputText.length) : inputText.length
    const body = inputText.slice(start, end).trimEnd()
    const bodyLines = body.split(/\r?\n/)
    const lineCount = bodyLines.slice(1).filter((line) => line.trim()).length
    const assertCount = (body.match(/\bassert\b/g) || []).length
    tests.push({
      name: match[1],
      body,
      complexity: assertCount * 3 + lineCount,
      metrics: { asserts: assertCount, lines: lineCount },
    })
  }

  return tests
}

function extractAssertions(body: string): string[] {
  const assertions = Array.from(body.matchAll(/assert\s+([^\n]+)/g)).map((match) => match[1].trim())
  const raises = Array.from(body.matchAll(/with\s+([A-Za-z0-9_\.]+)\s*\(([^\)]*)\)\s*:/g)).flatMap((match) => {
    return match[1].endsWith('raises') ? [`raises ${match[2].trim() || 'an exception'}`] : []
  })
  return orderedUnique([...assertions, ...raises])
}

function extractCalls(body: string): string[] {
  const calls = Array.from(body.matchAll(/([A-Za-z_][A-Za-z0-9_\.]*)\s*\(/g)).map((match) => match[1])
  return orderedUnique(calls.filter((call) => call && !call.endsWith('raises') && !['def', 'if', 'for', 'while', 'return', 'with'].includes(call)))
}

function inferFocusArea(name: string, body: string): string {
  const text = `${name} ${body}`.toLowerCase()
  if (['vector', 'embedding', 'retriev', 'rag', 'store', 'index'].some((token) => text.includes(token))) return 'retrieval and vector-store behavior'
  if (['prompt', 'llm', 'model', 'completion'].some((token) => text.includes(token))) return 'prompt construction or model interaction'
  if (['api', 'request', 'response', 'client', '.get(', '.post(', 'http'].some((token) => text.includes(token))) return 'request-response behavior'
  if (['auth', 'token', 'login', 'session', 'permission'].some((token) => text.includes(token))) return 'authentication or access control behavior'
  return 'a specific unit of application behavior'
}

function impactSentence(focusArea: string): string {
  if (focusArea === 'retrieval and vector-store behavior') return 'If this behavior breaks, retrieval quality or storage configuration can fail even when the rest of the pipeline still runs.'
  if (focusArea === 'prompt construction or model interaction') return 'If this behavior breaks, the system can generate wrong prompts or mishandle model-facing flows.'
  if (focusArea === 'request-response behavior') return 'If this behavior breaks, user-facing request handling can fail even when lower-level helpers still work.'
  if (focusArea === 'authentication or access control behavior') return 'If this behavior breaks, protected flows can become inaccessible or incorrectly exposed.'
  return 'If this behavior breaks, an important application flow can stop behaving as expected.'
}

function describePythonTestBehavior(test: ParsedPythonTest): string {
  const focusArea = inferFocusArea(test.name, test.body)
  const impact = impactSentence(focusArea)
  const assertions = extractAssertions(test.body)
  const calls = extractCalls(test.body)
  const parts = [`It focuses on ${focusArea}.`]

  if (calls.length > 0) {
    parts.push(`The test exercises ${calls.slice(0, 3).map((call) => `\`${call}\``).join(', ')}.`)
  }
  if (assertions.length > 0) {
    parts.push(`It specifically verifies ${assertions.slice(0, 2).map((item) => `\`${item}\``).join('; ')}.`)
  } else {
    parts.push('It mainly validates that the code path runs without breaking.')
  }

  parts.push(impact)
  return parts.join(' ')
}

export function buildPythonWeightageOutput(code: string, strategy: string) {
  const testInfo = parsePythonTests(code)

  if (testInfo.length === 0) {
    return {
      output: [{
        testcases: [],
        testcase_path: '/home/coder/project/workspace/pytest',
        evaluation_type: 'pytest',
        testcase_run_command: 'sh /home/coder/project/workspace/pytest/run.sh',
      }],
    }
  }

  if (strategy !== 'intelligent') {
    return null
  }

  let totalComplexity = testInfo.reduce((sum, test) => sum + test.complexity, 0)
  if (totalComplexity === 0) {
    totalComplexity = testInfo.length
    for (const test of testInfo) test.complexity = 1
  }

  const avgComplexity = totalComplexity / testInfo.length
  let currentSum = 0
  const testcases: WeightedTestcase[] = []

  for (let i = 0; i < testInfo.length; i += 1) {
    const test = testInfo[i]
    const weightage = i === testInfo.length - 1 ? Number((1 - currentSum).toFixed(3)) : Number((test.complexity / totalComplexity).toFixed(3))
    if (i !== testInfo.length - 1) currentSum += weightage

    let classification = 'Medium'
    let impactReason = 'It receives medium weightage because it protects meaningful behavior with scope close to the average submitted test.'
    if (test.complexity > avgComplexity * 1.5) {
      classification = 'Highly Important'
      impactReason = 'It receives higher weightage because it covers more logic or verification depth than most of the submitted tests.'
    } else if (test.complexity < avgComplexity * 0.5) {
      classification = 'Easy'
      impactReason = 'It receives lower weightage because it protects a smaller and narrower behavior than most of the submitted tests.'
    }

    const behaviorSummary = describePythonTestBehavior(test)
    testcases.push({
      name: test.name,
      weightage,
      reason: `Test '${test.name}' analysis: ${behaviorSummary} Within this submitted test set, it contains ${test.metrics.asserts} assertions over ${test.metrics.lines} active lines, which gives it a complexity score of ${test.complexity} versus an average of ${Number(avgComplexity.toFixed(2))}. That places it in the '${classification}' group. ${impactReason} This is why the assigned weightage is ${weightage}.`,
    })
  }

  return {
    output: [{
      testcases,
      testcase_path: '/home/coder/project/workspace/pytest',
      evaluation_type: 'pytest',
      testcase_run_command: 'sh /home/coder/project/workspace/pytest/run.sh',
    }],
  }
}
