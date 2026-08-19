import * as vscode from "vscode";

export const outputChannel = vscode.window.createOutputChannel("Clang-Format");

export function log(message: string): void {
  outputChannel.appendLine(message);
}

export function showLog(): void {
  outputChannel.show();
}
