/**
 * Generator: produces MarkMind-compatible .md files from parsed tree data.
 * Implements the 3-pass architecture:
 *   Pass 1: flat generation of all .md content in memory
 *   Pass 2: wikilink analysis to discover folder hierarchy
 *   Pass 3: compute final paths, update wikilinks
 *
 * Direct port of mn_to_markmind.py PASS 1-3.
 */
import * as crypto from "crypto";
import type {
	NodeMap,
	ChildrenMap,
	SubMindMapLabels,
	SubMindMapFiles,
	WrapperMap,
	PortalMap,
	ImporterSettings,
} from "./types";
import { getBodyText, extractSectionTitle, sanitizeFilename } from "./parser";

// ===================================================================
// MarkMind frontmatter (blank lines around fields are REQUIRED)
// ===================================================================

const FRONTMATTER = `---

mindmap-plugin: basic

mindmap-layout: mindmap6
---
`;

// ===================================================================
// Heading / node content helpers
// ===================================================================

/** Generate MarginNote deep link */
function mnLink(noteId: string, topicId: string): string {
	return (
		`<style>a{text-decoration:none;font-weight:bolder}</style>` +
		`<div><a href="marginnote4app://note/${noteId}/${topicId}">📖 Open in MN</a></div>`
	);
}

/** Generate block ID from note ID (for fold state tracking) */
function makeBlockId(noteId: string): string {
	const h = crypto.createHash("md5").update(noteId).digest("hex");
	return `^${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}`;
}

/** Build heading content for a single node */
function makeHeading(
	noteId: string,
	topicId: string,
	nodes: NodeMap,
	maxWidth: number,
	depth: number,
	foldDepth: number
): string {
	const nd = nodes.get(noteId);
	if (!nd) return "?";

	const body = getBodyText(noteId, nodes);
	const link = mnLink(noteId, topicId);

	let content: string;
	if (nd.title) {
		content = body
			? `<div style="max-width:${maxWidth}px">📌 ${nd.title} <br> ${body} ${link}</div>`
			: `<div style="max-width:${maxWidth}px">📌 ${nd.title} ${link}</div>`;
	} else {
		content = body
			? `<div style="max-width:${maxWidth}px">${body} ${link}</div>`
			: `<div style="max-width:${maxWidth}px">? ${link}</div>`;
	}

	if (depth >= foldDepth) {
		content += ` ${makeBlockId(noteId)}`;
	}

	return content;
}

// ===================================================================
// Pass 1: Generate all .md content in memory (flat structure)
// ===================================================================

export interface GeneratedFiles {
	/** filename (without .md) → content */
	files: Map<string, string>;
	/** The main mind map filename (without .md) */
	mainFile: string;
}

/**
 * Recursively write nodes into a markdown string.
 * Port of Python's wn() function.
 */
function writeNode(
	lines: string[],
	noteId: string,
	depth: number,
	visited: Set<string>,
	counter: { value: number },
	topicId: string,
	nodes: NodeMap,
	children: ChildrenMap,
	subRoots: Set<string>,
	subRelFlat: Map<string, string>,
	subLabels: SubMindMapLabels,
	wrappers: WrapperMap,
	portals: PortalMap,
	settings: ImporterSettings
): void {
	if (visited.has(noteId) || depth > 6 || counter.value > 300) return;
	visited.add(noteId);

	const h = "#".repeat(Math.min(depth, 6));

	// Sub-mind-map reference
	if (subRoots.has(noteId) && depth > 1) {
		const rel = subRelFlat.get(noteId) || noteId;
		const label = subLabels.get(noteId) || noteId;
		lines.push(`\n${h} 📂 [[${rel}|${label}]]\n`);
		return;
	}

	// Portal reference
	if (portals.has(noteId) && depth > 1) {
		const rootId = portals.get(noteId)!;
		const rel = subRelFlat.get(rootId) || rootId;
		const label = subLabels.get(rootId) || rootId;
		lines.push(`\n${h} 📂 [[${rel}|${label}]]\n`);
		return;
	}

	// WRAPPER node: unwrap and use the actual content node
	if (wrappers.has(noteId)) {
		const actualId = wrappers.get(noteId)!;
		if (visited.has(actualId)) return;
		const heading = makeHeading(
			actualId,
			topicId,
			nodes,
			settings.maxWidth,
			depth,
			settings.foldDepth
		);
		lines.push(`\n${h} ${heading}\n`);
		visited.add(actualId);
		for (const childId of children.get(actualId) || []) {
			writeNode(
				lines,
				childId,
				depth + 1,
				visited,
				{ value: counter.value + 1 },
				topicId,
				nodes,
				children,
				subRoots,
				subRelFlat,
				subLabels,
				wrappers,
				portals,
				settings
			);
		}
		return;
	}

	// Regular node
	const heading = makeHeading(
		noteId,
		topicId,
		nodes,
		settings.maxWidth,
		depth,
		settings.foldDepth
	);
	lines.push(`\n${h} ${heading}\n`);
	for (const childId of children.get(noteId) || []) {
		writeNode(
			lines,
			childId,
			depth + 1,
			visited,
			{ value: counter.value + 1 },
			topicId,
			nodes,
			children,
			subRoots,
			subRelFlat,
			subLabels,
			wrappers,
			portals,
			settings
		);
	}
}

