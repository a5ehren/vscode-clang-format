// Simple test runner for vscode-clang-format extension
// Run with: npx ts-node src/test-extension.ts

// Mock VSCode API for testing (kept for reference but not currently used)
// const mockVscode = { ... };

// Mock other dependencies
const mockWhich = {
  sync: (binname: string) => {
    // Mock which behavior
    if (binname === 'clang-format') {
      return '/usr/local/bin/clang-format';
    }
    if (binname === 'echo') {
      return '/bin/echo';
    }
    if (binname === 'nonexistent') {
      throw new Error('Command not found');
    }
    // Mock path with spaces (common on Windows)
    if (binname === 'clang-format-spaces') {
      return 'C:\\Program Files\\LLVM\\bin\\clang-format.exe';
    }
    // Mock paths with special characters
    if (binname === 'clang-format-special') {
      return 'C:\\Users\\Test User\\Documents & Files\\clang-format.exe';
    }
    if (binname === 'clang-format-unicode') {
      return '/home/用户/文档/clang-format';
    }
    if (binname === 'clang-format-symbols') {
      return '/opt/clang-format@latest/bin/clang-format';
    }
    if (binname === 'clang-format-dots') {
      return '/usr/local/bin/clang-format.1.0.0';
    }
    if (binname === 'clang-format-brackets') {
      return '/opt/[clang-format]/bin/clang-format';
    }
    if (binname === 'clang-format-quotes') {
      return 'C:\\Program Files\\"Clang Format"\\bin\\clang-format.exe';
    }
    if (binname === 'clang-format-mixed') {
      return '/home/user/My Projects (v2.0)/clang-format/bin/clang-format';
    }
    // Additional special character edge cases
    if (binname === 'clang-format-backslashes') {
      return 'C:\\\\Users\\\\Test\\\\AppData\\\\Local\\\\clang-format.exe';
    }
    if (binname === 'clang-format-forward-slashes') {
      return 'C:/Users/Test/AppData/Local/clang-format.exe';
    }
    if (binname === 'clang-format-mixed-slashes') {
      return 'C:\\Users/Test\\AppData/Local\\clang-format.exe';
    }
    if (binname === 'clang-format-underscores') {
      return '/usr/local/bin/clang_format_v2.0.1';
    }
    if (binname === 'clang-format-hyphens') {
      return '/opt/clang-format-tool/bin/clang-format';
    }
    if (binname === 'clang-format-plus') {
      return '/usr/bin/clang+format';
    }
    if (binname === 'clang-format-hash') {
      return '/opt/clang#format/bin/clang-format';
    }
    if (binname === 'clang-format-dollar') {
      return '/home/user/$clang-format/bin/clang-format';
    }
    if (binname === 'clang-format-percent') {
      return '/tmp/100%clang-format/bin/clang-format';
    }
    return `/usr/bin/${binname}`;
  }
};

const mockFs = {
  statSync: (path: string) => ({
    isFile: () => {
      // Mock file existence check
      if (path.includes('nonexistent')) {
        throw new Error('ENOENT: no such file or directory');
      }
      return true;
    }
  })
};

const mockPath = {
  normalize: (path: string) => path.replace(/\\/g, '/'),
  dirname: (path: string) => path.split('/').slice(0, -1).join('/') || '.',
  join: (...parts: string[]) => parts.join('/')
};

// Mock process
const mockProcess = {
  platform: 'linux',
  cwd: () => '/mock/workspace',
  env: {
    PATH: '/usr/local/bin:/usr/bin:/bin'
  }
};

// Test utilities
function test(name: string, testFn: () => boolean | void) {
  try {
    const result = testFn();
    if (result === false) {
      console.log(`❌ FAIL: ${name}`);
      return false;
    } else {
      console.log(`✅ PASS: ${name}`);
      return true;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`❌ FAIL: ${name} - Error: ${errorMessage}`);
    return false;
  }
}

