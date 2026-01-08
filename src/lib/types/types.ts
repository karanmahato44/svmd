export type RenderRequest = {
	type: "RENDER";
	content: string;
};

export type RenderResponse =
	| {
			type: "RESULT";
			html: string;
	  }
	| {
			type: "ERROR";
			message: string;
	  };

export type WorkerMessage = RenderRequest;
export type MainMessage = RenderResponse;
