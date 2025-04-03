'use strict';

import { statSync } from 'fs';
import { delimiter, join } from 'path';

export interface CacheEntry {
  readonly path: string;
  readonly timestamp: number;
}

type BinPathCache = Record<string, CacheEntry>;

const CACHE_TTL: number = 5 * 60 * 1000; // 5 minutes in milliseconds
let binPathCache: BinPathCache = {};

function isValidCacheEntry(entry: CacheEntry | undefined): boolean {
  if (!entry?.path) {
    return false;
  }
  
  // Check if cache entry has expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    return false;
  }
  
  // Verify the file still exists and is accessible
  try {
    return statSync(entry.path).isFile();
  } catch (error) {
    console.debug(`File access error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      if (statSync(binNameToSearch).isFile()) {
        binPathCache[binname] = {
          path: binNameToSearch,
          timestamp: Date.now()
        };
        return binNameToSearch;
      }
    } catch (error) {
      console.debug(`File check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const envPath = process.env['PATH'] ?? '';
    if (envPath.trim().length > 0) {
      const pathparts = envPath.split(delimiter).filter(Boolean);
      
      for (const pathPart of pathparts) {
        const binpath = join(pathPart, binNameToSearch);
        try {
          if (statSync(binpath).isFile()) {
            binPathCache[binname] = {
              path: binpath,
              timestamp: Date.now()
            };
            return binpath;
          }
        } catch (error) {
          console.debug(`Path search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

function correctBinname(binname: string): readonly string[] {
  if (process.platform === 'win32') {
    return [binname + '.exe', binname + '.bat', binname + '.cmd', binname] as const;
  }
  return [binname] as const;
}