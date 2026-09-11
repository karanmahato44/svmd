export type RenderRequest = {
	type: "RENDER";
	id: number;
	content: string;
	page?: number;
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

export type WorkerMessage = RenderRequest | { type: "PAGE"; id: number; page: number };
export type MainMessage = RenderResponse;
