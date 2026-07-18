import hljs from 'highlight.js';
import { Card } from '../../core/types';
import { ExtensionToWebview, WebviewToExtension } from '../messages';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const cardsEl = $('cards') as HTMLDivElement;
const coverageEl = $('coverage-badge') as HTMLSpanElement;
const storyEl = $('story-banner') as HTMLDivElement;
const searchInput = $('search-input') as HTMLInputElement;
const statusBarEl = $('status-bar') as HTMLDivElement;
const cardsOverlayEl = $('cards-overlay') as HTMLDivElement;
const sortSelect = $('sort-select') as HTMLSelectElement;
const kindSelect = $('kind-select') as HTMLSelectElement;
const filterChips = document.querySelectorAll('.filter-chip') as NodeListOf<HTMLButtonElement>;

interface UIState {
  status: 'loading' | 'ready' | 'error' | 'empty';
  allCards: Card[];
  filterText: string;
  filterStatus: 'all' | 'annotated' | 'missing';
  filterKind: string | null;
  sortBy: 'order' | 'kind' | 'name' | 'lines';
  groupByKind: boolean;
  cardExpanded: Set<string>;
  collapsedGroups: Set<string>;
  editingCardId: string | null;
  lang: string;
  executionFlow: string;
}

const state: UIState = {
  status: 'loading',
  allCards: [],
  filterText: '',
  filterStatus: 'all',
  filterKind: null,
  sortBy: 'order',
  groupByKind: true,
  cardExpanded: new Set(),
  collapsedGroups: new Set(),
  editingCardId: null,
  lang: '',
  executionFlow: '',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

// @preserve @illusion: icon -> returns inline stroke-SVG markup for a named line icon
const ICONS: Record<string, string> = {
  chevron: '<polyline points="6 9 12 15 18 9"></polyline>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  reveal: '<line x1="7" y1="17" x2="17" y2="7"></line><polyline points="9 7 17 7 17 15"></polyline>',
  warning: '<path d="M12 3 2 20h20L12 3z"></path><line x1="12" y1="9" x2="12" y2="14"></line><line x1="12" y1="17" x2="12" y2="17"></line>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="14 3 14 9 20 9"></polyline>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"></path><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"></path>',
};

function icon(name: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] ?? ''}</svg>`;
}

// @preserve @illusion: get_visible_cards -> applies status/kind/text filters + sort -> returns cards
function getVisibleCards(): Card[] {
  let cards = state.allCards;

  if (state.filterStatus === 'annotated') {
    cards = cards.filter(c => c.label != null);
  } else if (state.filterStatus === 'missing') {
    cards = cards.filter(c => c.label == null);
  }

  if (state.filterKind) {
    cards = cards.filter(c => c.kind === state.filterKind);
  }

  if (state.filterText) {
    const q = state.filterText.toLowerCase();
    cards = cards.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      c.kind.toLowerCase().includes(q) ||
      (c.label && c.label.toLowerCase().includes(q))
    );
  }

  switch (state.sortBy) {
    case 'kind':
      cards = [...cards].sort((a, b) => {
        const ka = a.kind.localeCompare(b.kind);
        return ka !== 0 ? ka : (a.name ?? '').localeCompare(b.name ?? '');
      });
      break;
    case 'name':
      cards = [...cards].sort((a, b) => {
        return (a.name ?? '').localeCompare(b.name ?? '') || a.startLine - b.startLine;
      });
      break;
    case 'lines':
      cards = [...cards].sort((a, b) => {
        return (a.endLine - a.startLine) - (b.endLine - b.startLine) || a.startLine - b.startLine;
      });
      break;
  }

  return cards;
}

function getGroupedCards(cards: Card[]): Map<string, Card[]> {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.kind.replace(/_/g, ' ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(card);
  }
  return groups;
}

// @preserve @illusion: render -> rebuilds filter UI + grouped/animated card list from state
function render(): void {
  const total = state.allCards.length;
  const annotated = state.allCards.filter(c => c.label != null).length;
  const visible = getVisibleCards();

  // ── Kind select ──
  const uniqueKinds = [...new Set(state.allCards.map(c => c.kind))].sort();
  while (kindSelect.options.length > 1) kindSelect.options.remove(1);
  for (const k of uniqueKinds) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k.replace(/_/g, ' ');
    if (k === state.filterKind) opt.selected = true;
    kindSelect.appendChild(opt);
  }

  // ── Filter chips ──
  filterChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.status === state.filterStatus);
  });

  // ── Sort select ──
  sortSelect.value = state.sortBy;

  // ── Filter bar visibility ──
  const filterBar = $('filter-bar');
  filterBar.classList.toggle('is-hidden', total === 0 || state.status !== 'ready');

  // ── Story banner ──
  const hasFlow = !!state.executionFlow;
  if (hasFlow) {
    const prevHTML = storyEl.innerHTML;
    const newHTML = `
      <div class="story-header">
        <span class="story-icon">${icon('link')}</span>
        <span class="story-title">Execution Flow</span>
        <button class="story-copy" title="Copy narrative" aria-label="Copy narrative">${icon('copy')}</button>
        <button class="story-toggle" title="Toggle story" aria-label="Toggle story">${icon('chevron')}</button>
      </div>
      <div class="story-body">
        <span class="story-text tree-text">${escapeHtml(state.executionFlow)}</span>
      </div>`;
    if (prevHTML !== newHTML) {
      storyEl.innerHTML = newHTML;
      const header = storyEl.querySelector('.story-header') as HTMLElement;
      const toggle = storyEl.querySelector('.story-toggle') as HTMLButtonElement;
      const copyBtn = storyEl.querySelector('.story-copy') as HTMLButtonElement;
      const toggleStory = () => {
        const collapsed = storyEl.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed', collapsed);
      };
      toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleStory(); });
      header.addEventListener('click', toggleStory);
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(state.executionFlow).catch(() => {});
      });
    }
    storyEl.hidden = false;
  } else {
    storyEl.hidden = true;
  }

  // ── Coverage badge ──
  coverageEl.textContent = `${annotated}/${total} annotated`;
  coverageEl.className = total - annotated > 0 ? 'badge-warn' : 'badge-ok';

  // ── Main cards area ──
  cardsOverlayEl.classList.add('is-hidden');

  if (state.status === 'loading') {
    cardsOverlayEl.classList.remove('is-hidden');
    cardsOverlayEl.innerHTML = '<div class="loading-spinner"></div><div class="loading-text">Analyzing...</div>';
    cardsEl.innerHTML = '';
  } else if (state.status === 'error') {
    cardsOverlayEl.classList.remove('is-hidden');
    cardsOverlayEl.className = 'state-overlay error-state';
    cardsOverlayEl.innerHTML = `<div class="state-icon">${icon('warning')}</div><div class="state-message">Analysis failed. Check the editor and try again.</div>`;
    cardsEl.innerHTML = '';
  } else if (total === 0) {
    cardsOverlayEl.classList.remove('is-hidden');
    cardsOverlayEl.className = 'state-overlay';
    cardsOverlayEl.innerHTML = `<div class="state-icon">${icon('doc')}</div><div class="state-message">No code blocks detected in this file.</div>`;
    cardsEl.innerHTML = '';
  } else if (visible.length === 0) {
    cardsEl.innerHTML = `<div class="state-overlay" style="display:flex"><div class="state-icon">${icon('search')}</div><div class="state-message">No cards match <strong>${escapeHtml(state.filterText)}</strong>. Try a different filter.</div></div>`;
  } else if (state.groupByKind) {
    const groups = getGroupedCards(visible);
    let html = '';
    for (const [kind, gCards] of groups) {
      const isCollapsed = state.collapsedGroups.has(kind);
      const count = gCards.length;
      html += `<div class="group" role="region" aria-label="${escapeHtml(kind)}">
        <div class="group-header ${isCollapsed ? 'collapsed' : ''}" role="button" tabindex="0" aria-expanded="${!isCollapsed}" data-kind="${escapeHtml(kind)}">
           <span class="group-icon" aria-hidden="true">${icon('chevron')}</span>
          <span class="group-title">${escapeHtml(kind)}</span>
          <span class="group-count">${count}</span>
        </div>
        <div class="group-cards">`;
      for (const card of gCards) {
        html += buildCardHTML(card, state.lang);
      }
      html += '</div></div>';
    }
    cardsEl.innerHTML = html;

    // Group toggle listeners
    cardsEl.querySelectorAll('.group-header').forEach(header => {
      header.addEventListener('click', () => {
        const kind = (header as HTMLElement).dataset.kind!;
        if (state.collapsedGroups.has(kind)) {
          state.collapsedGroups.delete(kind);
        } else {
          state.collapsedGroups.add(kind);
        }
        render();
      });
      (header as HTMLElement).addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault();
          (ke.currentTarget as HTMLElement).click();
        }
      });
    });
  } else {
    cardsEl.innerHTML = visible.map(card => buildCardHTML(card, state.lang)).join('');
  }

  // ── Card interactivity ──
  cardsEl.querySelectorAll('.card').forEach(el => {
    const cardDiv = el as HTMLElement;
    const cardId = cardDiv.dataset.cardId!;
    const codePre = cardDiv.querySelector('.card-code') as HTMLPreElement | null;

    cardDiv.addEventListener('click', (e) => {
      if (e.target !== cardDiv && !cardDiv.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      if (target.closest('.card-actions') || target.closest('.card-label.editing') || target.closest('input')) return;
      if (codePre) {
        const hidden = codePre.hidden;
        codePre.hidden = !hidden;
        if (hidden) {
          state.cardExpanded.add(cardId);
        } else {
          state.cardExpanded.delete(cardId);
        }
        cardDiv.setAttribute('aria-expanded', String(!hidden));
      }
    });

    (cardDiv as HTMLElement).addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        cardDiv.click();
      }
    });
  });

  // ── Card action buttons ──
  cardsEl.querySelectorAll('.reveal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { startLine, endLine } = (btn as HTMLElement).dataset;
      vscode.postMessage({ type: 'reveal', startLine: Number(startLine), endLine: Number(endLine) });
    });
  });
  cardsEl.querySelectorAll('.scaffold-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { startLine } = (btn as HTMLElement).dataset;
      vscode.postMessage({ type: 'scaffold', startLine: Number(startLine) });
    });
  });

  // ── Inline editing ──
  if (state.editingCardId) {
    const input = document.querySelector('.card-label.editing input') as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }
}

// @preserve @illusion: build_card_html -> emits one card's markup (head, label/badge, actions, code)
function buildCardHTML(card: Card, lang: string): string {
  const missing = card.label == null;
  const isEditing = state.editingCardId === card.id;
  const expanded = state.cardExpanded.has(card.id);
  const cls = `card ${missing ? 'missing' : 'annotated'}`;

  const labelHtml = isEditing
    ? `<div class="card-label editing"><input type="text" value="${escapeHtml(card.label ?? '')}" data-card-id="${escapeHtml(card.id)}"><span class="editing-hint">Enter to save, Esc to cancel</span></div>`
    : missing
      ? `<div class="card-label"><span class="badge">${icon('warning')} missing @illusion</span></div>`
      : `<div class="card-label ${card.narrative && card.narrative.includes('\n') ? 'tree-text' : ''}" data-editable="${escapeHtml(card.id)}">${escapeHtml(card.narrative ?? card.label ?? '')}</div>`;

  const revealData = `data-start-line="${card.startLine}" data-end-line="${card.endLine}"`;
  const scaffoldBtn = missing
    ? `<button class="scaffold-btn" data-start-line="${card.startLine}" aria-label="Scaffold annotation">${icon('plus')} scaffold</button>`
    : '';

  const codeHtml = `<pre class="card-code" ${expanded ? '' : 'hidden'}><code>${highlightBlock(card.code, lang)}</code></pre>`;

  const nameHtml = card.name ? `<span class="name">${escapeHtml(card.name)}</span>` : '';

  return `<div class="${cls}" data-card-id="${escapeHtml(card.id)}" tabindex="0" role="button" aria-expanded="${expanded}">
    <div class="card-head">
      <span class="kind">${escapeHtml(card.kind)}</span>
      ${nameHtml}
      <span class="range">${card.startLine}-${card.endLine}</span>
    </div>
    ${labelHtml}
    <div class="card-actions">
      <button class="reveal-btn" ${revealData} aria-label="Reveal in editor">${icon('reveal')} reveal</button>
      ${scaffoldBtn}
    </div>
    ${codeHtml}
  </div>`;
}

// @preserve @illusion: start_editing -> marks a card as editing -> re-renders with input focused
function startEditing(cardId: string): void {
  state.editingCardId = cardId;
  render();
}

// @preserve @illusion: finish_editing -> commits label -> posts editAnnotation to extension
function finishEditing(cardId: string, newLabel: string): void {
  const card = state.allCards.find(c => c.id === cardId);
  if (!card) { state.editingCardId = null; render(); return; }

  const trimmed = newLabel.trim();
  if (!trimmed || trimmed === card.label) {
    state.editingCardId = null;
    render();
    return;
  }

  card.label = trimmed;
  state.editingCardId = null;
  render();

  vscode.postMessage({
    type: 'editAnnotation',
    startLine: card.startLine,
    endLine: card.endLine,
    newLabel: trimmed,
  });
}

function cancelEditing(): void {
  state.editingCardId = null;
  render();
}

// ── Event: label click for inline editing ──
cardsEl.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const label = target.closest('[data-editable]') as HTMLElement | null;
  if (label && !state.editingCardId) {
    e.stopPropagation();
    startEditing(label.dataset.editable!);
  }
});

// ── Event: inline edit input keydown/blur ──
cardsEl.addEventListener('keydown', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.tagName !== 'INPUT' || !input.closest('.card-label.editing')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    const cardId = input.dataset.cardId!;
    finishEditing(cardId, input.value);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelEditing();
  }
});

cardsEl.addEventListener('blur', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.tagName !== 'INPUT' || !input.closest('.card-label.editing')) return;
  const cardId = input.dataset.cardId!;
  finishEditing(cardId, input.value);
}, true);

// ── Global error handler ──
window.addEventListener('error', (e) => {
  console.error('Code Illusion webview error:', e.error || e.message);
  statusBarEl.className = 'status-bar error';
  statusBarEl.textContent = 'An error occurred. Check the console for details.';
  statusBarEl.classList.remove('is-hidden');
});

// ── Collapse / Expand all ──
function collapseAllCards(): void {
  state.cardExpanded.clear();
  cardsEl.querySelectorAll('.card').forEach(el => {
    el.setAttribute('aria-expanded', 'false');
  });
  cardsEl.querySelectorAll('.card-code').forEach(pre => {
    (pre as HTMLPreElement).hidden = true;
  });
}

function expandAllCards(): void {
  for (const card of state.allCards) {
    state.cardExpanded.add(card.id);
  }
  cardsEl.querySelectorAll('.card-code').forEach(pre => {
    (pre as HTMLPreElement).hidden = false;
  });
  cardsEl.querySelectorAll('.card').forEach(el => {
    el.setAttribute('aria-expanded', 'true');
  });
}

// ── Init ──
(function init(): void {
  try {
    // ── Search input ──
    searchInput.addEventListener('input', () => {
      state.filterText = searchInput.value;
      render();
    });

    // ── Filter chips ──
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const status = chip.dataset.status as UIState['filterStatus'];
        if (status !== state.filterStatus) {
          state.filterStatus = status;
          render();
        }
      });
    });

    // ── Sort select ──
    sortSelect.addEventListener('change', () => {
      state.sortBy = sortSelect.value as UIState['sortBy'];
      render();
    });

    // ── Kind select ──
    kindSelect.addEventListener('change', () => {
      state.filterKind = kindSelect.value || null;
      render();
    });

    // ── Collapse/expand ──
    $('collapse-all')?.addEventListener('click', collapseAllCards);
    $('expand-all')?.addEventListener('click', expandAllCards);

    // ── Escape key ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Escape') {
        if (state.editingCardId) {
          cancelEditing();
          return;
        }
        collapseAllCards();
      }
    });

    // ── Message listener ──
    window.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data as ExtensionToWebview;
      if (msg && msg.type === 'update') {
        state.editingCardId = null;
        state.allCards = msg.cards;
        state.lang = msg.highlight;
        state.executionFlow = msg.executionFlow;
        state.status = msg.cards.length === 0 ? 'empty' : 'ready';
        state.filterKind = kindSelect.value || null;
        render();
      } else if (msg && msg.type === 'theme') {
        document.body.dataset.themeKind = msg.kind;
      } else if (msg && msg.type === 'status') {
        if (msg.severity === 'error') {
          statusBarEl.className = 'status-bar error';
          statusBarEl.textContent = msg.message;
          statusBarEl.classList.remove('is-hidden');
        } else if (msg.severity === 'info') {
          statusBarEl.className = 'status-bar info';
          statusBarEl.textContent = msg.message;
          statusBarEl.classList.remove('is-hidden');
          setTimeout(() => statusBarEl.classList.add('is-hidden'), 4000);
        } else if (msg.severity === 'loading') {
          state.status = 'loading';
          render();
        }
      }
    });

    // ── Ready signal ──
    vscode.postMessage({ type: 'ready' });
  } catch (e) {
    console.error('Code Illusion: init failed', e);
    statusBarEl.className = 'status-bar error';
    statusBarEl.textContent = 'Initialization failed. Try reloading.';
    statusBarEl.classList.remove('is-hidden');
  }
})();
