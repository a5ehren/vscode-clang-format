import * as vscode from "vscode";
import { MODES } from "./clangMode";
import * as logger from "./logger";
import { formatDocument, formatRange } from "./formatter";

let diagnosticCollection: vscode.DiagnosticCollection;

export class ClangDocumentFormattingEditProvider
  implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        return formatDocument(document);
    }

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        return formatRange(document, range);
    }
}

export function activate(ctx: vscode.ExtensionContext): void {
  // Initialize diagnostic collection
  diagnosticCollection = vscode.languages.createDiagnosticCollection("clang-format");
  ctx.subscriptions.push(diagnosticCollection);
  ctx.subscriptions.push(logger.outputChannel);

  const formatter = new ClangDocumentFormattingEditProvider();
  const availableLanguages = new Set<string>();

  for (const mode of MODES) {
    if (typeof mode.language === "string") {
      ctx.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider(mode, formatter),
        vscode.languages.registerDocumentFormattingEditProvider(mode, formatter),
      );
      availableLanguages.add(mode.language);
    }
  }
}
