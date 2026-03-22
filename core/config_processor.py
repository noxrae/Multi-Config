import ast
import json
import re
from typing import Any, Dict, List, Set


def parse_playwright_logs(input_text: str) -> Dict[str, Any]:
    tests: List[Dict[str, Any]] = []
    duplicates: List[str] = []
    seen_tests: Set[str] = set()
    lines = [line.strip() for line in input_text.splitlines() if line.strip()]

    title_blacklist = ["search tests", "next »", "« previous", "next", "previous"]
    duration_regex = re.compile(r'^(\d+(\.\d+)?(ms|s|m|h))$')
    separator_regex = re.compile(r'[—…\u2014\u2026]')

    i = 0
    while i < len(lines):
        if '.spec.ts' in lines[i] and not separator_regex.search(lines[i]):
            title_idx = i - 1
            while title_idx >= 0:
                line_lower = lines[title_idx].lower()
                if not line_lower or duration_regex.match(line_lower) or any(term in line_lower for term in title_blacklist):
                    title_idx -= 1
                    continue
                break

            title = lines[title_idx] if title_idx >= 0 else "Unknown Test"
            project_name = "chromium"
            k = i + 1
            steps: List[Dict[str, Any]] = []
            found_before_hooks = False

            while k < len(lines):
                line = lines[k]
                if not line:
                    k += 1
                    continue

                if line.lower() in ["chromium", "firefox", "webkit"]:
                    project_name = line.lower()

                if "Before Hooks" in line:
                    found_before_hooks = True

                if found_before_hooks:
                    cleaned_step = separator_regex.split(line)[0].strip()
                    if cleaned_step and not duration_regex.match(cleaned_step):
                        steps.append({"title": cleaned_step, "skipped": False})

                if "After Hooks" in line:
                    break

                if k + 1 < len(lines) and '.spec.ts' in lines[k + 1] and not separator_regex.search(lines[k + 1]):
                    break
                k += 1

            if steps:
                test_key = f"{title}-{project_name}"
                if test_key in seen_tests:
                    duplicates.append(title)
                else:
                    seen_tests.add(test_key)
                    tests.append({
                        "title": title,
                        "projectName": project_name,
                        "results": [{"steps": steps}],
                        "ok": True,
                    })
            i = k
        i += 1

    return {"tests": tests, "duplicates": duplicates}


def _fallback_parse_python_tests(input_text: str) -> List[Dict[str, Any]]:
    test_data: List[Dict[str, Any]] = []
    test_pattern = re.compile(r'def\s+(test_[a-zA-Z0-9_]+)\s*\(')
    lines = input_text.splitlines()

    current_test = None
    test_body: List[str] = []

    for line in lines:
        match = test_pattern.search(line)
        if match:
            if current_test:
                body = "\n".join(test_body)
                assert_count = body.count("assert")
                line_count = len(body.splitlines())
                test_data.append({
                    "name": current_test,
                    "body": body,
                    "complexity": assert_count * 3 + line_count,
                    "metrics": {"asserts": assert_count, "lines": line_count},
                })
            current_test = match.group(1)
            test_body = []
        elif current_test:
            test_body.append(line)

    if current_test:
        body = "\n".join(test_body)
        assert_count = body.count("assert")
        line_count = len(body.splitlines())
        test_data.append({
            "name": current_test,
            "body": body,
            "complexity": assert_count * 3 + line_count,
            "metrics": {"asserts": assert_count, "lines": line_count},
        })

    return test_data


def _iter_python_test_nodes(module: ast.Module):
    for node in module.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_"):
            yield node
        elif isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and child.name.startswith("test_"):
                    yield child


def parse_python_tests(input_text: str) -> List[Dict[str, Any]]:
    try:
        module = ast.parse(input_text)
    except SyntaxError:
        return _fallback_parse_python_tests(input_text)

    test_data: List[Dict[str, Any]] = []
    for node in _iter_python_test_nodes(module):
        body = ast.get_source_segment(input_text, node) or "\n".join(input_text.splitlines()[node.lineno - 1:node.end_lineno])
        assert_count = sum(isinstance(child, ast.Assert) for child in ast.walk(node))
        line_count = len([line for line in body.splitlines()[1:] if line.strip()])
        test_data.append({
            "name": node.name,
            "body": body,
            "complexity": assert_count * 3 + line_count,
            "metrics": {"asserts": assert_count, "lines": line_count},
        })

    return test_data


