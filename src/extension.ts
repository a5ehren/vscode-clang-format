import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { MODES } from './clangMode';
import { ALIAS } from './shared/languageConfig';
import * as sax from 'sax';
import { sync as whichSync } from 'which';
import { statSync } from 'fs';

interface ClangFormatConfig {
  executable: string;
  style: string;
  fallbackStyle: string;
  assumeFilename: string;
}

interface EditInfo {
  length: number;
  offset: number;
  text: string;
}

// Cache binary paths for performance
const binPathCache: Record<string, string | undefined> = {};
export const outputChannel = vscode.window.createOutputChannel('Clang-Format');
let diagnosticCollection: vscode.DiagnosticCollection;

function getPlatformString() {
  switch(process.platform) {
    case 'win32': return 'windows';
    case 'linux': return 'linux';
    case 'darwin': return 'osx';
  }

  return 'unknown';
}

/**
 * Get the path to a binary by searching PATH and caching the result
 * @param binname The name of the binary to find
 * @returns The full path to the binary
 */
function getBinPath(binname: string): string {
  // Return cached path if it exists
  if (binPathCache[binname]) {
    try {
      // Verify the cached binary still exists
      if (statSync(binPathCache[binname]).isFile()) {
        return binPathCache[binname];
      }
    } catch (_) {
      // Cache is invalid, remove it
      binPathCache[binname] = undefined;
    }
  }

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
          binPathCache[binname] = normalizedPath;
          return normalizedPath;
        }
      } catch (statError: unknown) {
        // Path exists but stat failed, log warning but continue
        const statErrorMessage = statError instanceof Error ? statError.message : String(statError);
        outputChannel.appendLine(`Warning: Could not stat binary at ${normalizedPath}: ${statErrorMessage}`);
        binPathCache[binname] = normalizedPath;
        return normalizedPath;
      }
    }
    
    // If we get here, something went wrong with the path
    throw new Error(`Invalid binary path returned by which: ${binPath}`);
  } catch (error) {
    // If which fails, return the binary name as-is
    // This maintains compatibility with the old behavior
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Could not find binary '${binname}' in PATH: ${errorMessage}`);
    binPathCache[binname] = binname;
    return binname;
  }
}

export class ClangDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
  private readonly defaultConfigure: ClangFormatConfig = {
    executable: 'clang-format',
    style: 'file',
    fallbackStyle: 'none',
    assumeFilename: ''
  };

  public provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    return this.doFormatDocument(document, fullRange, options, token);
  }

  public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
    return this.doFormatDocument(document, range, options, token);
  }

  private getEdits(document: vscode.TextDocument, xml: string, codeContent: string): Promise<vscode.TextEdit[]> {
    return new Promise<vscode.TextEdit[]>((resolve, reject) => {
      // Use strict XML parsing
      const options = {
        trim: false,
        normalize: false,
        strict: true,
        lowercase: true
      };
      
      const parser = sax.parser(true, options);
      const edits: vscode.TextEdit[] = [];
      let currentEdit: EditInfo | undefined;

      // Create a reusable buffer for UTF-8 calculations
      const textEncoder = new TextEncoder();
      const getUtf8Length = (str: string, start: number, len: number): number => {
        return textEncoder.encode(str.substring(start, start + len)).length;
      };

      const byteToOffset = (editInfo: EditInfo): EditInfo => {
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
        const byteEnd = bytePos + editInfo.length;
        let charEnd = charPos;
        while (bytePos < byteEnd && charEnd < content.length) {
          bytePos += getUtf8Length(content, charEnd, 1);
          charEnd++;
        }
        editInfo.length = charEnd - charPos;
        
        return editInfo;
      };

      const handleError = (error: Error): void => {
        outputChannel.appendLine(`XML parsing error: ${error.message}`);
        reject(error);
      };

      parser.onerror = handleError;

      parser.onopentag = (tag) => {
        if (currentEdit) {
          handleError(new Error('Malformed XML: nested replacement tags'));
          return;
        }

        switch (tag.name.toLowerCase()) {
          case 'replacements':
            return;

          case 'replacement': {
            const length = tag.attributes.length;
            const offset = tag.attributes.offset;
            
            if (typeof length !== 'string' || typeof offset !== 'string') {
              handleError(new Error('Malformed XML: missing required attributes'));
              return;
            }

            currentEdit = {
              length: parseInt(length),
              offset: parseInt(offset),
              text: ''
            };
            byteToOffset(currentEdit);
            break;
          }

          default:
            handleError(new Error(`Unexpected XML tag: ${tag.name}`));
        }
      };

      parser.ontext = (text) => {
        if (!currentEdit) { return; }
        currentEdit.text = text;
      };

      parser.onclosetag = (_) => {
        if (!currentEdit) { return; }

        try {
          const start = document.positionAt(currentEdit.offset);
          const end = document.positionAt(currentEdit.offset + currentEdit.length);
          const editRange = new vscode.Range(start, end);
          edits.push(new vscode.TextEdit(editRange, currentEdit.text));
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'unknown error';
          handleError(new Error(`Failed to create edit: ${errorMessage}`));
          return;
        }
        
        currentEdit = undefined;
      };

      parser.onend = () => {
        if (currentEdit) {
          handleError(new Error('Malformed XML: unclosed replacement tag'));
          return;
        }
        resolve(edits);
      };

      // Process content in chunks to avoid memory issues
      const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
      
      try {
        // Split XML into chunks and process
        for (let i = 0; i < xml.length; i += CHUNK_SIZE) {
          const chunk = xml.slice(i, i + CHUNK_SIZE);
          parser.write(chunk);
        }
        parser.end();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        handleError(new Error(`XML processing error: ${errorMessage}`));
      }
    });
  }

  /// Get execute name in clang-format.executable, if not found, use default value
  /// If configure has changed, it will get the new value
  private getExecutablePath(document?: vscode.TextDocument) {
    const platform = getPlatformString();
    const config = vscode.workspace.getConfiguration('clang-format', document?.uri);

    const platformExecPath = config.get<string>('executable.' + platform);
    const defaultExecPath = config.get<string>('executable');
    const execPath = platformExecPath ?? defaultExecPath;

    if (!execPath) {
      return this.defaultConfigure.executable;
    }

    // replace placeholders, if present
    return execPath
      .replace(/\${workspaceRoot}/g, this.getWorkspaceFolder(document) ?? '')
      .replace(/\${workspaceFolder}/g, this.getWorkspaceFolder(document) ?? '')
      .replace(/\${cwd}/g, process.cwd())
      .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => {
        if (!/^[a-z_]\w*$/i.test(envName)) {
          outputChannel.appendLine(`Warning: Invalid environment variable name: ${envName}`);
          return '';
        }
        return process.env[envName] ?? '';
      });
  }

  private getLanguage(document: vscode.TextDocument): string {
    const langId = document.languageId;
    const mappedLang = (ALIAS as Record<string, string>)[langId] || langId;
    outputChannel.appendLine(`Document language ID: ${langId}, mapped to: ${mappedLang}`);
    return mappedLang;
  }

  private getStyle(document: vscode.TextDocument) {
    const language = this.getLanguage(document);
    const config = vscode.workspace.getConfiguration('clang-format', document.uri);
    
    // Get language-specific style with document URI
    const languageStyleKey = `language.${language}.style`;
    
    let ret = config.get<string>(languageStyleKey) ?? '';
    
    ret = ret.replace(/\${workspaceRoot}/g, this.getWorkspaceFolder(document) ?? '')
      .replace(/\${workspaceFolder}/g, this.getWorkspaceFolder(document) ?? '')
      .replace(/\${cwd}/g, process.cwd())
      .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => {
        if (!/^[a-z_]\w*$/i.test(envName)) {
          outputChannel.appendLine(`Warning: Invalid environment variable name: ${envName}`);
          return '';
        }
        return process.env[envName] ?? '';
      });
    
    if (ret.trim()) {
      return ret;
    }

    // Fallback to global style
    ret = config.get<string>('style') ?? '';
    ret = ret.replace(/\${workspaceRoot}/g, this.getWorkspaceFolder(document) ?? '')
      .replace(/\${workspaceFolder}/g, this.getWorkspaceFolder(document) ?? '')
      .replace(/\${cwd}/g, process.cwd())
      .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => {
        if (!/^[a-z_]\w*$/i.test(envName)) {
          outputChannel.appendLine(`Warning: Invalid environment variable name: ${envName}`);
          return '';
        }
        return process.env[envName] ?? '';
      });
    
    const finalStyle = ret.trim() ? ret : this.defaultConfigure.style;
    return finalStyle;
  }

  private getFallbackStyle(document: vscode.TextDocument) {
    // Get language-specific fallback style with document URI
    const config = vscode.workspace.getConfiguration('clang-format', document.uri);
    let strConf = config.get<string>(`language.${this.getLanguage(document)}.fallbackStyle`);
    if (strConf?.trim()) {
      return strConf;
    }

    // Try global fallback style
    strConf = config.get<string>('fallbackStyle');
    if (strConf?.trim()) {
      return strConf;
    }

    // If no fallback style is configured, use default
    return this.defaultConfigure.fallbackStyle;
  }

  private getAssumedFilename(document: vscode.TextDocument) {
    const config = vscode.workspace.getConfiguration('clang-format', document.uri);
    const assumedFilename = config.get<string>('assumeFilename') ?? '';
    if (assumedFilename === '') {
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

  private getFormatArgs(document: vscode.TextDocument, range: vscode.Range | undefined): string[] {
    // Validate and sanitize style parameters
    let style = this.getStyle(document);
    let fallbackStyle = this.getFallbackStyle(document);
    const assumedFilename = this.getAssumedFilename(document);

    // Validate style parameter - only allow known values or file paths
    const validStyles = ['llvm', 'google', 'chromium', 'mozilla', 'webkit', 'microsoft', 'gnu', 'file'];
    const normalizedStyle = style.toLowerCase();
    if (!validStyles.includes(normalizedStyle) && !normalizedStyle.startsWith('{') && !normalizedStyle.endsWith('}')) {
      outputChannel.appendLine(`Warning: Invalid style value "${style}", falling back to "file"`);
      style = 'file';
    }

    // Validate fallback style - only allow known values
    const validFallbackStyles = ['none', ...validStyles];
    if (!validFallbackStyles.includes(fallbackStyle.toLowerCase())) {
      outputChannel.appendLine(`Warning: Invalid fallback style "${fallbackStyle}", falling back to "none"`);
      fallbackStyle = 'none';
    }

    const baseArgs = [
      '-output-replacements-xml',
      `-style=${style}`,
      `-fallback-style=${fallbackStyle}`,
      `-assume-filename=${assumedFilename}`
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
      `-offset=${String(byteOffset)}`,
      `-length=${String(byteLength)}`
    ];
  }

  private doFormatDocument(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions | null, token: vscode.CancellationToken): Promise<vscode.TextEdit[]> {
    return new Promise<vscode.TextEdit[]>((resolve, reject) => {
      let formatCommandBinPath: string | undefined;
      let child: cp.ChildProcess | undefined;
      const timeoutId = setTimeout(() => {
        cleanup();
        const timeoutError = new Error('Format operation timed out after 10 seconds');
        outputChannel.appendLine(`Formatting timed out after 10s for file: ${document.fileName}`);
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
        formatCommandBinPath = getBinPath(this.getExecutablePath(document));
        const codeContent = document.getText();

        const formatArgs = this.getFormatArgs(document, range);
        if (!formatArgs) {
          cleanup();
          throw new Error('Failed to get format arguments');
        }

        let workingPath = this.getWorkspaceFolder(document);
        if (!document.isUntitled && workingPath) {
          workingPath = path.dirname(document.fileName);
        }

        // On Windows, we need shell:true due to Node.js security changes
        // On other platforms, we keep shell:false for better security
        const useShell = process.platform === 'win32';
        
        // Start the formatting process
        child = cp.spawn(formatCommandBinPath, formatArgs, {
          cwd: workingPath,
          windowsHide: true,
          shell: useShell,
          stdio: ['pipe', 'pipe', 'pipe']
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
          cleanup();
          outputChannel.appendLine(`Error spawning clang-format: ${err.message}`);
          reject(err);
        });

        child.on('exit', (code: number | null) => {
          cleanup();
          
          if (code !== 0) {
            outputChannel.appendLine(`clang-format exited with code ${String(code)}`);
            outputChannel.appendLine(`stderr: ${stderr}`);
            reject(new Error(`clang-format exited with code ${String(code)}: ${stderr}`));
            return;
          }

          if (!stdout) {
            // No changes needed
            resolve([]);
            return;
          }

          this.getEdits(document, stdout, codeContent)
            .then(resolve)
            .catch((error: Error) => {
              outputChannel.appendLine(`Error getting edits: ${error.message}`);
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
          outputChannel.appendLine(`Formatting cancelled for file: ${document.fileName}`);
          reject(new Error('Format cancelled'));
        });

      } catch (err: unknown) {
        cleanup();
        const errorMessage = err instanceof Error ? err.message : 'unknown error';
        outputChannel.appendLine(`Error during formatting: ${errorMessage}`);
        reject(new Error(`Error during formatting: ${errorMessage}`, { cause: err }));
      }
    });
  }

  public formatDocument(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
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

  const formatter = new ClangDocumentFormattingEditProvider();
  const availableLanguages = new Set<string>();

  for (const mode of MODES) {
    if (typeof mode.language === 'string') {
      ctx.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider(mode, formatter),
        vscode.languages.registerDocumentFormattingEditProvider(mode, formatter)
      );
      availableLanguages.add(mode.language);
    }
  }
}

export function deactivate(): void {
  if (diagnosticCollection) {
    diagnosticCollection.dispose();
  }
  if (outputChannel) {
    outputChannel.dispose();
  }
}
