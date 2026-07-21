import * as fs from 'fs';
import * as path from 'path';

// @illusion: PlatformTarget -> defines what files to write where for each AI assistant platform
export interface PlatformTarget {
  name: string;
  label: string;
  files: { template: string; dest: string }[];
  hookFile?: string;
  hookContent?: string;
}

// @illusion: PLATFORMS -> all supported AI assistant platform definitions
const RULES_DIR = path.resolve(__dirname, '..', 'agent-rules');
// When bundled in dist, agent-rules are copied alongside:
const DIST_RULES_DIR = path.resolve(__dirname, '..', '..', 'dist', 'agent-rules');

// @illusion: resolve_template_dir -> probes known dirs -> returns first existing agent-rules path
function resolveTemplateDir(): string {
  // @illusion: probe_primary_dirs -> checks bundled/dev paths -> returns first match
  const dirs = [RULES_DIR, DIST_RULES_DIR];
  // @illusion: find_rules_dir -> iterates candidate dirs -> returns first existing path
  for (const d of dirs) {
    if (fs.existsSync(d)) return d;
  }
  // @illusion: probe_cwd_dirs -> falls back to relative from cwd
  for (const d of [path.resolve(process.cwd(), 'src', 'agent-rules'), path.resolve(process.cwd(), 'dist', 'agent-rules')]) {
    if (fs.existsSync(d)) return d;
  }
  throw new Error('agent-rules templates not found. Run `npm run build` first.');
}

// @illusion: all_platforms -> returns list of all defined platform targets
export function allPlatforms(): PlatformTarget[] {
  return [
    {
      name: 'default',
      label: 'Default (AGENTS.md + CLAUDE.md)',
      files: [
        { template: 'AGENTS.md', dest: 'AGENTS.md' },
        { template: 'CLAUDE.md', dest: 'CLAUDE.md' },
      ],
    },
    {
      name: 'claude',
      label: 'Claude Code',
      files: [
        { template: 'CLAUDE.md', dest: 'CLAUDE.md' },
      ],
      hookFile: '.claude/settings.json',
      hookContent: JSON.stringify({
        preToolUse: [
          {
            match: '**/*',
            command: 'echo "---"; echo "TIP: Run `code-illusion check .` or `code-illusion story .` for @illusion annotation insights."',
          },
        ],
      }, null, 2),
    },
    {
      name: 'cursor',
      label: 'Cursor',
      files: [
        { template: 'code-illusion.mdc', dest: path.join('.cursor', 'rules', 'code-illusion.mdc') },
      ],
    },
    {
      name: 'opencode',
      label: 'OpenCode',
      files: [
        { template: 'AGENTS.md', dest: 'AGENTS.md' },
      ],
    },
    {
      name: 'codex',
      label: 'Codex CLI',
      files: [
        { template: 'AGENTS.md', dest: 'AGENTS.md' },
      ],
    },
    {
      name: 'gemini',
      label: 'Gemini CLI',
      files: [
        { template: 'CLAUDE.md', dest: 'GEMINI.md' },
      ],
    },
    {
      name: 'copilot',
      label: 'GitHub Copilot',
      files: [
        { template: 'copilot-instructions.md', dest: path.join('.github', 'copilot-instructions.md') },
      ],
    },
    {
      name: 'aider',
      label: 'Aider',
      files: [
        { template: 'AGENTS.md', dest: 'AGENTS.md' },
      ],
    },
  ];
}

// @illusion: get_platform -> looks up platform by name -> returns target or undefined
export function getPlatform(name: string): PlatformTarget | undefined {
  return allPlatforms().find((p) => p.name === name);
}

// @illusion: resolve_dest_path -> resolves destination path relative to project root
function resolveDestPath(dest: string, projectRoot: string): string {
  return path.resolve(projectRoot, dest);
}

// @illusion: write_rule_file -> copies template to destination -> creates parent dirs
function writeRuleFile(templateDir: string, template: string, dest: string, projectRoot: string): string {
  const src = path.resolve(templateDir, template);
  if (!fs.existsSync(src)) throw new Error(`Template not found: ${src}`);
  const destPath = resolveDestPath(dest, projectRoot);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(src, destPath);
  return dest;
}

