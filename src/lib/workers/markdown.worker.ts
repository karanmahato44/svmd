import { renderMarkdown } from "../markdown/render";
import type { MainMessage, WorkerMessage } from "../types/types";

let source = "";
// Serialize asynchronous grammar loading and retain each caller's request ID.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<WorkerMessage>): void => {
	const request = event.data;
	queue = queue.then(async () => {
		try {
			if (request.type === "RENDER") {
				source = request.content;
			}
			const result = await renderMarkdown(source, request.page ?? 0);
			self.postMessage({ type: "RESULT", id: request.id, ...result } satisfies MainMessage);
		} catch (error) {
			self.postMessage({ type: "ERROR", id: request.id, message: String(error) } satisfies MainMessage);
		}
	});
};
