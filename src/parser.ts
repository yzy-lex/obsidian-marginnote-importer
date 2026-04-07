/**
 * Parser: builds mind map tree from raw DB rows.
 * Handles ZMINDLINKS parsing, text priority, LinkNote concatenation,
 * sub-mind-map detection, WRAPPER unwrapping, and Portal matching.
 *
 * Direct port of mn_to_markmind.py logic.
 */
import type {
	NoteRow,
	MindNode,
	NodeMap,
	ChildrenMap,
	AllChildrenSet,
	SubMindMapLabels,
	SubMindMapFiles,
	WrapperMap,
	PortalMap,
} from "./types";

// ===================================================================
// Build node map and parent→children relationships from DB rows
// ===================================================================

export interface ParsedTree {
	nodes: NodeMap;
	children: ChildrenMap;
	allChildren: AllChildrenSet;
}

export function buildTree(rows: NoteRow[]): ParsedTree {
	const nodes: NodeMap = new Map();
	const children: ChildrenMap = new Map();
	const allChildren: AllChildrenSet = new Set();

	for (const row of rows) {
		nodes.set(row.noteId, {
			id: row.noteId,
			title: (row.noteTitle || "").trim(),
			highlight: (row.highlightText || "").trim(),
			childMapNoteId: row.childMapNoteId,
			notesText: (row.notesText || "").trim(),
			notesBlob: row.notesBlob,
		});

		if (row.mindLinks) {
			// ZMINDLINKS uses pipe | delimiter
			const childIds = row.mindLinks
				.split("|")
				.map((s) => s.trim())
				.filter(Boolean);
			children.set(row.noteId, childIds);
			for (const cid of childIds) {
				allChildren.add(cid);
			}
		}
	}

	return { nodes, children, allChildren };
}

// ===================================================================
// LinkNote extraction from ZNOTES binary plist
// ===================================================================

/**
 * Extract linked note UUIDs from ZNOTES bplist blob.
 * When a highlight spans two PDF pages, MarginNote stores two ZBOOKNOTE rows.
 * The first row's ZNOTES bplist contains a LinkNote key pointing to the second.
 */
export function getLinkUuids(
	notesBlob: Uint8Array | null,
	selfNoteId: string
): string[] {
	if (!notesBlob || notesBlob.length === 0) return [];

	try {
		const bplistParser = require("bplist-parser");
		const parsed = bplistParser.parseBuffer(Buffer.from(notesBlob));
		if (!parsed || !parsed[0]) return [];

		const objects: unknown[] = parsed[0]["$objects"] ?? [];
		if (!objects.includes("LinkNote")) return [];

		return objects.filter(
			(o): o is string =>
				typeof o === "string" &&
				o.length === 36 &&
				o.split("-").length === 5 &&
				o !== selfNoteId
		);
	} catch {
		return [];
	}
}

// ===================================================================
// Text resolution with priority logic
// ===================================================================

/**
 * Get the body text for a node, following MarginNote text priority:
 * 1. ZNOTES_TEXT (user-merged card text, authoritative)
 * 2. ZHIGHLIGHT_TEXT + LinkNote concatenation (cross-page highlights)
 * 3. ZHIGHLIGHT_TEXT alone (single-page highlights)
 */
export function getBodyText(nodeId: string, nodes: NodeMap): string | null {
	const nd = nodes.get(nodeId);
	if (!nd) return null;

	// Priority 1: ZNOTES_TEXT
	if (nd.notesText) {
		return nd.notesText
			.replace(/\n\n/g, " <br> ")
			.replace(/\n/g, " ");
	}

	// Priority 2 & 3: Highlight text (with optional LinkNote concatenation)
	if (nd.highlight) {
		let full = nd.highlight;
		const linkedIds = getLinkUuids(nd.notesBlob, nodeId);
		for (const uid of linkedIds) {
			const linked = nodes.get(uid);
			if (linked?.highlight) {
				full += linked.highlight; // No separator — continuous text split across pages
			}
		}
		// If title exists and body is same as title, no body needed
		if (nd.title && full === nd.title) return null;
		return full.replace(/\n/g, " ");
	}

	return null;
}

// ===================================================================
// Sub-mind-map detection
// ===================================================================

export interface SubMindMapInfo {
	/** Set of sub-mind-map root IDs */
	roots: Set<string>;
	/** root ID → display label */
	labels: SubMindMapLabels;
	/** root ID → sanitized filename */
	files: SubMindMapFiles;
	/** WRAPPER root ID → actual content node ID */
	wrappers: WrapperMap;
	/** Leaf node ID → sub-mind-map root ID it refers to */
	portals: PortalMap;
}

/**
 * Detect sub-mind-maps, unwrap WRAPPERs, find Portals.
 * Direct port of Python lines 98-143.
 */
