/** Topic selection modal — lets user pick a MarginNote study set */
import { SuggestModal, App } from "obsidian";
import type { TopicRow } from "./types";

export class TopicModal extends SuggestModal<TopicRow> {
	private topics: TopicRow[];
	private onChoose: (topic: TopicRow) => void;

	constructor(app: App, topics: TopicRow[], onChoose: (topic: TopicRow) => void) {
		super(app);
		this.topics = topics;
		this.onChoose = onChoose;
		this.setPlaceholder("选择要导入的学习集...");
	}

	getSuggestions(query: string): TopicRow[] {
		const lower = query.toLowerCase();
		return this.topics.filter(
			(t) =>
				t.title.toLowerCase().includes(lower) ||
				t.topicId.toLowerCase().includes(lower)
		);
	}

	renderSuggestion(topic: TopicRow, el: HTMLElement): void {
		el.createEl("div", { text: topic.title });
		el.createEl("small", {
			text: topic.topicId,
			cls: "marginnote-importer-topic-id",
		});
	}

	onChooseSuggestion(topic: TopicRow): void {
		this.onChoose(topic);
	}
}
