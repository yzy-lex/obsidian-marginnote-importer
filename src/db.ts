/** SQLite database reader using sql.js (WASM) */
import type { Database as SqlJsDatabase } from "sql.js";
import type { NoteRow, TopicRow } from "./types";

// sql.js must be loaded dynamically since it needs WASM initialization
let initSqlJs: typeof import("sql.js").default;

/**
 * Open the MarginNote SQLite database.
 * Uses Node.js fs to read the file (works only on Desktop Obsidian).
 */
export async function openDatabase(
	dbPath: string,
	pluginDir: string
): Promise<SqlJsDatabase> {
	// Dynamic imports for Node.js modules (external in esbuild)
	const fs = require("fs") as typeof import("fs");
	const path = require("path") as typeof import("path");

	// Load sql.js with bundled WASM
	if (!initSqlJs) {
		initSqlJs = require("sql.js");
	}
	const wasmPath = path.join(pluginDir, "sql-wasm.wasm");
	const wasmBinary = fs.readFileSync(wasmPath);
	const SQL = await initSqlJs({ wasmBinary });

	// Resolve ~ in path
	const resolvedPath = dbPath.replace(
		/^~/,
		process.env.HOME || "/Users/unknown"
	);
	const fileBuffer = fs.readFileSync(resolvedPath);
	return new SQL.Database(new Uint8Array(fileBuffer));
}

/** Query all study sets (topics) from the database */
export function queryTopics(db: SqlJsDatabase): TopicRow[] {
	const results: TopicRow[] = [];
	// MN4 stores literal "(null)" for auto-created empty topics;
	// exclude soft-deleted topics and per-document topics (no ZBOOKLIST)
	const stmt = db.prepare(
		`SELECT ZTOPICID, ZTITLE FROM ZTOPIC
		 WHERE ZTITLE IS NOT NULL
		   AND ZTITLE != '(null)'
		   AND ZTOPICID NOT LIKE 'DELETED_%'
		   AND ZBOOKLIST IS NOT NULL AND ZBOOKLIST != ''
		 ORDER BY ZLASTVISIT DESC`
	);
	while (stmt.step()) {
		const row = stmt.getAsObject();
		results.push({
			topicId: String(row.ZTOPICID),
			title: String(row.ZTITLE),
		});
	}
	stmt.free();
	return results;
}

/** Query all notes for a given topic (study set) */
export function queryNotes(db: SqlJsDatabase, topicId: string): NoteRow[] {
	const results: NoteRow[] = [];
	const stmt = db.prepare(`
		SELECT ZNOTEID, ZMINDLINKS, ZNOTETITLE, ZHIGHLIGHT_TEXT,
		       ZCHILDMAPNOTEID, ZNOTES_TEXT, ZNOTES
		FROM ZBOOKNOTE WHERE ZTOPICID = ?
	`);
	stmt.bind([topicId]);
	while (stmt.step()) {
		const row = stmt.getAsObject();
		results.push({
			noteId: String(row.ZNOTEID),
			mindLinks: row.ZMINDLINKS ? String(row.ZMINDLINKS) : null,
			noteTitle: row.ZNOTETITLE ? String(row.ZNOTETITLE) : null,
			highlightText: row.ZHIGHLIGHT_TEXT
				? String(row.ZHIGHLIGHT_TEXT)
				: null,
			childMapNoteId: row.ZCHILDMAPNOTEID
				? String(row.ZCHILDMAPNOTEID)
				: null,
			notesText: row.ZNOTES_TEXT ? String(row.ZNOTES_TEXT) : null,
			notesBlob: row.ZNOTES ? (row.ZNOTES as Uint8Array) : null,
		});
	}
	stmt.free();
	return results;
}
