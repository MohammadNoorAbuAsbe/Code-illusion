import * as vscode from 'vscode';
import { AnalysisResult } from '../core/types';
import { highlightId } from '../core/languages';
import { analyzeDocument } from '../core/annotations';
import { UpdateMessage, WebviewToExtension } from './messages';

let panel: vscode.WebviewPanel | null = null;
let currentUri: vscode.Uri | null = null;
let extensionContext: vscode.ExtensionContext | null = null;

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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}'; worker-src ${panel.webview.cspSource};" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>De-cluttered View</title>
</head>
<body>
  <div id="app">
    <section id="code-pane">
      <div class="pane-header">Original Code</div>
      <div id="code-lines"></div>
    </section>
    <section id="cards-pane">
      <div class="pane-header">
        De-cluttered Cards
        <span id="coverage-badge"></span>
        <span class="pane-actions">
          <button id="collapse-all" title="Collapse all code">⊟</button>
          <button id="expand-all" title="Expand all code">⊞</button>
        </span>
      </div>
      <div id="story-banner" hidden></div>
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
    // @preserve @illusion: panel_on_dispose -> nullify panel state on webview close
    panel.onDidDispose(() => {
      panel = null;
      currentUri = null;
      extensionContext = null;
    });
    // @preserve @illusion: handle_webview_messages -> handle ready/reveal/scaffold messages from webview
    panel.webview.onDidReceiveMessage(async (msg: WebviewToExtension) => {
      if (msg.type === 'ready') {
        if (currentUri && extensionContext) {
          try {
            const doc = await vscode.workspace.openTextDocument(currentUri);
            const source = doc.getText();
            const result = await analyzeDocument(source, doc.languageId);
            const update: UpdateMessage = {
              type: 'update',
              language: result.language,
              highlight: highlightId(result.language),
              source: result.source,
              cards: result.cards,
              executionFlow: result.executionFlow ?? ''
            };
            panel?.webview.postMessage(update);
          } catch {
            // silently ignore — panel will get data on next change
          }
        }
      } else if (msg.type === 'reveal' && currentUri) {
        await revealInEditor(currentUri, msg.startLine, msg.endLine);
      } else if (msg.type === 'scaffold' && currentUri) {
        await vscode.commands.executeCommand(
          'codeIllusion.scaffold',
          { uri: currentUri, line: msg.startLine }
        );
      }
    });
    panel.webview.html = webviewContent(panel, ext.extensionUri);
  }

  extensionContext = ext;
  currentUri = editor.document.uri;
  const update: UpdateMessage = {
    type: 'update',
    language: result.language,
    highlight: highlightId(result.language),
    source: result.source,
    cards: result.cards,
    executionFlow: result.executionFlow ?? ''
  };
  panel.webview.postMessage(update);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

// @preserve @illusion: is_panel_open -> returns true if panel exists
export function isPanelOpen(): boolean {
  return panel !== null;
}
