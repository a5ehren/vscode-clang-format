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

export function getStyle(document: vscode.TextDocument) {
  const language = helpers.getLanguage(document);
  const config = vscode.workspace.getConfiguration("clang-format", document.uri);

  // Get language-specific style with document URI
  const languageStyleKey = `language.${language}.style`;

  let ret = config.get<string>(languageStyleKey) ?? "";

  ret = helpers.doStringSubstitutions(ret, document);

  if (ret.trim()) {
    return ret;
  }

  // Fallback to global style
  ret = config.get<string>("style") ?? "";
  ret = helpers.doStringSubstitutions(ret, document);

  const finalStyle = ret.trim() ? ret : defaultConfigure.style;
  return finalStyle;
}

export function getFallbackStyle(document: vscode.TextDocument) {
  // Get language-specific fallback style with document URI
  const config = vscode.workspace.getConfiguration("clang-format", document.uri);
  let strConf = config.get<string>(`language.${helpers.getLanguage(document)}.fallbackStyle`);
  if (strConf?.trim()) {
    return strConf;
  }

  // Try global fallback style
  strConf = config.get<string>("fallbackStyle");
  if (strConf?.trim()) {
    return strConf;
  }

  // If no fallback style is configured, use default
  return defaultConfigure.fallbackStyle;
}
