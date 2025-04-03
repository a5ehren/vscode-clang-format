'use strict';

import * as vscode from 'vscode';
import {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  ALIAS
} from './shared/languageConfig';

export type StyleOverride = {
  fallbackStyle?: string;
  description?: string;
};

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
