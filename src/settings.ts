/** Settings tab for MarginNote Importer */
import { App, PluginSettingTab, Setting } from "obsidian";
import type MarginNoteImporterPlugin from "./main";
import type { ImporterSettings } from "./types";

export class ImporterSettingTab extends PluginSettingTab {
	plugin: MarginNoteImporterPlugin;

	constructor(app: App, plugin: MarginNoteImporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "MarginNote Importer 设置" });

		// --- Database path ---
		new Setting(containerEl)
			.setName("MarginNote 数据库路径")
			.setDesc("MarginNotes.sqlite 文件的完整路径（支持 ~ 前缀）")
			.addText((text) =>
				text
					.setPlaceholder("~/Library/Containers/...")
					.setValue(this.plugin.settings.dbPath)
					.onChange(async (value) => {
						this.plugin.settings.dbPath = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Output folder ---
		new Setting(containerEl)
			.setName("输出目录")
			.setDesc("子脑图文件将放在 vault 根目录下的此文件夹中")
			.addText((text) =>
				text
					.setPlaceholder("脑图")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Max width ---
		new Setting(containerEl)
			.setName("节点最大宽度 (px)")
			.setDesc("MarkMind 节点内容的 max-width CSS 值")
			.addText((text) =>
				text
					.setPlaceholder("300")
					.setValue(String(this.plugin.settings.maxWidth))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.maxWidth = n;
							await this.plugin.saveSettings();
						}
					})
			);

		// --- Fold depth ---
		new Setting(containerEl)
			.setName("Block ID 起始深度")
			.setDesc("≥ 此深度的 heading 会添加 Obsidian block ID")
			.addText((text) =>
				text
					.setPlaceholder("3")
					.setValue(String(this.plugin.settings.foldDepth))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.foldDepth = n;
							await this.plugin.saveSettings();
						}
					})
			);

		// --- Manual nesting ---
		containerEl.createEl("h3", { text: "手动嵌套映射" });
		containerEl.createEl("p", {
			text: "当 wikilink 分析无法检测子脑图的父子关系时，在此手动指定。每行一条，格式：子标签 → 父标签",
			cls: "setting-item-description",
		});

		const nestingArea = containerEl.createEl("textarea", {
			cls: "marginnote-importer-nesting-area",
		});
		nestingArea.style.width = "100%";
		nestingArea.style.minHeight = "100px";
		nestingArea.style.fontFamily = "var(--font-monospace)";
		nestingArea.value = this.serializeNesting(
			this.plugin.settings.manualNesting
		);

		nestingArea.addEventListener("change", async () => {
			this.plugin.settings.manualNesting = this.parseNesting(
				nestingArea.value
			);
			await this.plugin.saveSettings();
		});
	}

	private serializeNesting(nesting: Record<string, string>): string {
		return Object.entries(nesting)
			.map(([child, parent]) => `${child} → ${parent}`)
			.join("\n");
	}

	private parseNesting(text: string): Record<string, string> {
		const result: Record<string, string> = {};
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			// Support both → and ->
			const sep = trimmed.includes("→") ? "→" : "->";
			const parts = trimmed.split(sep);
			if (parts.length === 2) {
				const child = parts[0].trim();
				const parent = parts[1].trim();
				if (child && parent) {
					result[child] = parent;
				}
			}
		}
		return result;
	}
}
