'use strict';

import fs = require('fs');
import path = require('path');

interface CacheEntry {
  path: string;
  timestamp: number;
}

let binPathCache: { [bin: string]: CacheEntry } = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

function isValidCacheEntry(entry: CacheEntry): boolean {
  if (!entry || !entry.path) {
    return false;
  }
  
  // Check if cache entry has expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    return false;
  }
  
  // Verify the file still exists and is accessible
  try {
    return fs.statSync(entry.path).isFile();
  } catch {
    return false;
  }
}

export function getBinPath(binname: string): string {
  const cacheEntry = binPathCache[binname];
  if (cacheEntry && isValidCacheEntry(cacheEntry)) {
    return cacheEntry.path;
  }

  // Clear invalid cache entry if it exists
  if (binPathCache[binname]) {
    delete binPathCache[binname];
  }

  for (const binNameToSearch of correctBinname(binname)) {
    // clang-format.executable has a valid absolute path
    try {
      if (fs.statSync(binNameToSearch).isFile()) {
        binPathCache[binname] = {
          path: binNameToSearch,
          timestamp: Date.now()
        };
        return binNameToSearch;
      }
    } catch {
      // File doesn't exist or isn't accessible
    }

    const envPath = process.env['PATH'];
    if (typeof envPath === 'string' && envPath.trim().length > 0) {
      const pathparts = envPath.split(path.delimiter).filter((part) => {
        return part.length > 0;
      });
      
      for (let i = 0; i < pathparts.length; i++) {
        const binpath = path.join(pathparts[i], binNameToSearch);
        try {
          if (fs.statSync(binpath).isFile()) {
            binPathCache[binname] = {
              path: binpath,
              timestamp: Date.now()
            };
            return binpath;
          }
        } catch {
          // File doesn't exist or isn't accessible
          continue;
        }
      }
    }
  }

  // Else return the binary name directly (this will likely always fail downstream)
  binPathCache[binname] = {
    path: binname,
    timestamp: Date.now()
  };
  return binname;
}

function correctBinname(binname: string): string[] {
  if (process.platform === 'win32') {
    return [binname + '.exe', binname + '.bat', binname + '.cmd', binname];
  } else {
    return [binname];
  }
}