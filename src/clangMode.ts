'use strict';

import * as vscode from 'vscode';

export const ALIAS: Readonly<Record<string, string>> = {
  'proto3': 'proto'
} as const;

type SupportedLanguage = 
  | 'cpp' | 'c' | 'csharp' | 'objective-c' | 'objective-cpp' 
  | 'java' | 'javascript' | 'json' | 'typescript' 
  | 'proto' | 'proto3' | 'textproto' | 'apex' 
  | 'glsl' | 'hlsl' | 'cuda' | 'cuda-cpp' 
  | 'tablegen' | 'metal';

const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'cpp', 'c', 'csharp', 'objective-c', 'objective-cpp',
  'java', 'javascript', 'json', 'typescript',
  'proto', 'proto3', 'textproto', 'apex',
  'glsl', 'hlsl', 'cuda', 'cuda-cpp',
  'tablegen', 'metal'
] as const;

let languages: SupportedLanguage[] = [];
let MODES: readonly vscode.DocumentFilter[] = [];

function updateLanguages(): void {
  languages = [];
  for (const lang of SUPPORTED_LANGUAGES) {
    const confKey = `language.${ALIAS[lang] || lang}.enable`;
    if (vscode.workspace.getConfiguration('clang-format').get<boolean>(confKey)) {
      languages.push(lang);
    }
  }
  MODES = Object.freeze(languages.map((language) => ({ 
    language, 
    scheme: 'file' as const
  })));
}

// Initial update
updateLanguages();

// Listen for configuration changes
vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent): void => {
  if (event.affectsConfiguration('clang-format')) {
    updateLanguages();
  }
});

export { MODES };
