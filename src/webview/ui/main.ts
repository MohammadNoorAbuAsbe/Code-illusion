import hljs from 'highlight.js';
import { Card } from '../../core/types';
import { ExtensionToWebview, WebviewToExtension } from '../messages';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

const codeLinesEl = document.getElementById('code-lines') as HTMLDivElement;
const cardsEl = document.getElementById('cards') as HTMLDivElement;
const coverageEl = document.getElementById('coverage-badge') as HTMLSpanElement;
const storyEl = document.getElementById('story-banner') as HTMLDivElement;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(line: string, lang: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(line, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(line).value;
  } catch {
    return escapeHtml(line);
  }
}

function highlightBlock(code: string, lang: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

let allCards: Card[] = [];
const cardExpanded = new Set<string>();

function collapseAllCards(): void {
  cardExpanded.clear();
  const preEls = cardsEl.querySelectorAll('.card-code') as NodeListOf<HTMLPreElement>;
  for (const pre of preEls) {
    pre.hidden = true;
  }
}

function expandAllCards(): void {
  const preEls = cardsEl.querySelectorAll('.card-code') as NodeListOf<HTMLPreElement>;
  for (let i = 0; i < allCards.length; i++) {
    cardExpanded.add(allCards[i].id);
  }
  for (const pre of preEls) {
    pre.hidden = false;
  }
}

function render(msg: ExtensionToWebview): void {
  allCards = msg.cards;
  const lines = msg.source.split('\n');
  const lineClass = new Map<number, 'ann' | 'miss'>();

  for (const card of msg.cards) {
    for (let n = card.startLine; n <= card.endLine; n++) {
      if (card.label == null) {
        lineClass.set(n, 'miss');
      } else if (!lineClass.has(n)) {
        lineClass.set(n, 'ann');
      }
    }
  }

  codeLinesEl.innerHTML = lines
    .map((line: string, i: number) => {
      const n = i + 1;
      const cls = lineClass.get(n) ?? '';
      return `<div class="code-line ${cls}" data-line="${n}"><span class="ln">${n}</span><span class="lc">${highlight(line, msg.highlight)}</span></div>`;
    })
    .join('');

  if (msg.executionFlow) {
    storyEl.hidden = false;
    storyEl.innerHTML = `
      <div class="story-header">
        <span class="story-icon">⛓</span>
        <span class="story-title">Execution Flow</span>
        <button class="story-copy" title="Copy narrative">📋</button>
        <button class="story-toggle" title="Toggle story">▼</button>
      </div>
      <div class="story-body">
        <span class="story-text tree-text">${escapeHtml(msg.executionFlow)}</span>
      </div>`;
    const header = storyEl.querySelector('.story-header') as HTMLElement;
    const toggle = storyEl.querySelector('.story-toggle') as HTMLButtonElement;
    const copyBtn = storyEl.querySelector('.story-copy') as HTMLButtonElement;

    const toggleStory = () => {
      const collapsed = storyEl.classList.toggle('collapsed');
      toggle.textContent = collapsed ? '▶' : '▼';
    };
    toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleStory(); });
    header.addEventListener('click', toggleStory);
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(msg.executionFlow).catch(() => {});
    });
  } else {
    storyEl.hidden = true;
  }

  let missing = 0;
  cardsEl.innerHTML = '';
  for (const card of msg.cards) {
    if (card.label == null) {
      missing++;
    }
    cardsEl.appendChild(buildCard(card, msg.highlight));
  }

  coverageEl.textContent = `${msg.cards.length - missing}/${msg.cards.length} annotated`;
  coverageEl.className = missing > 0 ? 'badge-warn' : 'badge-ok';
}

function buildCard(card: Card, lang: string): HTMLElement {
  const missing = card.label == null;
  const el = document.createElement('div');
  el.className = 'card ' + (missing ? 'missing' : 'annotated');
  el.tabIndex = 0;

  const head = document.createElement('div');
  head.className = 'card-head';
  head.innerHTML = `
    <span class="kind">${escapeHtml(card.kind)}</span>
    ${card.name ? `<span class="name">${escapeHtml(card.name)}</span>` : ''}
    <span class="range">${card.startLine}-${card.endLine}</span>`;

  const label = document.createElement('div');
  label.className = 'card-label';
  if (missing) {
    label.innerHTML = '<span class="badge">⚠ missing @illusion</span>';
  } else {
    const display = card.narrative ?? card.label;
    label.textContent = display as string;
  }
  if (!missing && card.narrative && card.narrative.includes('\n')) {
    label.classList.add('tree-text');
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const revealBtn = document.createElement('button');
  revealBtn.className = 'reveal-btn';
  revealBtn.textContent = '↗ reveal';
  revealBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    vscode.postMessage({ type: 'reveal', startLine: card.startLine, endLine: card.endLine });
  });
  actions.appendChild(revealBtn);

  if (missing) {
    const scaffoldBtn = document.createElement('button');
    scaffoldBtn.className = 'scaffold-btn';
    scaffoldBtn.textContent = '＋ scaffold';
    scaffoldBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'scaffold', startLine: card.startLine });
    });
    actions.appendChild(scaffoldBtn);
  }

  const code = document.createElement('pre');
  code.className = 'card-code';
  code.hidden = !cardExpanded.has(card.id);
  code.innerHTML = `<code>${highlightBlock(card.code, lang)}</code>`;

  el.appendChild(head);
  el.appendChild(label);
  el.appendChild(actions);
  el.appendChild(code);

  el.addEventListener('click', () => {
    code.hidden = !code.hidden;
    if (code.hidden) {
      cardExpanded.delete(card.id);
    } else {
      cardExpanded.add(card.id);
    }
  });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.click();
    }
  });

  return el;
}

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as ExtensionToWebview;
  if (msg && msg.type === 'update') {
    render(msg);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'c' && (e.ctrlKey || e.metaKey)) return;
  if (e.key === 'Escape' && cardsEl) {
    collapseAllCards();
  }
});

document.getElementById('collapse-all')?.addEventListener('click', collapseAllCards);
document.getElementById('expand-all')?.addEventListener('click', expandAllCards);

vscode.postMessage({ type: 'ready' });