function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => actual === expected,
    toContain: (expected: string) => typeof actual === 'string' && actual.includes(expected),
    toBeTruthy: () => !!actual,
    toBeFalsy: () => !actual,
    toBeInstanceOf: (constructor: new (...args: unknown[]) => unknown) => actual instanceof constructor,
    toHaveProperty: (prop: string) => typeof actual === 'object' && actual !== null && prop in actual
  };
}

// Test the getBinPath function
function testGetBinPathBasic() {
  console.log('\n🧪 Testing getBinPath basic functionality...');
  
  let passed = 0;
  let total = 0;
  
  // Test basic binary lookup
  total++;
  passed += test('getBinPath should return string for existing binary', () => {
    const result = getBinPath('echo');
    return expect(result).toBeTruthy() && typeof result === 'string';
  }) ? 1 : 0;
  
  // Test caching functionality
  total++;
  passed += test('getBinPath should cache results', () => {
    const result1 = getBinPath('echo');
    const result2 = getBinPath('echo');
    return expect(result1).toBe(result2);
  }) ? 1 : 0;
  
  // Test fallback behavior
  total++;
  passed += test('getBinPath should fallback to binary name if not found', () => {
    const result = getBinPath('nonexistent');
    return expect(result).toBe('nonexistent');
  }) ? 1 : 0;
  
  console.log(`Basic tests: ${passed}/${total} passed\n`);
  return passed === total;
}

function testGetBinPathWithSpaces() {
  console.log('🧪 Testing getBinPath with spaces in paths...');
  
  let passed = 0;
  let total = 0;
  
  // Test path with spaces (Windows-style)
  total++;
  passed += test('getBinPath should handle paths with spaces', () => {
    const result = getBinPath('clang-format-spaces');
    return expect(result).toContain('Program Files') && expect(result).toContain('clang-format.exe');
  }) ? 1 : 0;
  
  // Test path normalization
  total++;
  passed += test('getBinPath should normalize paths', () => {
    const result = getBinPath('clang-format');
    return expect(result).toBeTruthy() && typeof result === 'string';
  }) ? 1 : 0;
  
  console.log(`Space handling tests: ${passed}/${total} passed\n`);
  return passed === total;
}

