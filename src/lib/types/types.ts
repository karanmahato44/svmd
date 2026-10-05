import type { getSourcePage } from "../markdown/pagination";

export type RenderRequest = {
	type: "RENDER";
	id: number;
	page: ReturnType<typeof getSourcePage>;
};

export type RenderResponse =
	| {
			type: "RESULT";
			id: number;
			html: string;
			page: number;
			pageCount: number;
			largeDocument: boolean;
			simplified: boolean;
	  }
	| {
			type: "ERROR";
			id: number;
			message: string;
	  };

export type WorkerMessage = RenderRequest;
export type MainMessage = RenderResponse;
