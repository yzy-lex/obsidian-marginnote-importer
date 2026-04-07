/** Type definitions for MarginNote Importer */

export interface NoteRow {
	noteId: string;
	mindLinks: string | null;
	noteTitle: string | null;
	highlightText: string | null;
	childMapNoteId: string | null;
	notesText: string | null;
	notesBlob: Uint8Array | null;
}

export interface TopicRow {
	topicId: string;
	title: string;
}

export interface MindNode {
	id: string;
	title: string;
	highlight: string;
	childMapNoteId: string | null;
	notesText: string;
	notesBlob: Uint8Array | null;
}

export interface ImporterSettings {
	dbPath: string;
	outputFolder: string;
	maxWidth: number;
	foldDepth: number;
	lastTopicId: string;
	manualNesting: Record<string, string>;
}

export const DEFAULT_SETTINGS: ImporterSettings = {
	dbPath: "~/Library/Containers/QReader.MarginStudy.easy/Data/Library/Private Documents/MN4NotebookDatabase/0/MarginNotes.sqlite",
	outputFolder: "脑图",
	maxWidth: 300,
	foldDepth: 3,
	lastTopicId: "",
	manualNesting: {},
};

/** Parsed node map: noteId → node data */
export type NodeMap = Map<string, MindNode>;

/** Parent→children mapping built from ZMINDLINKS */
export type ChildrenMap = Map<string, string[]>;

/** Set of all node IDs that appear as a child */
export type AllChildrenSet = Set<string>;

/** Sub-mind-map root ID → resolved label */
export type SubMindMapLabels = Map<string, string>;

/** Sub-mind-map root ID → sanitized filename (no extension) */
export type SubMindMapFiles = Map<string, string>;

/** WRAPPER map: wrapper root ID → actual content node ID */
export type WrapperMap = Map<string, string>;

/** Portal map: leaf node ID → sub-mind-map root ID it refers to */
export type PortalMap = Map<string, string>;
