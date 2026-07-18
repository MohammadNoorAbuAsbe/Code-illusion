import * as vscode from 'vscode';
import { AnalysisResult } from '../core/types';
import { highlightId } from '../core/languages';
import { analyzeDocument } from '../core/annotations';
import { UpdateMessage, WebviewToExtension } from './messages';
import { applyDecorations, clearDecorations } from './decorations';

let panel: vscode.WebviewPanel | null = null;
let currentUri: vscode.Uri | null = null;
let extensionContext: vscode.ExtensionContext | null = null;
let docChangeListener: vscode.Disposable | null = null;
let themeListener: vscode.Disposable | null = null;

// @preserve @illusion: editor_for_uri -> finds open editor matching the tracked uri
function editorForUri(uri: vscode.Uri): vscode.TextEditor | undefined {
  return vscode.window.visibleTextEditors.find(
    e => e.document.uri.toString() === uri.toString()
  );
}

// @preserve @illusion: reanalyze_and_decorate -> re-runs analysis -> repaints editor markers
async function reanalyzeAndDecorate(uri: vscode.Uri): Promise<void> {
  const editor = editorForUri(uri);
  if (!editor) return;
  const result = await analyzeDocument(editor.document.getText(), editor.document.languageId);
  applyDecorations(editor, result.cards);
}

// @preserve @illusion: webview_content -> builds HTML template with CSP nonce and asset URIs
function webviewContent(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): string {
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js')
  );
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'styles.css')
  );
  const nonce = getNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>De-cluttered View</title>
</head>
<body>
  <div id="app">
    <section id="cards-pane" role="region" aria-label="De-cluttered cards">
      <div class="pane-header">
        De-cluttered Cards
        <span id="coverage-badge" aria-live="polite"></span>
        <span class="pane-actions">
          <button id="collapse-all" title="Collapse all code" aria-label="Collapse all code"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2"></rect><line x1="8" y1="12" x2="16" y2="12"></line></svg></button>
          <button id="expand-all" title="Expand all code" aria-label="Expand all code"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg></button>
        </span>
      </div>
      <div id="status-bar" class="status-bar is-hidden" role="status" aria-live="polite"></div>
      <div id="filter-bar" class="filter-bar is-hidden">
        <input type="search" id="search-input" class="search-input" placeholder="Filter cards by name, kind, or label..." aria-label="Filter cards by text">
        <span class="filter-chips" role="group" aria-label="Annotation status filter">
          <button class="filter-chip active" data-status="all" aria-label="Show all cards">All</button>
          <button class="filter-chip" data-status="annotated" aria-label="Show annotated only">Annotated</button>
          <button class="filter-chip" data-status="missing" aria-label="Show missing only">Missing</button>
        </span>
        <select id="sort-select" class="filter-select" aria-label="Sort cards">
          <option value="order">Source order</option>
          <option value="kind">By kind</option>
          <option value="name">By name</option>
          <option value="lines">By lines</option>
        </select>
        <select id="kind-select" class="filter-select" aria-label="Filter by block kind">
          <option value="">All kinds</option>
        </select>
      </div>
      <div id="story-banner" hidden></div>
      <div id="cards-overlay" class="state-overlay is-hidden" aria-live="polite">
        <div class="loading-spinner"></div>
        <div class="loading-text">Analyzing...</div>
      </div>
      <div id="cards"></div>
    </section>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

// @preserve @illusion: get_nonce -> generates 32-char random nonce for CSP
function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // @preserve @illusion: build_nonce -> iterate 32 times -> pick random char
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

// @preserve @illusion: edit_annotation -> finds @illusion comment above block -> replaces label text
async function editAnnotation(uri: vscode.Uri, startLine: number, endLine: number, newLabel: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const maxLookback = 10;
  const start = Math.max(0, startLine - 2);
  // @preserve @illusion: search_backwards -> iterate lines upwards from block -> find @illusion
  for (let line = start; line >= 0 && line > start - maxLookback; line--) {
    const text = doc.lineAt(line).text;
    const match = text.match(/@illusion\s*:\s*.+?(?=\s*\*\/|\s*$)/);
    if (match) {
      const range = new vscode.Range(line, match.index!, line, match.index! + match[0].length);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, range, `@illusion: ${newLabel}`);
      await vscode.workspace.applyEdit(edit);
      return;
    }
  }
  vscode.window.showErrorMessage('Code Illusion: Could not find @illusion annotation above the block.');
}

