import { Card } from '../core/types';

export interface UpdateMessage {
  type: 'update';
  language: string;
  highlight: string;
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

export interface EditAnnotationMessage {
  type: 'editAnnotation';
  startLine: number;
  endLine: number;
  newLabel: string;
}

export type WebviewToExtension = ReadyMessage | RevealMessage | ScaffoldMessage | EditAnnotationMessage;

export interface ShowStatusMessage {
  type: 'status';
  severity: 'loading' | 'error' | 'info';
  message: string;
}

export interface ThemeMessage {
  type: 'theme';
  kind: 'light' | 'dark';
}

export type ExtensionToWebview = UpdateMessage | ShowStatusMessage | ThemeMessage;
