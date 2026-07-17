import { Card } from '../core/types';

export interface UpdateMessage {
  type: 'update';
  language: string;
  highlight: string;
  source: string;
  cards: Card[];
  executionFlow: string;
}

export interface ReadyMessage {
  type: 'ready';
}

export interface RevealMessage {
  type: 'reveal';
  startLine: number;
  endLine: number;
}

export interface ScaffoldMessage {
  type: 'scaffold';
  startLine: number;
}

export type WebviewToExtension = ReadyMessage | RevealMessage | ScaffoldMessage;
export type ExtensionToWebview = UpdateMessage;