export function generatePass1(
	rootId: string,
	orphans: string[],
	topicTitle: string,
	topicId: string,
	nodes: NodeMap,
	children: ChildrenMap,
	subRoots: Set<string>,
	subLabels: SubMindMapLabels,
	subFiles: SubMindMapFiles,
	wrappers: WrapperMap,
	portals: PortalMap,
	settings: ImporterSettings
): GeneratedFiles {
	const outputFolder = settings.outputFolder;

	// Build flat sub-mind-map relative paths
	const subRelFlat = new Map<string, string>();
	for (const rid of subRoots) {
		const fn = subFiles.get(rid) || rid;
		subRelFlat.set(rid, `${outputFolder}/${fn}`);
	}

	const files = new Map<string, string>();

	// --- Main mind map ---
	const mainName = sanitizeFilename(topicTitle) + "脑图";
	const mainLines: string[] = [FRONTMATTER, `\n# ${topicTitle}\n`];
	const mainVisited = new Set([rootId]);

	for (const childId of children.get(rootId) || []) {
		writeNode(
			mainLines,
			childId,
			2,
			mainVisited,
			{ value: 0 },
			topicId,
			nodes,
			children,
			subRoots,
			subRelFlat,
			subLabels,
			wrappers,
			portals,
			settings
		);
	}

	if (orphans.length > 0) {
		mainLines.push("\n## 其他主题\n");
		for (const oid of orphans) {
			writeNode(
				mainLines,
				oid,
				3,
				mainVisited,
				{ value: 0 },
				topicId,
				nodes,
				children,
				subRoots,
				subRelFlat,
				subLabels,
				wrappers,
				portals,
				settings
			);
		}
	}
	files.set(mainName, mainLines.join(""));

	// --- Sub-mind-maps ---
	for (const rid of subRoots) {
		const fn = subFiles.get(rid) || rid;
		const subLines: string[] = [FRONTMATTER];
		const subVisited = new Set<string>();

		if (wrappers.has(rid)) {
			const actualId = wrappers.get(rid)!;
			const heading = makeHeading(
				actualId,
				topicId,
				nodes,
				settings.maxWidth,
				1,
				settings.foldDepth
			);
			subLines.push(`\n# ${heading}\n`);
			subVisited.add(rid);
			subVisited.add(actualId);
			for (const childId of children.get(actualId) || []) {
				writeNode(
					subLines,
					childId,
					2,
					subVisited,
					{ value: 0 },
					topicId,
					nodes,
					children,
					subRoots,
					subRelFlat,
					subLabels,
					wrappers,
					portals,
					settings
				);
			}
		} else {
			const heading = makeHeading(
				rid,
				topicId,
				nodes,
				settings.maxWidth,
				1,
				settings.foldDepth
			);
			subLines.push(`\n# ${heading}\n`);
			subVisited.add(rid);
			for (const childId of children.get(rid) || []) {
				writeNode(
					subLines,
					childId,
					2,
					subVisited,
					{ value: 0 },
					topicId,
					nodes,
					children,
					subRoots,
					subRelFlat,
					subLabels,
					wrappers,
					portals,
					settings
				);
			}
		}

		files.set(`${outputFolder}/${fn}`, subLines.join(""));
	}

	return { files, mainFile: mainName };
}

// ===================================================================
// Pass 2: Analyze wikilinks to discover folder hierarchy
// ===================================================================

export interface HierarchyInfo {
	/** child filename → parent filename */
	parentOf: Map<string, string>;
	/** child filename → section folder name */
	sectionOf: Map<string, string>;
}

