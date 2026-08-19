import * as vscode from "vscode";
import { ALIAS } from "./shared/languageConfig";
import { sync as whichSync } from "which";
import * as logger from "./logger";
import { statSync } from "fs";
import * as path from "path";

export function getPlatformString() {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "linux":
      return "linux";
    case "darwin":
      return "osx";
  }

  return "unknown";
}

export function getLanguage(document: vscode.TextDocument): string {
  const langId = document.languageId;
  const mappedLang = (ALIAS as Record<string, string>)[langId] || langId;
  logger.log(`Document language ID: ${langId}, mapped to: ${mappedLang}`);
  return mappedLang;
}

export function getWorkspaceFolder(document?: vscode.TextDocument): string | undefined {
  if (document) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }
  }

  // Fallback to first workspace folder if no document is provided
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

  return undefined;
}

/// Return the input string after replacing placeholders like ${workspaceFolder}
// and ${env:X}. The document parameter is used for finding the workspace folder
export function doStringSubstitutions(input: string, document?: vscode.TextDocument): string {
  return input
    .replace(/\${workspaceRoot}/g, getWorkspaceFolder(document) ?? "")
    .replace(/\${workspaceFolder}/g, getWorkspaceFolder(document) ?? "")
    .replace(/\${cwd}/g, process.cwd())
    .replace(/\${env[.:]([^}]+)}/g, (sub: string, envName: string) => {
      if (!/^[a-z_]\w*$/i.test(envName)) {
        logger.log(`Warning: Invalid environment variable name: ${envName}`);
        return "";
      }
      return process.env[envName] ?? "";
    });
}

/**
 * Get the path to a binary by searching PATH
 * @param binname The name of the binary to find
 * @returns The full path to the binary
 */
export function getBinPath(binname: string): string {
  try {
    // Try to find the binary using which
    const binPath = whichSync(binname);

    // Validate the path and handle spaces properly
    if (binPath?.trim()) {
      // Normalize the path to handle platform-specific separators
      const normalizedPath = path.normalize(binPath.trim());

      // Verify the path exists and is accessible
      try {
        const stats = statSync(normalizedPath);
        if (stats.isFile()) {
          return normalizedPath;
        }
      } catch (statError: unknown) {
        // Path exists but stat failed, log warning but continue
        const statErrorMessage = statError instanceof Error ? statError.message : String(statError);

        logger.log(`Warning: Could not stat binary at ${normalizedPath}: ${statErrorMessage}`);
        return normalizedPath;
      }
    }

    // If we get here, something went wrong with the path
    throw new Error(`Invalid binary path returned by which: ${binPath}`);
  } catch (error) {
    // If which fails, return the binary name as-is
    // This maintains compatibility with the old behavior
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.log(`Could not find binary '${binname}' in PATH: ${errorMessage}`);
    return binname;
  }
}