def _ordered_unique(values: List[str]) -> List[str]:
    seen: Set[str] = set()
    ordered: List[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        left = _call_name(node.value)
        return f"{left}.{node.attr}" if left else node.attr
    if isinstance(node, ast.Call):
        return _call_name(node.func)
    return ""


def _safe_unparse(node: ast.AST) -> str:
    try:
        return ast.unparse(node)
    except Exception:
        return "expression"


def _extract_assertions(function_node: ast.AST) -> List[str]:
    details: List[str] = []
    for child in ast.walk(function_node):
        if isinstance(child, ast.Assert):
            details.append(_safe_unparse(child.test))
        elif isinstance(child, ast.With):
            for item in child.items:
                context_expr = item.context_expr
                if isinstance(context_expr, ast.Call) and _call_name(context_expr.func).endswith("raises"):
                    exc_name = _safe_unparse(context_expr.args[0]) if context_expr.args else "an exception"
                    details.append(f"raises {exc_name}")
    return _ordered_unique(details)


def _extract_calls(function_node: ast.AST) -> List[str]:
    calls = [_call_name(child.func) for child in ast.walk(function_node) if isinstance(child, ast.Call)]
    return [call for call in _ordered_unique(calls) if call and not call.endswith("raises")]


def _infer_focus_area(name: str, body: str) -> str:
    text = f"{name} {body}".lower()
    if any(token in text for token in ["vector", "embedding", "retriev", "rag", "store", "index"]):
        return "retrieval and vector-store behavior"
    if any(token in text for token in ["prompt", "llm", "model", "completion"]):
        return "prompt construction or model interaction"
    if any(token in text for token in ["api", "request", "response", "client", ".get(", ".post(", "http"]):
        return "request-response behavior"
    if any(token in text for token in ["auth", "token", "login", "session", "permission"]):
        return "authentication or access control behavior"
    return "a specific unit of application behavior"


def _impact_sentence(focus_area: str) -> str:
    if focus_area == "retrieval and vector-store behavior":
        return "If this behavior breaks, retrieval quality or storage configuration can fail even when the rest of the pipeline still runs."
    if focus_area == "prompt construction or model interaction":
        return "If this behavior breaks, the system can generate wrong prompts or mishandle model-facing flows."
    if focus_area == "request-response behavior":
        return "If this behavior breaks, user-facing request handling can fail even when lower-level helpers still work."
    if focus_area == "authentication or access control behavior":
        return "If this behavior breaks, protected flows can become inaccessible or incorrectly exposed."
    return "If this behavior breaks, an important application flow can stop behaving as expected."


def describe_python_test_behavior(test: Dict[str, Any]) -> str:
    body = str(test.get("body", ""))
    focus_area = _infer_focus_area(str(test.get("name", "")), body)
    impact = _impact_sentence(focus_area)

    try:
        module = ast.parse(body)
        function_node = next(
            node for node in module.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        )
    except Exception:
        return f"It focuses on {focus_area}. {impact}"

    assertions = _extract_assertions(function_node)
    calls = _extract_calls(function_node)
    parts: List[str] = [f"It focuses on {focus_area}."]

    if calls:
        shown_calls = ", ".join(f"`{call}`" for call in calls[:3])
        parts.append(f"The test exercises {shown_calls}.")
    if assertions:
        shown_assertions = "; ".join(f"`{item}`" for item in assertions[:2])
        parts.append(f"It specifically verifies {shown_assertions}.")
    else:
        parts.append("It mainly validates that the code path runs without breaking.")

    parts.append(impact)
    return " ".join(parts)


def generate_python_weightage(input_text: str, strategy: str = "equal") -> Dict[str, Any]:
    try:
        test_info = parse_python_tests(input_text)
        if not test_info:
            return {"config": [], "duplicates": []}

        n = len(test_info)
        testcases = []

        if strategy == "equal":
            weight = round(1.0 / n, 3)
            current_sum = 0.0
            for i, test in enumerate(test_info):
                if i == n - 1:
                    w = round(1.0 - current_sum, 3)
                else:
                    w = weight
                    current_sum += w
                testcases.append({"name": test["name"], "weightage": w})

        elif strategy == "gradual":
            d = 0.01
            a = (1.0 - (n * (n - 1) * d) / 2.0) / n
            if a <= 0:
                a = 1.0 / (n * 2)
                d = (1.0 - n * a) / (n * (n - 1) / 2.0)

            current_sum = 0.0
            for i, test in enumerate(test_info):
                if i == n - 1:
                    w = round(1.0 - current_sum, 3)
                else:
                    w = round(a + i * d, 3)
                    current_sum += w
                testcases.append({"name": test["name"], "weightage": w})

        elif strategy == "manual":
            for test in test_info:
                testcases.append({"name": test["name"], "weightage": 0.0})

        elif strategy == "intelligent":
            total_complexity = sum(t["complexity"] for t in test_info)
            if total_complexity == 0:
                total_complexity = n
                for t in test_info:
                    t["complexity"] = 1

            current_sum = 0.0
            avg_complexity = total_complexity / n if n > 0 else 1

            for i, test in enumerate(test_info):
                if i == n - 1:
                    w = round(1.0 - current_sum, 3)
                else:
                    w = round(test["complexity"] / total_complexity, 3)
                    current_sum += w

                comp = test["complexity"]
                metrics = test.get("metrics", {"asserts": 0, "lines": 0})
                if comp > avg_complexity * 1.5:
                    classification = "Highly Important"
                    impact_reason = "It receives higher weightage because it covers more logic or verification depth than most of the submitted tests."
                elif comp < avg_complexity * 0.5:
                    classification = "Easy"
                    impact_reason = "It receives lower weightage because it protects a smaller and narrower behavior than most of the submitted tests."
                else:
                    classification = "Medium"
                    impact_reason = "It receives medium weightage because it protects meaningful behavior with scope close to the average submitted test."

                behavior_summary = describe_python_test_behavior(test)
                reason = (
                    f"Test '{test['name']}' analysis: {behavior_summary} "
                    f"Within this submitted test set, it contains {metrics['asserts']} assertions over {metrics['lines']} active lines, "
                    f"which gives it a complexity score of {comp} versus an average of {round(avg_complexity, 2)}. "
                    f"That places it in the '{classification}' group. {impact_reason} "
                    f"This is why the assigned weightage is {w}."
                )
                testcases.append({"name": test["name"], "weightage": w, "reason": reason})

        config = [{
            "testcases": testcases,
            "testcase_path": "/home/coder/project/workspace/pytest",
            "evaluation_type": "pytest",
            "testcase_run_command": "sh /home/coder/project/workspace/pytest/run.sh",
        }]
        return {"config": config, "duplicates": []}
    except Exception as e:
        return {"config": [], "duplicates": [], "error": str(e)}


def generate_weightage_config(input_data: Any) -> Dict[str, Any]:
    try:
        data = json.loads(input_data) if isinstance(input_data, str) else input_data
        tests = data.get("tests", [])
        duplicates: List[str] = []
        seen_names: Set[str] = set()

        if not tests:
            return {"config": [], "duplicates": []}

        unique_tests = []
        for test in tests:
            title = test.get("title")
            if title in seen_names:
                duplicates.append(title)
            else:
                seen_names.add(title)
                unique_tests.append(test)

        n = len(unique_tests)
        d = 0.001
        a = (1 - (n * (n - 1) * d) / 2) / n

        testcases = []
        current_total = 0.0

        for index, test in enumerate(unique_tests):
            if index == n - 1:
                weight = round(1.0 - current_total, 3)
            else:
                weight = round(a + index * d, 3)
                if weight <= 0:
                    weight = round(1.0 / n, 3)
                current_total += weight

            testcases.append({
                "name": test.get("title"),
                "weightage": weight,
            })

        config = [{
            "testcases": testcases,
            "testcase_path": "/home/coder/project/workspace/nodejest",
            "evaluation_type": "Node Jest",
            "testcase_run_command": "sh /home/coder/project/workspace/nodejest/run.sh",
        }]

        return {"config": config, "duplicates": duplicates}
    except Exception:
        return {"config": [], "duplicates": []}
