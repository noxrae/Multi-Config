import { NextRequest, NextResponse } from 'next/server'

import { buildPythonWeightageOutput } from '@/lib/server/python-weightage'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json()
    const strategy = body.strategy || 'equal'

    if (strategy === 'intelligent') {
      const intelligentOutput = buildPythonWeightageOutput(body.data || '', strategy)
      return NextResponse.json(intelligentOutput)
    }

    const tests = parsePythonTests(body.data || '')
    const n = tests.length
    let testcases: Array<{ name: string; weightage: number }> = []
    let currentSum = 0.0

    if (n === 0) {
      return NextResponse.json({
        output: [{
          testcases: [],
          testcase_path: '/home/coder/project/workspace/pytest',
          evaluation_type: 'pytest',
          testcase_run_command: 'sh /home/coder/project/workspace/pytest/run.sh'
        }]
      })
    }

    if (strategy === 'equal') {
      const weight = Number((1.0 / n).toFixed(3))
      testcases = tests.map((t, i) => {
        const w = i === n - 1 ? Number((1.0 - currentSum).toFixed(3)) : weight
        currentSum += w
        return { name: t, weightage: w }
      })
    } else if (strategy === 'manual') {
      testcases = tests.map((t) => ({ name: t, weightage: 0.0 }))
    } else if (strategy === 'gradual') {
      const d = 0.01
      let a = (1.0 - (n * (n - 1) * d) / 2.0) / n
      if (a <= 0) a = 1.0 / (n * 2)

      testcases = tests.map((t, i) => {
        let w
        if (i === n - 1) {
          w = Number((1.0 - currentSum).toFixed(3))
        } else {
          w = Number((a + i * d).toFixed(3))
        }
        currentSum += w
        return { name: t, weightage: w }
      })
    }

    const output = [{
      testcases,
      testcase_path: '/home/coder/project/workspace/pytest',
      evaluation_type: 'pytest',
      testcase_run_command: 'sh /home/coder/project/workspace/pytest/run.sh'
    }]

    return NextResponse.json({ output })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function parsePythonTests(code: string): string[] {
  const classMethodRegex = /^\s*def\s+(test_[a-zA-Z0-9_]+)\s*\(/gm
  const matches: string[] = []
  let match: RegExpExecArray | null

  while ((match = classMethodRegex.exec(code)) !== null) {
    matches.push(match[1])
  }

  return matches
}
