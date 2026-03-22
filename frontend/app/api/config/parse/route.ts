import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = body.data || '';
    
    const result = parsePlaywrightLogs(input);
    return NextResponse.json({ output: { tests: result.tests }, duplicates: result.duplicates });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function parsePlaywrightLogs(input: string) {
  const tests = [];
  const duplicates = [];
  const seenTests = new Set();
  const lines = input.split('\n').map(l => l.trim()).filter(l => l);

  const titleBlacklist = ["search tests", "next »", "« previous", "next", "previous"];
  const durationRegex = /^(\d+(\.\d+)?(ms|s|m|h))$/;
  const separatorRegex = /[—…\u2014\u2026]/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes('.spec.ts') && !separatorRegex.test(line)) {
      let titleIdx = i - 1;
      while (titleIdx >= 0) {
        const l = lines[titleIdx].toLowerCase();
        if (!l || durationRegex.test(l) || titleBlacklist.some(t => l.includes(t))) {
          titleIdx--;
          continue;
        }
        break;
      }

      const title = titleIdx >= 0 ? lines[titleIdx] : "Unknown Test";
      let projectName = "chromium";
      let k = i + 1;
      const steps = [];
      let foundBeforeHooks = false;

      while (k < lines.length) {
        const nextLine = lines[k];
        if (!nextLine) { k++; continue; }

        if (["chromium", "firefox", "webkit"].includes(nextLine.toLowerCase())) {
          projectName = nextLine.toLowerCase();
        }

        if (nextLine.includes("Before Hooks")) foundBeforeHooks = true;

        if (foundBeforeHooks) {
          const cleanedStep = nextLine.split(separatorRegex)[0].trim();
          if (cleanedStep && !durationRegex.test(cleanedStep)) {
            steps.push({ title: cleanedStep, skipped: false });
          }
        }

        if (nextLine.includes("After Hooks")) break;

        if (k + 1 < lines.length && lines[k+1].includes('.spec.ts') && !separatorRegex.test(lines[k+1])) {
          break;
        }
        k++;
      }

      if (steps.length > 0) {
        const key = `${title}-${projectName}`;
        if (seenTests.has(key)) {
          duplicates.push(title);
        } else {
          seenTests.add(key);
          tests.push({
            title,
            projectName,
            results: [{ steps }],
            ok: true
          });
        }
      }
      i = k;
    }
    i++;
  }

  return { tests, duplicates };
}
