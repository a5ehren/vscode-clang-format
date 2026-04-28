import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { ClangDocumentFormattingEditProvider } from "../extension";

interface FakeInvocation {
  args: string[];
  input: string;
  mode: string;
}

const configurationTarget = vscode.ConfigurationTarget.Global;

const configKeys = [
  "executable",
  "executable.linux",
  "executable.osx",
  "executable.windows",
  "style",
  "fallbackStyle",
  "language.cpp.style",
  "language.cpp.fallbackStyle",
];

suite("Clang-Format formatter", () => {
  let tempDir: string;
  let fakeClangFormat: string;
  let invocationLog: string;
  const originalConfig = new Map<string, unknown>();

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("ebextensions.clang-format-2025");
    assert.ok(extension, "extension should be available in the test host");
    await extension.activate();

    const config = vscode.workspace.getConfiguration("clang-format");
    for (const key of configKeys) {
      originalConfig.set(key, config.get(key));
    }
  });

  setup(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-clang-format-test-"));
    fakeClangFormat = path.join(tempDir, "fake-clang-format.js");
    invocationLog = path.join(tempDir, "invocations.jsonl");
    fs.writeFileSync(fakeClangFormat, fakeClangFormatScript(), { mode: 0o755 });

    process.env.FAKE_CLANG_FORMAT_RECORD = invocationLog;
    process.env.FAKE_CLANG_FORMAT_MODE = "empty";
    process.env.FAKE_CLANG_FORMAT_OUTPUT = "";

    await resetClangFormatConfiguration();
    await updateConfig("executable", fakeClangFormat);
  });

  teardown(async () => {
    delete process.env.FAKE_CLANG_FORMAT_RECORD;
    delete process.env.FAKE_CLANG_FORMAT_MODE;
    delete process.env.FAKE_CLANG_FORMAT_OUTPUT;
    await resetClangFormatConfiguration();
    fs.rmSync(tempDir, { force: true, recursive: true });
  });

  test("returns text edits from clang-format XML replacements", async () => {
    process.env.FAKE_CLANG_FORMAT_MODE = "replace-all";
    process.env.FAKE_CLANG_FORMAT_OUTPUT = "int main() {\n  return 0;\n}\n";
    const document = await openCppDocument(tempDir, "int main(){return 0;}\n");

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { insertSpaces: true, tabSize: 2 },
    );

    assert.ok(edits);
    assert.strictEqual(applyEdits(document.getText(), edits), process.env.FAKE_CLANG_FORMAT_OUTPUT);
    const [invocation] = readInvocations();
    assert.deepStrictEqual(invocation.args.slice(0, 3), [
      "-output-replacements-xml",
      "-style=file",
      "-fallback-style=LLVM",
    ]);
  });

  test("passes UTF-8 byte offsets and lengths for range formatting", async () => {
    const source = "int café(){return 0;}\nint keep(){return 1;}\n";
    const document = await openCppDocument(tempDir, source);
    const range = new vscode.Range(new vscode.Position(0, 4), new vscode.Position(0, 18));

    await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatRangeProvider",
      document.uri,
      range,
      { insertSpaces: true, tabSize: 2 },
    );

    const [invocation] = readInvocations();
    const offset = document.offsetAt(range.start);
    const length = document.offsetAt(range.end) - offset;
    assert.ok(
      invocation.args.includes(`-offset=${Buffer.byteLength(source.substring(0, offset), "utf8")}`),
    );
    assert.ok(
      invocation.args.includes(
        `-length=${Buffer.byteLength(source.substring(offset, offset + length), "utf8")}`,
      ),
    );
  });

  test("uses language-specific style and fallback style before global settings", async () => {
    await updateConfig("style", "LLVM");
    await updateConfig("fallbackStyle", "Google");
    await updateConfig("language.cpp.style", "Mozilla");
    await updateConfig("language.cpp.fallbackStyle", "WebKit");
    const document = await openCppDocument(tempDir, "int main(){return 0;}\n");

    await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { insertSpaces: true, tabSize: 2 },
    );

    const [invocation] = readInvocations();
    assert.ok(invocation.args.includes("-style=Mozilla"));
    assert.ok(invocation.args.includes("-fallback-style=WebKit"));
  });

  test("rejects when clang-format exits with a nonzero status", async () => {
    process.env.FAKE_CLANG_FORMAT_MODE = "fail";
    const document = await openCppDocument(tempDir, "int main(){return 0;}\n");
    const provider = new ClangDocumentFormattingEditProvider();

    await assert.rejects(async () => {
      await provider.formatDocument(document);
    }, /simulated clang-format failure/);
  });

  async function resetClangFormatConfiguration() {
    for (const key of configKeys) {
      await updateConfig(key, originalConfig.get(key));
    }
  }

  async function updateConfig(key: string, value: unknown) {
    await vscode.workspace.getConfiguration("clang-format").update(key, value, configurationTarget);
  }

  function readInvocations(): FakeInvocation[] {
    return fs
      .readFileSync(invocationLog, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FakeInvocation);
  }
});

async function openCppDocument(directory: string, content: string): Promise<vscode.TextDocument> {
  const filePath = path.join(directory, "sample.cpp");
  fs.writeFileSync(filePath, content);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  if (document.languageId === "cpp") {
    return document;
  }
  return vscode.languages.setTextDocumentLanguage(document, "cpp");
}

function applyEdits(text: string, edits: readonly vscode.TextEdit[]): string {
  return [...edits]
    .sort((left, right) => right.range.start.compareTo(left.range.start))
    .reduce((updatedText, edit) => {
      const start = offsetAt(updatedText, edit.range.start);
      const end = offsetAt(updatedText, edit.range.end);
      return updatedText.slice(0, start) + edit.newText + updatedText.slice(end);
    }, text);
}

function offsetAt(text: string, position: vscode.Position): number {
  const lines = text.split(/\n/);
  let offset = 0;
  for (let line = 0; line < position.line; line++) {
    offset += lines[line].length + 1;
  }
  return offset + position.character;
}

function fakeClangFormatScript(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
});

process.stdin.on("end", () => {
  const mode = process.env.FAKE_CLANG_FORMAT_MODE || "empty";
  const recordPath = process.env.FAKE_CLANG_FORMAT_RECORD;
  if (recordPath) {
    fs.appendFileSync(
      recordPath,
      JSON.stringify({ args: process.argv.slice(2), input, mode }) + "\\n",
    );
  }

  if (mode === "fail") {
    process.stderr.write("simulated clang-format failure");
    process.exit(7);
  }

  if (mode === "replace-all") {
    const output = process.env.FAKE_CLANG_FORMAT_OUTPUT || "";
    process.stdout.write(
      '<replacements xml:space="preserve"><replacement offset="0" length="' +
        Buffer.byteLength(input, "utf8") +
        '">' +
        escapeXml(output) +
        '</replacement></replacements>',
    );
    return;
  }

  process.stdout.write('<replacements xml:space="preserve"></replacements>');
});
`;
}
