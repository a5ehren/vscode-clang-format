'use strict';

import * as vscode from 'vscode';

export const ALIAS: { [key: string]: string } = {
  'proto3': 'proto'
};

let languages: string[] = [];
let MODES: vscode.DocumentFilter[] = [];

function updateLanguages() {
  languages = [];
  for (let l of ['cpp', 'c', 'csharp', 'objective-c', 'objective-cpp', 'java', 'javascript', 'json', 'typescript', 'proto', 'proto3', 'textproto', 'apex', 'glsl', 'hlsl', 'cuda', 'cuda-cpp', 'tablegen', 'metal']) {
    let confKey = `language.${ALIAS[l] || l}.enable`;
    if (vscode.workspace.getConfiguration('clang-format').get(confKey)) {
      languages.push(l);
    }
  }
  MODES = languages.map((language) => ({ language, scheme: 'file' }));
}

// Initial update
updateLanguages();

// Listen for configuration changes
vscode.workspace.onDidChangeConfiguration((event) => {
  if (event.affectsConfiguration('clang-format')) {
    updateLanguages();
  }
});

export { MODES };
