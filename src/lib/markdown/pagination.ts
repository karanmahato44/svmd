// Bound both textarea layout and preview work without discarding the document.
export const SOURCE_PAGE_SIZE = 50_000;

export function getSourcePage(source: string, requestedPage = 0) {
	const pageCount = Math.max(1, Math.ceil(source.length / SOURCE_PAGE_SIZE));
	const page = Math.max(0, Math.min(pageCount - 1, Math.trunc(requestedPage) || 0));
	const boundary = (offset: number) => {
		const code = source.charCodeAt(offset);
		// Keep UTF-16 surrogate pairs together at either side of a page.
		return code >= 0xdc00 &&
			code <= 0xdfff &&
			offset > 0 &&
			source.charCodeAt(offset - 1) >= 0xd800 &&
			source.charCodeAt(offset - 1) <= 0xdbff
			? offset - 1
			: offset;
	};
	const start = boundary(page * SOURCE_PAGE_SIZE);
	const end = boundary(Math.min(source.length, (page + 1) * SOURCE_PAGE_SIZE));
	return { content: source.slice(start, end), start, end, page, pageCount };
}
