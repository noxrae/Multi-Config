import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = body.data || '';
    
    // Logic from generate_weightage_config
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    const tests = data.tests || [];
    const duplicates = [];
    const seenNames = new Set();
    const uniqueTests = [];

    for (const test of tests) {
      const title = test.title;
      if (seenNames.has(title)) {
        duplicates.push(title);
      } else {
        seenNames.add(title);
        uniqueTests.push(test);
      }
    }

    const n = uniqueTests.length;
    const d = 0.001;
    let a = (1 - (n * (n - 1) * d) / 2) / n;
    
    const testcases = [];
    let currentTotal = 0.0;

    for (let i = 0; i < n; i++) {
      let weight;
      if (i === n - 1) {
        weight = Number((1.0 - currentTotal).toFixed(3));
      } else {
        weight = Number((a + i * d).toFixed(3));
        if (weight <= 0) weight = Number((1.0 / n).toFixed(3));
        currentTotal += weight;
      }
      testcases.push({ name: uniqueTests[i].title, weightage: weight });
    }

    const config = [{
      testcases,
      testcase_path: "/home/coder/project/workspace/nodejest",
      evaluation_type: "Node Jest",
      testcase_run_command: "sh /home/coder/project/workspace/nodejest/run.sh"
    }];

    return NextResponse.json({ output: config, duplicates });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
