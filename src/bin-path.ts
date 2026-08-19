import { sync as whichSync } from "which";
import { statSync } from "fs";
import * as path from "path";
import * as logger from "./logger";

/**
 * Get the path to a binary by searching PATH and caching the result
 * @param binname The name of the binary to find
 * @returns The full path to the binary
 */
export function getBinPath(binname: string): string {
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
          return normalizedPath;
        }
      } catch (statError: unknown) {
        // Path exists but stat failed, log warning but continue
        const statErrorMessage = statError instanceof Error ? statError.message : String(statError);

        logger.log(`Warning: Could not stat binary at ${normalizedPath}: ${statErrorMessage}`);
        return normalizedPath;
      }
    }

    // If we get here, something went wrong with the path
    throw new Error(`Invalid binary path returned by which: ${binPath}`);
  } catch (error) {
    // If which fails, return the binary name as-is
    // This maintains compatibility with the old behavior
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.log(`Could not find binary '${binname}' in PATH: ${errorMessage}`);
    return binname;
  }
}
