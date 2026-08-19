import * as vscode from "vscode";
import * as logger from "./logger";
import * as cp from "child_process";
import * as path from "path";
import * as helpers from "./helpers";
import * as clangConfig from "./config";
import * as parser from "./parser";

function getAssumedFilename(document: vscode.TextDocument) {
  const config = vscode.workspace.getConfiguration("clang-format", document.uri);
  const assumedFilename = config.get<string>("assumeFilename") ?? "";
  if (assumedFilename === "") {
    return document.fileName;
  }
  const parsedPath = path.parse(document.fileName);
  const fileNoExtension = path.join(parsedPath.dir, parsedPath.name);
  return assumedFilename
    .replace(/\${file}/g, document.fileName)
    .replace(/\${fileNoExtension}/g, fileNoExtension)
    .replace(/\${fileBasename}/g, parsedPath.base)
    .replace(/\${fileBasenameNoExtension}/g, parsedPath.name)
    .replace(/\${fileExtname}/g, parsedPath.ext);
}

function getFormatArgs(document: vscode.TextDocument, range: vscode.Range | undefined): string[] {
  // Validate and sanitize style parameters
  let style = clangConfig.getStyle(document);
  let fallbackStyle = clangConfig.getFallbackStyle(document);
  const assumedFilename = getAssumedFilename(document);

  // Validate style parameter - only allow known values or file paths
  const validStyles = [
    "llvm",
    "google",
    "chromium",
    "mozilla",
    "webkit",
    "microsoft",
    "gnu",
    "file",
  ];
  const normalizedStyle = style.toLowerCase();
  if (
    !validStyles.includes(normalizedStyle) &&
    !normalizedStyle.startsWith("file:") &&
    !normalizedStyle.startsWith("{") &&
    !normalizedStyle.endsWith("}")
  ) {
    logger.log(`Warning: Invalid style value "${style}", falling back to "file"`);
    style = "file";
  }

  // Validate fallback style - only allow known values
  const validFallbackStyles = ["none", ...validStyles];
  if (!validFallbackStyles.includes(fallbackStyle.toLowerCase())) {
    logger.log(`Warning: Invalid fallback style "${fallbackStyle}", falling back to "none"`);
    fallbackStyle = "none";
  }

  const baseArgs = [
    "-output-replacements-xml",
    `-style=${style}`,
    `-fallback-style=${fallbackStyle}`,
    `-assume-filename=${assumedFilename}`,
  ];

  if (!range) {
    return baseArgs;
  }

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );

  if (range.isEqual(fullRange)) {
    return baseArgs;
  }

  const offset = document.offsetAt(range.start);
  const length = document.offsetAt(range.end) - offset;

  // fix character length to byte length
  const byteLength = Buffer.byteLength(
    document.getText().substring(offset, offset + length),
    "utf8",
  );
  // fix character offset to byte offset
  const byteOffset = Buffer.byteLength(document.getText().substring(0, offset), "utf8");

  return [...baseArgs, `-offset=${String(byteOffset)}`, `-length=${String(byteLength)}`];
}

/// Get execute name in clang-format.executable, if not found, use default value
/// If configure has changed, it will get the new value
function getExecutablePath(document?: vscode.TextDocument) {
  const platform = helpers.getPlatformString();
  const config = vscode.workspace.getConfiguration("clang-format", document?.uri);

  const platformExecPath = config.get<string>("executable." + platform);
  const defaultExecPath = config.get<string>("executable");
  const execPath = platformExecPath ?? defaultExecPath;

  if (!execPath) {
    return clangConfig.defaultConfig.executable;
  }

  // replace placeholders, if present
  return helpers.doStringSubstitutions(execPath, document);
}

function doFormatDocument(
  document: vscode.TextDocument,
  range: vscode.Range,
  token: vscode.CancellationToken,
): Promise<vscode.TextEdit[]> {
  return new Promise<vscode.TextEdit[]>((resolve, reject) => {
    let formatCommandBinPath: string | undefined;
    let child: cp.ChildProcess | undefined;
    const timeoutId = setTimeout(() => {
      cleanup();
      const timeoutError = new Error("Format operation timed out after 10 seconds");
      logger.log(`Formatting timed out after 10s for file: ${document.fileName}`);
      reject(timeoutError);
    }, 10000);

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (child) {
        child.kill();
      }
    };

    try {
      formatCommandBinPath = helpers.getBinPath(getExecutablePath(document));
      const codeContent = document.getText();

      const formatArgs = getFormatArgs(document, range);
      if (!formatArgs) {
        cleanup();
        throw new Error("Failed to get format arguments");
      }

      let workingPath = helpers.getWorkspaceFolder(document);
      if (!document.isUntitled && workingPath) {
        workingPath = path.dirname(document.fileName);
      }

      // On Windows, we need shell:true due to Node.js security changes
      // On other platforms, we keep shell:false for better security
      const useShell = process.platform === "win32";

      // Start the formatting process
      child = cp.spawn(formatCommandBinPath, formatArgs, {
        cwd: workingPath,
        windowsHide: true,
        shell: useShell,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("error", (err: Error) => {
        cleanup();
        logger.log(`Error spawning clang-format: ${err.message}`);
        reject(err);
      });

      child.on("exit", (code: number | null) => {
        cleanup();

        if (code !== 0) {
          logger.log(`clang-format exited with code ${String(code)}`);
          logger.log(`stderr: ${stderr}`);
          reject(new Error(`clang-format exited with code ${String(code)}: ${stderr}`));
          return;
        }

        if (!stdout) {
          // No changes needed
          resolve([]);
          return;
        }

        parser
          .getEdits(document, stdout, codeContent)
          .then(resolve)
          .catch((error: Error) => {
            logger.log(`Error getting edits: ${error.message}`);
            reject(error);
          });
      });

      // Write the code content to stdin
      if (child.stdin) {
        child.stdin.write(codeContent);
        child.stdin.end();
      }

      // Handle cancellation
      token.onCancellationRequested(() => {
        cleanup();
        logger.log(`Formatting cancelled for file: ${document.fileName}`);
        reject(new Error("Format cancelled"));
      });
    } catch (err: unknown) {
      cleanup();
      const errorMessage = err instanceof Error ? err.message : "unknown error";
      logger.log(`Error during formatting: ${errorMessage}`);
      reject(new Error(`Error during formatting: ${errorMessage}`, { cause: err }));
    }
  });
}

export function formatDocument(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  const token = new vscode.CancellationTokenSource().token;
  return doFormatDocument(document, fullRange, token);
}

export function formatRange(
  document: vscode.TextDocument,
  range: vscode.Range,
): Promise<vscode.TextEdit[]> {
  const token = new vscode.CancellationTokenSource().token;
  return doFormatDocument(document, range, token);
}