export function analyzeHierarchy(
	files: Map<string, string>,
	mainFile: string,
	subFiles: SubMindMapFiles,
	outputFolder: string,
	manualNesting: Record<string, string>,
	subLabels: SubMindMapLabels
): HierarchyInfo {
	const linkRe = /📂 \[\[([^/]+)\/([^|]+)\|([^\]]+)\]\]/g;
	const parentOf = new Map<string, string>();
	const sectionOf = new Map<string, string>();

	// Collect all sub-mind-map filenames
	const allSubFilenames = new Set<string>();
	for (const fn of subFiles.values()) {
		allSubFilenames.add(fn);
	}

	// 2a: Sub-mind-map nesting (if A.md contains 📂 [[folder/B|...]], B is child of A)
	for (const [rid] of subFiles) {
		const fn = subFiles.get(rid)!;
		const content = files.get(`${outputFolder}/${fn}`);
		if (!content) continue;

		let match;
		const re = new RegExp(linkRe.source, "g");
		while ((match = re.exec(content)) !== null) {
			const linkedFn = match[2];
			if (
				allSubFilenames.has(linkedFn) &&
				linkedFn !== fn &&
				!parentOf.has(linkedFn)
			) {
				parentOf.set(linkedFn, fn);
			}
		}
	}

	// 2b: Section grouping from main mind map
	const mainContent = files.get(mainFile);
	if (mainContent) {
		let currentSection: string | null = null;
		for (const line of mainContent.split("\n")) {
			const headingMatch = line.match(/^## (.+)$/);
			if (headingMatch) {
				const text = headingMatch[1].trim();
				if (!text.includes("📂") && !text.includes("[[")) {
					const title = extractSectionTitle(text);
					if (title) {
						currentSection = sanitizeFilename(title);
					}
				}
			}

			const re = new RegExp(linkRe.source, "g");
			const linkMatch = re.exec(line);
			if (linkMatch && currentSection) {
				const linkedFn = linkMatch[2];
				if (allSubFilenames.has(linkedFn) && !parentOf.has(linkedFn)) {
					sectionOf.set(linkedFn, currentSection);
				}
			}
		}
	}

	// Apply manual nesting
	for (const [childSubstr, parentSubstr] of Object.entries(manualNesting)) {
		let childFn: string | null = null;
		let parentFn: string | null = null;
		for (const [rid] of subFiles) {
			const label = subLabels.get(rid) || "";
			const fn = subFiles.get(rid)!;
			if (label.includes(childSubstr)) childFn = fn;
			if (label.includes(parentSubstr) && !label.includes(childSubstr))
				parentFn = fn;
		}
		if (childFn && parentFn && !parentOf.has(childFn)) {
			parentOf.set(childFn, parentFn);
		}
	}

	return { parentOf, sectionOf };
}

// ===================================================================
// Pass 3: Compute final paths and update wikilinks
// ===================================================================

/** Compute the final nested path for a sub-mind-map file */
function getFinalPath(
	fn: string,
	parentOf: Map<string, string>,
	sectionOf: Map<string, string>,
	outputFolder: string,
	visited: Set<string> = new Set()
): string {
	if (visited.has(fn)) return `${outputFolder}/${fn}`; // cycle guard
	visited.add(fn);

	if (parentOf.has(fn)) {
		const parent = parentOf.get(fn)!;
		const parentPath = getFinalPath(
			parent,
			parentOf,
			sectionOf,
			outputFolder,
			visited
		);
		// Extract directory from parent path, then add parent as subfolder
		const parentDir = parentPath.substring(
			0,
			parentPath.lastIndexOf("/")
		);
		return `${parentDir}/${parent}/${fn}`;
	}

	if (sectionOf.has(fn)) {
		return `${outputFolder}/${sectionOf.get(fn)}/${fn}`;
	}

	return `${outputFolder}/${fn}`;
}

/**
 * Reorganize files: compute final paths, update wikilinks, return final file map.
 */
export function reorganizeFiles(
	files: Map<string, string>,
	subFiles: SubMindMapFiles,
	hierarchy: HierarchyInfo,
	outputFolder: string
): Map<string, string> {
	const { parentOf, sectionOf } = hierarchy;

	// Compute final paths for all sub-mind-maps
	const finalPaths = new Map<string, string>();
	for (const fn of subFiles.values()) {
		finalPaths.set(fn, getFinalPath(fn, parentOf, sectionOf, outputFolder));
	}

	// Build old→new path mapping
	const oldToNew = new Map<string, string>();
	for (const [fn, newPath] of finalPaths) {
		const oldPath = `${outputFolder}/${fn}`;
		if (oldPath !== newPath) {
			oldToNew.set(oldPath, newPath);
		}
	}

	// Update wikilinks in all files and remap file keys
	const result = new Map<string, string>();
	for (const [key, content] of files) {
		let updatedContent = content;
		for (const [oldPath, newPath] of oldToNew) {
			updatedContent = updatedContent.replaceAll(
				`[[${oldPath}|`,
				`[[${newPath}|`
			);
		}

		// Remap the file key if it's a sub-mind-map
		const baseName = key.startsWith(`${outputFolder}/`)
			? key.substring(outputFolder.length + 1)
			: null;
		if (baseName && finalPaths.has(baseName)) {
			result.set(finalPaths.get(baseName)!, updatedContent);
		} else {
			result.set(key, updatedContent);
		}
	}

	return result;
}
