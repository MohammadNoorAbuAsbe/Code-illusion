import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface RuleFile {
  from: string;
  to: string;
}

const RULE_FILES: RuleFile[] = [
  { from: 'AGENTS.md', to: 'AGENTS.md' },
  { from: 'CLAUDE.md', to: 'CLAUDE.md' },
  { from: 'copilot-instructions.md', to: path.join('.github', 'copilot-instructions.md') },
  { from: 'code-illusion.mdc', to: path.join('.cursor', 'rules', 'code-illusion.mdc') }
];

// @preserve @illusion: init_rules_command -> copies agent rule templates to workspace root
export async function initRulesCommand(context: vscode.ExtensionContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('Code Illusion: open a workspace/folder first.');
    return;
  }
  const root = folders[0].uri.fsPath;
  const srcDir = context.asAbsolutePath(path.join('dist', 'agent-rules'));

  if (!fs.existsSync(srcDir)) {
    vscode.window.showErrorMessage('Code Illusion: agent-rules templates not found (run build first).');
    return;
  }

  const written: string[] = [];
  const skipped: string[] = [];
  // @preserve @illusion: copy_rule_files -> iterate rule files -> copy if not exists
  for (const rf of RULE_FILES) {
    const from = path.join(srcDir, rf.from);
    if (!fs.existsSync(from)) {
      continue;
    }
    const to = path.join(root, rf.to);
    if (fs.existsSync(to)) {
      skipped.push(rf.to);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    written.push(rf.to);
  }

  if (written.length) {
    vscode.window.showInformationMessage(
      `Code Illusion: wrote agent rules -> ${written.join(', ')}. Agents will now annotate with @illusion.`
    );
  }
  if (skipped.length) {
    vscode.window.showWarningMessage(
      `Code Illusion: skipped existing files -> ${skipped.join(', ')} (delete to regenerate).`
    );
  }
  if (!written.length && !skipped.length) {
    vscode.window.showWarningMessage('Code Illusion: no rule templates available.');
  }
}