// @preserve @illusion: reveal_in_editor -> opens document -> scrolls to range -> sets selection
async function revealInEditor(uri: vscode.Uri, startLine: number, endLine: number): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.One,
    preserveFocus: false
  });
  const range = new vscode.Range(startLine - 1, 0, endLine, 0);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  editor.selection = new vscode.Selection(startLine - 1, 0, startLine - 1, 0);
}

// @preserve @illusion: show_decluttered_view -> creates panel -> wires message handlers -> posts update
export function showDeclutteredView(
  ext: vscode.ExtensionContext,
  editor: vscode.TextEditor,
  result: AnalysisResult
): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'codeIllusion',
      'De-cluttered View',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    // @preserve @illusion: panel_on_dispose -> clear markers + listeners -> nullify panel state
    panel.onDidDispose(() => {
      if (currentUri) {
        const ed = editorForUri(currentUri);
        if (ed) clearDecorations(ed);
      }
      docChangeListener?.dispose();
      docChangeListener = null;
      themeListener?.dispose();
      themeListener = null;
      panel = null;
      currentUri = null;
      extensionContext = null;
    });

    // @preserve @illusion: watch_theme -> post light/dark kind to webview on theme change
    themeListener = vscode.window.onDidChangeActiveColorTheme((e) => {
      const kind = e.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
      panel?.webview.postMessage({ type: 'theme', kind });
    });
    // @preserve @illusion: handle_webview_messages -> handle ready/reveal/scaffold messages from webview
    panel.webview.onDidReceiveMessage(async (msg: WebviewToExtension) => {
      if (msg.type === 'ready') {
        if (currentUri && extensionContext) {
          try {
            const doc = await vscode.workspace.openTextDocument(currentUri);
            const result = await analyzeDocument(doc.getText(), doc.languageId);
            const update: UpdateMessage = {
              type: 'update',
              language: result.language,
              highlight: highlightId(result.language),
              cards: result.cards,
              executionFlow: result.executionFlow ?? ''
            };
            panel?.webview.postMessage(update);
          } catch {
            panel?.webview.postMessage({
              type: 'status',
              severity: 'error',
              message: 'Analysis failed. Check the active editor.'
            });
          }
        }
      } else if (msg.type === 'reveal' && currentUri) {
        await revealInEditor(currentUri, msg.startLine, msg.endLine);
      } else if (msg.type === 'scaffold' && currentUri) {
        await vscode.commands.executeCommand(
          'codeIllusion.scaffold',
          { uri: currentUri, line: msg.startLine }
        );
      } else if (msg.type === 'editAnnotation' && currentUri) {
        try {
          await editAnnotation(currentUri, msg.startLine, msg.endLine, msg.newLabel);
        } catch {
          panel?.webview.postMessage({
            type: 'status',
            severity: 'error',
            message: 'Failed to edit annotation.'
          });
        }
      }
    });
    panel.webview.html = webviewContent(panel, ext.extensionUri);
  }

  extensionContext = ext;
  currentUri = editor.document.uri;

  // @preserve @illusion: paint_markers -> decorate the active editor with ann/miss ranges
  applyDecorations(editor, result.cards);

  // @preserve @illusion: watch_edits -> re-decorate when the tracked document changes
  if (!docChangeListener) {
    docChangeListener = vscode.workspace.onDidChangeTextDocument(e => {
      if (currentUri && e.document.uri.toString() === currentUri.toString()) {
        reanalyzeAndDecorate(currentUri);
      }
    });
  }

  const update: UpdateMessage = {
    type: 'update',
    language: result.language,
    highlight: highlightId(result.language),
    cards: result.cards,
    executionFlow: result.executionFlow ?? ''
  };
  panel.webview.postMessage(update);
  const initialKind = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
  panel.webview.postMessage({ type: 'theme', kind: initialKind });
  panel.reveal(vscode.ViewColumn.Beside, true);
}

// @preserve @illusion: is_panel_open -> returns true if panel exists
export function isPanelOpen(): boolean {
  return panel !== null;
}
