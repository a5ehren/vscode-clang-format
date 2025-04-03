import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');
import {MODES,
        ALIAS} from './clangMode';
import {getBinPath} from './clangPath';
import sax = require('sax');

export let outputChannel = vscode.window.createOutputChannel('Clang-Format');
let diagnosticCollection: vscode.DiagnosticCollection;

function getPlatformString() {
  switch(process.platform) {
    case 'win32': return 'windows';
    case 'linux': return 'linux';
    case 'darwin': return 'osx';
  }

  return 'unknown';
}

export class ClangDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
  private defaultConfigure = {
    executable: 'clang-format',
    style: 'file',
    fallbackStyle: 'none',
    assumeFilename: ''
  };

  public provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    return this.doFormatDocument(document, fullRange, options, token);
  }

  public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
    return this.doFormatDocument(document, range, options, token);
  }

  private getEdits(document: vscode.TextDocument, xml: string, codeContent: string): Thenable<vscode.TextEdit[]> {
    return new Promise((resolve, reject) => {
      // Use strict XML parsing
      let options = {
        trim: false,
        normalize: false,
        strict: true,
        lowercase: true
      };
      
      let parser = sax.parser(true, options);
      let edits: vscode.TextEdit[] = [];
      let currentEdit: { length: number, offset: number, text: string } | undefined;

      // Create a reusable buffer for UTF-8 calculations
      const textEncoder = new TextEncoder();
      const getUtf8Length = (str: string, start: number, len: number): number => {
        return textEncoder.encode(str.substring(start, start + len)).length;
      };

      const byteToOffset = function(editInfo: { length: number, offset: number }) {
        const content = codeContent;
        let bytePos = 0;
        let charPos = 0;
        
        // Find the character position that corresponds to the byte offset
        while (bytePos < editInfo.offset && charPos < content.length) {
          bytePos += getUtf8Length(content, charPos, 1);
          charPos++;
        }
        editInfo.offset = charPos;
        
        // Calculate the length in characters
        let byteEnd = bytePos + editInfo.length;
        let charEnd = charPos;
        while (bytePos < byteEnd && charEnd < content.length) {
          bytePos += getUtf8Length(content, charEnd, 1);
          charEnd++;
        }
        editInfo.length = charEnd - charPos;
        
        return editInfo;
      };

      parser.onerror = (err) => {
        reject(new Error(`XML parsing error: ${err.message}`));
      };

      parser.onopentag = (tag) => {
        if (currentEdit) {
          reject(new Error('Malformed XML: nested replacement tags'));
          return;
        }

        switch (tag.name.toLowerCase()) {
          case 'replacements':
            return;

          case 'replacement':
            if (!tag.attributes['length'] || !tag.attributes['offset']) {
              reject(new Error('Malformed XML: missing required attributes'));
              return;
            }
            currentEdit = {
              length: parseInt(tag.attributes['length'].toString()),
              offset: parseInt(tag.attributes['offset'].toString()),
              text: ''
            };
            byteToOffset(currentEdit);
            break;

          default:
            reject(new Error(`Unexpected XML tag: ${tag.name}`));
        }
      };

      parser.ontext = (text) => {
        if (!currentEdit) { return; }
        currentEdit.text = text;
      };

      parser.onclosetag = (tagName) => {
        if (!currentEdit) { return; }

        try {
          let start = document.positionAt(currentEdit.offset);
          let end = document.positionAt(currentEdit.offset + currentEdit.length);
          let editRange = new vscode.Range(start, end);
          edits.push(new vscode.TextEdit(editRange, currentEdit.text));
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'unknown error';
          reject(new Error(`Failed to create edit: ${errorMessage}`));
          return;
        }
        
        currentEdit = undefined;
      };

      parser.onend = () => {
        if (currentEdit) {
          reject(new Error('Malformed XML: unclosed replacement tag'));
          return;
        }
        resolve(edits);
      };

      // Process content in chunks to avoid memory issues
      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      
      // Split XML into chunks and process
      for (let i = 0; i < xml.length; i += CHUNK_SIZE) {
        const chunk = xml.slice(i, i + CHUNK_SIZE);
        try {
          parser.write(chunk);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'unknown error';
          reject(new Error(`Failed to parse XML chunk: ${errorMessage}`));
        }
      }

      try {
        parser.end();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        reject(new Error(`Failed to finalize XML parsing: ${errorMessage}`));
      }
    });
  }

  /// Get execute name in clang-format.executable, if not found, use default value
  /// If configure has changed, it will get the new value
  private getExecutablePath(document?: vscode.TextDocument) {
    let platform = getPlatformString();
    let config = vscode.workspace.getConfiguration('clang-format', document?.uri);

    let platformExecPath = config.get<string>('executable.' + platform);
    let defaultExecPath = config.get<string>('executable');
    let execPath = platformExecPath || defaultExecPath;

    if (!execPath) {
      return this.defaultConfigure.executable;
    }

    // replace placeholders, if present
    return execPath
      .replace(/\${workspaceRoot}/g, this.getWorkspaceFolder(document) ?? '')
      .replace(/\${workspaceFolder}/g, this.getWorkspaceFolder(document) ?? '')
      .replace(/\${cwd}/g, process.cwd())
      .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => {
        // Only allow alphanumeric and underscore characters in env var names
        if (!/^[a-zA-Z0-9_]+$/.test(envName)) {
          outputChannel.appendLine(`Warning: Invalid environment variable name: ${envName}`);
          return '';
        }
        return process.env[envName] ?? '';
      });
  }

  private getLanguage(document: vscode.TextDocument): string {
    return (ALIAS as { [key: string]: string })[document.languageId] || document.languageId;
  }

  private getStyle(document: vscode.TextDocument) {
    // Get language-specific style with document URI
    let config = vscode.workspace.getConfiguration('clang-format', document.uri);
    let ret = config.get<string>(`language.${this.getLanguage(document)}.style`);
    if (ret?.trim()) {
      return ret;
    }

    // Fallback to global style
    ret = config.get<string>('style');
    return ret?.trim() ? ret : this.defaultConfigure.style;
  }

  private getFallbackStyle(document: vscode.TextDocument) {
    // Get language-specific fallback style with document URI
    let config = vscode.workspace.getConfiguration('clang-format', document.uri);
    let strConf = config.get<string>(`language.${this.getLanguage(document)}.fallbackStyle`);
    if (strConf?.trim()) {
      return strConf;
    }

    // Fallback to global fallback style
    strConf = config.get<string>('fallbackStyle');
    return strConf?.trim() ? strConf : this.defaultConfigure.fallbackStyle;
  }

  private getAssumedFilename(document: vscode.TextDocument) {
    let config = vscode.workspace.getConfiguration('clang-format', document.uri);
    let assumedFilename = config.get<string>('assumeFilename') ?? '';
    if (assumedFilename === '') {
      return document.fileName;
    }
    let parsedPath = path.parse(document.fileName);
    let fileNoExtension = path.join(parsedPath.dir, parsedPath.name);
    return assumedFilename
        .replace(/\${file}/g, document.fileName)
        .replace(/\${fileNoExtension}/g, fileNoExtension)
        .replace(/\${fileBasename}/g, parsedPath.base)
        .replace(/\${fileBasenameNoExtension}/g, parsedPath.name)
        .replace(/\${fileExtname}/g, parsedPath.ext);
  }

  private getWorkspaceFolder(document?: vscode.TextDocument): string | undefined {
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

  private getFormatArgs(document: vscode.TextDocument, range: vscode.Range | undefined, options: vscode.FormattingOptions | null): string[] {
    const baseArgs = [
      '-output-replacements-xml',
      `-style=${this.getStyle(document)}`,
      `-fallback-style=${this.getFallbackStyle(document)}`,
      `-assume-filename=${this.getAssumedFilename(document)}`
    ];

    if (!range) {
      return baseArgs;
    }

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    
    if (range.isEqual(fullRange)) {
      return baseArgs;
    }

    const offset = document.offsetAt(range.start);
    const length = document.offsetAt(range.end) - offset;

    // fix character length to byte length
    const byteLength = Buffer.byteLength(document.getText().substring(offset, offset + length), 'utf8');
    // fix character offset to byte offset
    const byteOffset = Buffer.byteLength(document.getText().substring(0, offset), 'utf8');

    return [
      ...baseArgs,
      `-offset=${byteOffset}`,
      `-length=${byteLength}`
    ];
  }

  private doFormatDocument(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions | null, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
    return new Promise<vscode.TextEdit[]>((resolve, reject) => {
      let filename = document.fileName;
      let formatCommandBinPath: string | undefined;
      let child: cp.ChildProcess | undefined;
      let timeoutId: NodeJS.Timeout | undefined;

      // Set a timeout of 10 seconds
      timeoutId = setTimeout(() => {
        if (child) {
          outputChannel.appendLine(`Formatting timed out after 10s for file: ${document.fileName}`);
          child.kill();
          reject(new Error('Format operation timed out after 10 seconds'));
        }
      }, 10000);

      try {
        formatCommandBinPath = getBinPath(this.getExecutablePath(document));
        let codeContent = document.getText();

        let formatArgs = this.getFormatArgs(document, range, options);
        if (!formatArgs) {
          return reject(new Error('Failed to get format arguments'));
        }

        let workingPath = this.getWorkspaceFolder(document);
        if (!document.isUntitled && workingPath) {
          workingPath = path.dirname(document.fileName);
        }

        // Start the formatting process
        child = cp.spawn(formatCommandBinPath, formatArgs, {
          cwd: workingPath,
          windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        child.on('error', (err: Error) => {
          outputChannel.appendLine(`Error spawning clang-format: ${err.message}`);
          reject(err);
        });

        child.on('exit', (code: number | null) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          
          if (code !== 0) {
            outputChannel.appendLine(`clang-format exited with code ${code}`);
            outputChannel.appendLine(`stderr: ${stderr}`);
            return reject(new Error(`clang-format exited with code ${code}: ${stderr}`));
          }

          if (!stdout) {
            // No changes needed
            return resolve([]);
          }

          // Convert to proper Promise to enable catch
          Promise.resolve(this.getEdits(document, stdout, codeContent))
            .then(resolve)
            .catch((error: Error) => {
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
          if (child) {
            outputChannel.appendLine(`Formatting cancelled for file: ${document.fileName}`);
            child.kill();
            reject(new Error('Format cancelled'));
          }
        });

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'unknown error';
        outputChannel.appendLine(`Error during formatting: ${errorMessage}`);
        reject(new Error(`Error during formatting: ${errorMessage}`));
      }
    });
  }

  public formatDocument(document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    const token = new vscode.CancellationTokenSource().token;
    return this.doFormatDocument(document, fullRange, null, token);
  }
}

export function activate(ctx: vscode.ExtensionContext): void {
  // Initialize diagnostic collection
  diagnosticCollection = vscode.languages.createDiagnosticCollection('clang-format');
  ctx.subscriptions.push(diagnosticCollection);
  ctx.subscriptions.push(outputChannel);

  let formatter = new ClangDocumentFormattingEditProvider();
  let availableLanguages: { [key: string]: boolean } = {};

  MODES.forEach((mode) => {
    ctx.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(mode, formatter));
    ctx.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(mode, formatter));
    availableLanguages[mode.language as string] = true;
  });
}

export function deactivate(): void {
  if (diagnosticCollection) {
    diagnosticCollection.dispose();
  }
  if (outputChannel) {
    outputChannel.dispose();
  }
}