export function detectSubMindMaps(
	nodes: NodeMap,
	children: ChildrenMap,
	allChildren: AllChildrenSet
): SubMindMapInfo {
	const roots = new Set<string>();
	const labels: SubMindMapLabels = new Map();
	const wrappers: WrapperMap = new Map();

	// Collect all sub-mind-map root IDs
	for (const [, nd] of nodes) {
		if (nd.childMapNoteId) {
			roots.add(nd.childMapNoteId);
		}
	}

	// Resolve labels, detect WRAPPERs
	for (const rid of roots) {
		const nd = nodes.get(rid);
		if (!nd) {
			labels.set(rid, `子脑图_${rid.substring(0, 8)}`);
			continue;
		}

		const ch = children.get(rid) || [];
		// WRAPPER: empty root with exactly one child
		if (!nd.title && !nd.highlight && ch.length === 1) {
			const childNode = nodes.get(ch[0]);
			labels.set(
				rid,
				(
					childNode?.title ||
					childNode?.highlight ||
					`子脑图_${rid.substring(0, 8)}`
				).substring(0, 40)
			);
			wrappers.set(rid, ch[0]);
		} else {
			labels.set(
				rid,
				(nd.title || nd.highlight || `子脑图_${rid.substring(0, 8)}`).substring(
					0,
					40
				)
			);
		}
	}

	// Clean labels: strip "X中的" prefix for filenames
	const files: SubMindMapFiles = new Map();
	for (const rid of roots) {
		const label = labels.get(rid) || "";
		const cleaned = cleanLabelForFilename(label);
		files.set(rid, sanitizeFilename(cleaned));
	}

	// Portal detection: leaf nodes whose label matches a sub-mind-map label
	const labelToRoot = new Map<string, string>();
	for (const rid of roots) {
		const l = (labels.get(rid) || "").trim();
		if (l && !l.startsWith("子脑图_")) {
			labelToRoot.set(l, rid);
		}
	}

	const wrapperContentNodes = new Set(wrappers.values());
	const portals: PortalMap = new Map();

	for (const [nid, nd] of nodes) {
		if (roots.has(nid) || wrapperContentNodes.has(nid) || children.has(nid)) {
			continue;
		}
		const nodeLabel = (nd.title || nd.highlight).trim();
		if (!nodeLabel) continue;

		// Direct label match
		if (labelToRoot.has(nodeLabel)) {
			portals.set(nid, labelToRoot.get(nodeLabel)!);
			continue;
		}
		// "X中的Y" pattern
		const m1 = nodeLabel.match(/中的(.+)$/);
		if (m1 && labelToRoot.has(m1[1])) {
			portals.set(nid, labelToRoot.get(m1[1])!);
			continue;
		}
		// "X和Y" pattern
		const m2 = nodeLabel.match(/和(.+)$/);
		if (m2 && labelToRoot.has(m2[1])) {
			portals.set(nid, labelToRoot.get(m2[1])!);
		}
	}

	return { roots, labels, files, wrappers, portals };
}

// ===================================================================
// Find root node of the main mind map
// ===================================================================

/**
 * Find the root node of the main mind map.
 * Strategy: nodes that are parents (in children map) but never referenced
 * as children; exclude sub-mind-map roots. If multiple remain, pick
 * the one whose title best matches the topic title.
 */
export function findMainRoot(
	nodes: NodeMap,
	children: ChildrenMap,
	allChildren: AllChildrenSet,
	subRoots: Set<string>,
	topicTitle: string
): { rootId: string; orphans: string[] } {
	// Tree roots: nodes that have children but are never a child
	const treeRoots: string[] = [];
	for (const nid of children.keys()) {
		if (!allChildren.has(nid)) {
			treeRoots.push(nid);
		}
	}

	// Separate main root candidates from sub-mind-map roots
	const candidates = treeRoots.filter((r) => !subRoots.has(r));

	if (candidates.length === 0) {
		throw new Error("No root node found for the mind map");
	}

	// Try to match topic title
	let rootId = candidates[0];
	for (const cid of candidates) {
		const nd = nodes.get(cid);
		if (nd?.title && topicTitle.includes(nd.title)) {
			rootId = cid;
			break;
		}
		if (nd?.title && nd.title.includes(topicTitle)) {
			rootId = cid;
			break;
		}
	}

	const orphans = candidates.filter((r) => r !== rootId);
	return { rootId, orphans };
}

// ===================================================================
// Filename helpers
// ===================================================================

/** Strip "X中的" prefix for cleaner filenames */
export function cleanLabelForFilename(label: string): string {
	const m = label.match(/.+中的(.+)$/);
	return m ? m[1] : label;
}

/** Remove illegal filename characters */
export function sanitizeFilename(label: string): string {
	let cleaned = label;
	for (const c of '<>:"\\/|?*：\u201c\u201d') {
		cleaned = cleaned.replaceAll(c, "");
	}
	return cleaned.substring(0, 30).trim() || "未命名";
}

/** Extract plain title from HTML heading content */
export function extractSectionTitle(htmlText: string): string {
	// Try 📌 prefix first
	const m1 = htmlText.match(/📌\s*([^<]+)/);
	if (m1) return m1[1].trim();

	// Get first text between > and < tags
	const m2 = htmlText.match(/>([^<]+)</);
	if (m2 && m2[1].trim()) return m2[1].trim();

	// Fallback: strip all HTML
	const clean = htmlText.replace(/<[^>]+>/g, "");
	return clean.trim().substring(0, 30);
}
