import * as vscode from "vscode";
import * as helpers from "./helpers";

interface ClangFormatConfig {
  executable: string;
  style: string;
  fallbackStyle: string;
  assumeFilename: string;
}

export const defaultConfigure: ClangFormatConfig = {
  executable: "clang-format",
  style: "file",
  fallbackStyle: "none",
  assumeFilename: "",
};

function getConfigValue<T>(key: string, defaultValue: T, document: vscode.TextDocument): T {
  const config = vscode.workspace.getConfiguration("clang-format", document.uri);
  const language = helpers.getLanguage(document);

  // Try language-specific first, then global, then default
  return config.get<T>(`language.${language}.${key}`) ?? config.get<T>(key) ?? defaultValue;
}

export function getStyle(document: vscode.TextDocument): string {
  const style = getConfigValue("style", defaultConfigure.style, document);
  return helpers.doStringSubstitutions(style, document);
}

export function getFallbackStyle(document: vscode.TextDocument): string {
  return getConfigValue("fallbackStyle", defaultConfigure.fallbackStyle, document);
}