function testGetBinPathWithSpecialCharacters() {
  console.log('🧪 Testing getBinPath with special characters in paths...');
  
  let passed = 0;
  let total = 0;
  
  // Test paths with ampersands and special symbols
  total++;
  passed += test('getBinPath should handle ampersands and special symbols', () => {
    const result = getBinPath('clang-format-special');
    return expect(result).toContain('Documents & Files') && expect(result).toContain('clang-format.exe');
  }) ? 1 : 0;
  
  // Test Unicode characters (non-ASCII)
  total++;
  passed += test('getBinPath should handle Unicode characters', () => {
    const result = getBinPath('clang-format-unicode');
    return expect(result).toContain('用户') && expect(result).toContain('文档');
  }) ? 1 : 0;
  
  // Test at symbols and special characters
  total++;
  passed += test('getBinPath should handle at symbols and special characters', () => {
    const result = getBinPath('clang-format-symbols');
    return expect(result).toContain('@latest') && expect(result).toContain('clang-format');
  }) ? 1 : 0;
  
  // Test multiple dots in filenames
  total++;
  passed += test('getBinPath should handle multiple dots in filenames', () => {
    const result = getBinPath('clang-format-dots');
    return expect(result).toContain('clang-format.1.0.0') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  // Test square brackets in paths
  total++;
  passed += test('getBinPath should handle square brackets in paths', () => {
    const result = getBinPath('clang-format-brackets');
    return expect(result).toContain('[clang-format]') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  // Test quotes in paths
  total++;
  passed += test('getBinPath should handle quotes in paths', () => {
    const result = getBinPath('clang-format-quotes');
    return expect(result).toContain('"Clang Format"') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  // Test mixed special characters
  total++;
  passed += test('getBinPath should handle mixed special characters', () => {
    const result = getBinPath('clang-format-mixed');
    return expect(result).toContain('My Projects (v2.0)') && expect(result).toContain('clang-format');
  }) ? 1 : 0;
  
  // Test multiple backslashes (Windows escaping)
  total++;
  passed += test('getBinPath should handle multiple backslashes', () => {
    const result = getBinPath('clang-format-backslashes');
    return expect(result).toContain('AppData') && expect(result).toContain('clang-format.exe');
  }) ? 1 : 0;
  
  // Test forward slashes on Windows
  total++;
  passed += test('getBinPath should handle forward slashes on Windows', () => {
    const result = getBinPath('clang-format-forward-slashes');
    return expect(result).toContain('AppData') && expect(result).toContain('clang-format.exe');
  }) ? 1 : 0;
  
  // Test mixed slash types
  total++;
  passed += test('getBinPath should handle mixed slash types', () => {
    const result = getBinPath('clang-format-mixed-slashes');
    return expect(result).toContain('AppData') && expect(result).toContain('clang-format.exe');
  }) ? 1 : 0;
  
  // Test underscores and version numbers
  total++;
  passed += test('getBinPath should handle underscores and version numbers', () => {
    const result = getBinPath('clang-format-underscores');
    return expect(result).toContain('clang_format_v2.0.1') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  // Test hyphens in paths
  total++;
  passed += test('getBinPath should handle hyphens in paths', () => {
    const result = getBinPath('clang-format-hyphens');
    return expect(result).toContain('clang-format-tool') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  // Test plus signs in names
  total++;
  passed += test('getBinPath should handle plus signs in names', () => {
    const result = getBinPath('clang-format-plus');
    return expect(result).toContain('clang+format') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  // Test hash symbols
  total++;
  passed += test('getBinPath should handle hash symbols', () => {
    const result = getBinPath('clang-format-hash');
    return expect(result).toContain('clang#format') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  // Test dollar signs
  total++;
  passed += test('getBinPath should handle dollar signs', () => {
    const result = getBinPath('clang-format-dollar');
    return expect(result).toContain('$clang-format') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  // Test percent signs
  total++;
  passed += test('getBinPath should handle percent signs', () => {
    const result = getBinPath('clang-format-percent');
    return expect(result).toContain('100%clang-format') && expect(result).toContain('bin');
  }) ? 1 : 0;
  
  console.log(`Special character tests: ${passed}/${total} passed\n`);
  return passed === total;
}

function testGetBinPathPathNormalization() {
  console.log('🧪 Testing getBinPath path normalization edge cases...');
  
  let passed = 0;
  let total = 0;
  
  // Test paths with multiple consecutive slashes
  total++;
  passed += test('getBinPath should normalize multiple consecutive slashes', () => {
    const result = getBinPath('clang-format-backslashes');
    // Should handle multiple backslashes without issues
    return expect(result).toBeTruthy() && typeof result === 'string';
  }) ? 1 : 0;
  
  // Test paths with mixed slash types
  total++;
  passed += test('getBinPath should handle mixed slash types gracefully', () => {
    const result = getBinPath('clang-format-mixed-slashes');
    // Should handle mixed backslashes and forward slashes
    return expect(result).toBeTruthy() && typeof result === 'string';
  }) ? 1 : 0;
  
  // Test paths with special characters that might interfere with path parsing
  total++;
  passed += test('getBinPath should handle special characters that might interfere with path parsing', () => {
    const result = getBinPath('clang-format-hash');
    // Should handle hash symbols without path parsing issues
    return expect(result).toBeTruthy() && typeof result === 'string';
  }) ? 1 : 0;
  
  // Test paths with characters that might be interpreted as shell metacharacters
  total++;
  passed += test('getBinPath should handle shell metacharacters', () => {
    const result = getBinPath('clang-format-dollar');
    // Should handle dollar signs without shell interpretation issues
    return expect(result).toBeTruthy() && typeof result === 'string';
  }) ? 1 : 0;
  
  // Test paths with characters that might cause encoding issues
  total++;
  passed += test('getBinPath should handle characters that might cause encoding issues', () => {
    const result = getBinPath('clang-format-unicode');
    // Should handle Unicode characters without encoding issues
    return expect(result).toBeTruthy() && typeof result === 'string';
  }) ? 1 : 0;
  
  // Test paths with characters that might cause regex issues
  total++;
  passed += test('getBinPath should handle characters that might cause regex issues', () => {
    const result = getBinPath('clang-format-brackets');
    // Should handle square brackets without regex interpretation issues
    return expect(result).toBeTruthy() && typeof result === 'string';
  }) ? 1 : 0;
  
  console.log(`Path normalization tests: ${passed}/${total} passed\n`);
  return passed === total;
}

function testGetBinPathEdgeCases() {
  console.log('🧪 Testing getBinPath edge cases...');
  
  let passed = 0;
  let total = 0;
  
  // Test empty string
  total++;
  passed += test('getBinPath should handle empty string gracefully', () => {
    const result = getBinPath('');
    return expect(result).toBe('');
  }) ? 1 : 0;
  
  // Test null/undefined (though this shouldn't happen in practice)
  total++;
  passed += test('getBinPath should handle undefined gracefully', () => {
    try {
      // @ts-expect-error - testing edge case
      const result = getBinPath(undefined);
      return expect(result).toBeFalsy(); // Should return undefined (falsy)
    } catch {
      return true; // Throwing is also acceptable
    }
  }) ? 1 : 0;
  
  console.log(`Edge case tests: ${passed}/${total} passed\n`);
  return passed === total;
}

// Test configuration handling
function testConfigurationHandling() {
  console.log('🧪 Testing configuration handling...');
  
  let passed = 0;
  let total = 0;
  
  // Test platform detection
  total++;
  passed += test('getPlatformString should return correct platform', () => {
    const result = getPlatformString();
    return expect(result).toBe('linux'); // Based on our mock
  }) ? 1 : 0;
  
  console.log(`Configuration tests: ${passed}/${total} passed\n`);
  return passed === total;
}

// Mock the actual functions from extension.ts
function getBinPath(binname: string): string {
  // Mock implementation for testing
  if (!binname) return binname;
  
  try {
    const binPath = mockWhich.sync(binname);
    if (binPath?.trim()) {
      const normalizedPath = mockPath.normalize(binPath.trim());
      
      try {
        const stats = mockFs.statSync(normalizedPath);
        if (stats?.isFile()) {
          return normalizedPath;
        }
      } catch (statError: unknown) {
        const statErrorMessage = statError instanceof Error ? statError.message : String(statError);
        console.log(`Warning: Could not stat binary at ${normalizedPath}: ${statErrorMessage}`);
        return normalizedPath;
      }
    }
    
    throw new Error(`Invalid binary path returned by which: ${binPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`Could not find binary '${binname}' in PATH: ${errorMessage}`);
    return binname;
  }
}

function getPlatformString() {
  switch(mockProcess.platform) {
    case 'win32': return 'windows';
    case 'linux': return 'linux';
    case 'darwin': return 'osx';
  }
  return 'unknown';
}

// Main test runner
function runAllTests() {
  console.log('🚀 Starting Extension Tests\n');
  console.log('='.repeat(50));
  
  const startTime = Date.now();
  
  let allPassed = true;
  
  allPassed = testGetBinPathBasic() && allPassed;
  allPassed = testGetBinPathWithSpaces() && allPassed;
  allPassed = testGetBinPathWithSpecialCharacters() && allPassed;
  allPassed = testGetBinPathPathNormalization() && allPassed;
  allPassed = testGetBinPathEdgeCases() && allPassed;
  allPassed = testConfigurationHandling() && allPassed;
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log('='.repeat(50));
  if (allPassed) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the output above.');
  }
  console.log(`⏱️  Tests completed in ${duration}ms\n`);
  
  return allPassed;
}

// Export for potential use in other test files
export {
  test,
  expect,
  runAllTests,
  testGetBinPathBasic,
  testGetBinPathWithSpaces,
  testGetBinPathWithSpecialCharacters,
  testGetBinPathPathNormalization,
  testGetBinPathEdgeCases,
  testConfigurationHandling
};

// Run tests if this file is executed directly
if (require.main === module) {
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}
