import * as vscode from "vscode";
import { ALIAS } from "./shared/languageConfig";
import * as logger from "./logger";

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