// @illusion: write_hook_file -> writes platform hook/config file
function writeHookFile(platform: PlatformTarget, projectRoot: string): string | null {
  if (!platform.hookFile || !platform.hookContent) return null;
  const destPath = resolveDestPath(platform.hookFile, projectRoot);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, platform.hookContent, 'utf8');
  return destPath;
}

// @illusion: InstallResult -> tracks what was written per platform
export interface InstallResult {
  platform: string;
  filesWritten: string[];
  hooksWritten: string[];
  errors: string[];
}

// @illusion: install_platform -> installs rules for one platform into project root -> returns result
export function installPlatform(platformName: string, projectRoot: string, force = false): InstallResult {
  const result: InstallResult = { platform: platformName, filesWritten: [], hooksWritten: [], errors: [] };
  const platform = getPlatform(platformName);
  if (!platform) {
    result.errors.push(`Unknown platform: ${platformName}. Available: ${allPlatforms().map((p) => p.name).join(', ')}`);
    return result;
  }

  let templateDir: string;
  // @illusion: resolve_template -> wraps resolve call -> catches errors
  try {
    templateDir = resolveTemplateDir();
  } catch (e: unknown) {
    result.errors.push(String(e));
    return result;
  }

  // @illusion: copy_platform_files -> iterates each file -> writes or skips existing
  for (const f of platform.files) {
    // @illusion: copy_single_file -> checks exists -> copies or records error
    try {
      const destPath = resolveDestPath(f.dest, projectRoot);
      if (fs.existsSync(destPath) && !force) {
        result.errors.push(`Already exists: ${f.dest} (use --force to overwrite)`);
        continue;
      }
      const written = writeRuleFile(templateDir, f.template, f.dest, projectRoot);
      result.filesWritten.push(written);
    } catch (e: unknown) {
      result.errors.push(`${f.dest}: ${String(e)}`);
    }
  }

  // @illusion: write_hook -> writes platform hook config -> catches errors
  try {
    const hookPath = writeHookFile(platform, projectRoot);
    if (hookPath) result.hooksWritten.push(hookPath);
  } catch (e: unknown) {
    result.errors.push(`hook: ${String(e)}`);
  }

  return result;
}

// @illusion: install_all_platforms -> installs rules for every platform -> returns results
export function installAllPlatforms(projectRoot: string, force = false): InstallResult[] {
  return allPlatforms().map((p) => installPlatform(p.name, projectRoot, force));
}

// @illusion: uninstall_platform -> removes all files written by install for a given platform
export function uninstallPlatform(platformName: string, projectRoot: string): string[] {
  const platform = getPlatform(platformName);
  if (!platform) return [];

  const removed: string[] = [];
  // @illusion: remove_platform_files -> iterates each file -> deletes if exists -> catches errors
  for (const f of platform.files) {
    const destPath = resolveDestPath(f.dest, projectRoot);
    // @illusion: remove_single_file -> removes file -> skips on error
    try {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
        removed.push(destPath);
      }
    } catch {
      // skip unremovable files
    }
  }

  // @illusion: remove_hook_file -> deletes hook config if present -> catches errors
  if (platform.hookFile) {
    const hookPath = resolveDestPath(platform.hookFile, projectRoot);
    try {
      if (fs.existsSync(hookPath)) {
        fs.unlinkSync(hookPath);
        removed.push(hookPath);
      }
    } catch {
      // skip
    }
  }

  return removed;
}

// @illusion: uninstall_all_platforms -> removes all platform-installed rule files
export function uninstallAllPlatforms(projectRoot: string): string[] {
  const all: string[] = [];
  // @illusion: iterate_platforms -> walks each platform -> collects removed paths
  for (const p of allPlatforms()) {
    all.push(...uninstallPlatform(p.name, projectRoot));
  }
  return all;
}

// @illusion: list_installed -> checks which platform files exist in project -> returns map
export function listInstalled(projectRoot: string): Map<string, boolean> {
  const installed = new Map<string, boolean>();
  // @illusion: check_each_platform -> iterates platforms -> checks all files exist
  for (const p of allPlatforms()) {
    // @illusion: check_platform_files -> verifies every file for platform exists -> sets status
    const allExist = p.files.every((f) => {
      const destPath = resolveDestPath(f.dest, projectRoot);
      return fs.existsSync(destPath);
    });
    installed.set(p.name, allExist);
  }
  return installed;
}
