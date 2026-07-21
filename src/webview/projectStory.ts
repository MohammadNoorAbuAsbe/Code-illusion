import * as vscode from 'vscode';
import { ProjectAnalysis } from '../core/project';

let panel: vscode.WebviewPanel | null = null;

// @illusion: show_project_story -> creates/updates panel -> renders unified story + coverage
export function showProjectStory(context: vscode.ExtensionContext, analysis: ProjectAnalysis, target: string): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel('codeIllusionProject', 'Project Story', vscode.ViewColumn.Beside, {
      enableScripts: false,
      retainContextWhenHidden: true,
    });
    panel.onDidDispose(() => {
      panel = null;
    });
  }
  panel.webview.html = content(panel, analysis, target);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

// @illusion: escape_html -> escapes user text -> safe to embed
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// @illusion: content -> builds HTML with coverage header + execution-flow tree
function content(panel: vscode.WebviewPanel, analysis: ProjectAnalysis, target: string): string {
  const pct = analysis.coverage.total
    ? Math.round((analysis.coverage.annotated / analysis.coverage.total) * 100)
    : 0;
  const flow = escapeHtml(analysis.executionFlow || '(no execution flow — no entry points detected)');
  const fileCount = analysis.files.length;
  const missingCount = analysis.coverage.missing.length;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Project Story</title>
  <style>
    body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px 20px; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 14px; word-break: break-all; }
    .stats { display: flex; gap: 18px; margin-bottom: 16px; }
    .stat { background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 6px; padding: 8px 14px; }
    .stat .num { font-size: 20px; font-weight: 600; }
    .stat .lbl { font-size: 11px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: .04em; }
    .bar { height: 6px; border-radius: 3px; background: var(--vscode-badge-background); margin-top: 8px; overflow: hidden; }
    .bar > i { display: block; height: 100%; background: var(--vscode-charts-green, #89d185); }
    pre { white-space: pre-wrap; line-height: 1.5; font-size: 13px; }
    .warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  </style>
</head>
<body>
  <h1>Code Illusion — Project Story</h1>
  <div class="meta">${escapeHtml(target)}</div>
  <div class="stats">
    <div class="stat"><div class="num">${fileCount}</div><div class="lbl">Files</div></div>
    <div class="stat"><div class="num">${analysis.coverage.total}</div><div class="lbl">Blocks</div></div>
    <div class="stat"><div class="num">${analysis.coverage.annotated}</div><div class="lbl">Annotated</div></div>
    <div class="stat"><div class="num">${missingCount}</div><div class="lbl">Missing</div></div>
    <div class="stat" style="min-width:140px">
      <div class="num">${pct}%</div><div class="lbl">Coverage</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>
  </div>
  <pre>${flow.replace(/⚠ missing annotation/g, '<span class="warn">⚠ missing annotation</span>')}</pre>
</body>
</html>`;
}
