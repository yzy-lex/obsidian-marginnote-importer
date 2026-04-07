/**
 * MarginNote Importer — Obsidian Plugin Entry Point
 *
 * Import MarginNote 4 study set mind maps into Obsidian
 * as MarkMind-compatible markdown files.
 */
import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type ImporterSettings } from "./types";
import { openDatabase, queryTopics, queryNotes } from "./db";
import {
	buildTree,
	detectSubMindMaps,
	findMainRoot,
} from "./parser";
import {
	generatePass1,
	analyzeHierarchy,
	reorganizeFiles,
} from "./generator";
import { TopicModal } from "./topic-modal";
import { ImporterSettingTab } from "./settings";

export default class MarginNoteImporterPlugin extends Plugin {
	settings: ImporterSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register command
		this.addCommand({
			id: "import-mindmap",
			name: "从 MarginNote 导入脑图",
			callback: () => this.runImport(),
		});

		// Register ribbon icon
		this.addRibbonIcon("brain", "MarginNote 导入", () => this.runImport());

		// Register settings tab
		this.addSettingTab(new ImporterSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Get the absolute path to this plugin's directory */
	private getPluginDir(): string {
		const vaultPath = (
			this.app.vault.adapter as { getBasePath(): string }
		).getBasePath();
		return `${vaultPath}/.obsidian/plugins/${this.manifest.id}`;
	}

	/** Main import flow */
	private async runImport(): Promise<void> {
		const notice = new Notice("正在连接 MarginNote 数据库...", 0);

		try {
			// 1. Open database
			const pluginDir = this.getPluginDir();
			const db = await openDatabase(this.settings.dbPath, pluginDir);

			// 2. Query topics
			const topics = queryTopics(db);
			if (topics.length === 0) {
				notice.hide();
				new Notice("未找到任何学习集");
				db.close();
				return;
			}

			notice.hide();

			// 3. Let user pick a topic
			new TopicModal(this.app, topics, async (topic) => {
				const importNotice = new Notice(
					`正在导入「${topic.title}」...`,
					0
				);

				try {
					// Save last used topic ID
					this.settings.lastTopicId = topic.topicId;
					await this.saveSettings();

					// 4. Query notes for selected topic
					const rows = queryNotes(db, topic.topicId);
					if (rows.length === 0) {
						importNotice.hide();
						new Notice("该学习集没有笔记");
						db.close();
						return;
					}

					// 5. Build tree
					const { nodes, children, allChildren } = buildTree(rows);

					// 6. Detect sub-mind-maps
					const subInfo = detectSubMindMaps(
						nodes,
						children,
						allChildren
					);

					// 7. Find root node
					const { rootId, orphans } = findMainRoot(
						nodes,
						children,
						allChildren,
						subInfo.roots,
						topic.title
					);

					// 8. Pass 1: Generate flat .md content
					const generated = generatePass1(
						rootId,
						orphans,
						topic.title,
						topic.topicId,
						nodes,
						children,
						subInfo.roots,
						subInfo.labels,
						subInfo.files,
						subInfo.wrappers,
						subInfo.portals,
						this.settings
					);

					// 9. Pass 2: Analyze hierarchy
					const hierarchy = analyzeHierarchy(
						generated.files,
						generated.mainFile,
						subInfo.files,
						this.settings.outputFolder,
						this.settings.manualNesting,
						subInfo.labels
					);

					// 10. Pass 3: Reorganize
					const finalFiles = reorganizeFiles(
						generated.files,
						subInfo.files,
						hierarchy,
						this.settings.outputFolder
					);

					// 11. Write files to vault
					let created = 0;
					let updated = 0;
					for (const [filePath, content] of finalFiles) {
						const fullPath = `${filePath}.md`;
						const existing =
							this.app.vault.getAbstractFileByPath(fullPath);
						if (existing) {
							await this.app.vault.modify(
								existing as import("obsidian").TFile,
								content
							);
							updated++;
						} else {
							// Ensure parent folders exist
							const dir = fullPath.substring(
								0,
								fullPath.lastIndexOf("/")
							);
							if (dir) {
								await this.ensureFolder(dir);
							}
							await this.app.vault.create(fullPath, content);
							created++;
						}
					}

					db.close();
					importNotice.hide();
					new Notice(
						`✅ 导入完成！新建 ${created} 个文件，更新 ${updated} 个文件`,
						5000
					);
				} catch (err) {
					db.close();
					importNotice.hide();
					console.error("MarginNote Importer error:", err);
					new Notice(
						`❌ 导入失败: ${err instanceof Error ? err.message : String(err)}`,
						8000
					);
				}
			}).open();
		} catch (err) {
			notice.hide();
			console.error("MarginNote Importer error:", err);
			new Notice(
				`❌ 无法打开数据库: ${err instanceof Error ? err.message : String(err)}`,
				8000
			);
		}
	}

	/** Recursively ensure a folder path exists in the vault */
	private async ensureFolder(folderPath: string): Promise<void> {
		const parts = folderPath.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}
