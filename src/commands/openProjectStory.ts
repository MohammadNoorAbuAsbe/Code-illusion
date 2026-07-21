import * as vscode from 'vscode';
import { analyzeProject } from '../core/project';
import { showProjectStory } from '../webview/projectStory';

// @illusion: open_project_story_command -> resolves workspace target -> analyzes project -> shows story webview
export async function openProjectStoryCommand(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  let target = folder ? folder.uri.fsPath : undefined;
  if (!target) {
    const editor = vscode.window.activeTextEditor;
    if (editor) target = vscode.Uri.joinPath(editor.document.uri, '..').fsPath;
  }
  if (!target) {
    vscode.window.showErrorMessage('Code Illusion: Open a project folder or file first.');
    return;
  }
  const depth = vscode.workspace.getConfiguration('codeIllusion').get<number>('narrativeDepth') ?? 2;
  const analysis = await analyzeProject([target], { narrativeDepth: depth });
  showProjectStory(context, analysis, target);
}
