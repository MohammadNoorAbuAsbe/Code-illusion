import * as fs from 'fs';
import * as path from 'path';
import { uninstallAllPlatforms, uninstallPlatform } from './installRules';

// @illusion: uninstall_all -> removes all platform-installed rule files from project -> returns count
export function uninstallAll(projectRoot: string): number {
  const removed = uninstallAllPlatforms(projectRoot);
  return removed.length;
}

// @illusion: uninstall_single -> removes rules for one platform -> returns removed file count
export function uninstallSingle(platformName: string, projectRoot: string): number {
  const removed = uninstallPlatform(platformName, projectRoot);
  return removed.length;
}

// @illusion: purge_out_dir -> deletes the code-illusion-out artifact directory -> returns whether it was deleted
export function purgeOutDir(projectRoot: string): boolean {
  const outDir = path.resolve(projectRoot, 'code-illusion-out');
  // @illusion: remove_dir -> checks existence -> deletes recursively -> catches errors
  try {
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true });
      return true;
    }
  } catch {
    // skip
  }
  return false;
}
