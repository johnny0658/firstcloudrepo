/** In-browser PDF text extraction via pdfjs-dist (loaded lazily so the
 * ~400KB library stays out of the main bundle). Text-based PDFs only —
 * scanned documents yield almost no text and are rejected with a clear
 * message rather than sent to the LLM as junk. */

export const MAX_STATEMENT_CHARS = 60_000;
const MIN_READABLE_CHARS = 200;

/** Pages likely to contain the holdings table score higher. */
const HOLDINGS_KEYWORDS =
  /holdings|positions|portfolio|quantity|shares|units|market value|symbol|cusip|asset/gi;

export interface ExtractedPdf {
  text: string;
  pageCount: number;
  droppedPages: number[];
}

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  // Legacy build: transpiled + polyfilled (Promise.withResolvers, structuredClone,
  // etc.) for older Safari / iOS. The modern build assumes very recent engines and
  // throws an opaque "undefined is not a function" on those browsers.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let s = "";
    for (const item of content.items) {
      if (!("str" in item)) continue; // TextMarkedContent has no text
      s += item.str;
      s += item.hasEOL ? "\n" : " ";
    }
    pageTexts.push(s.replace(/[ \t]+\n/g, "\n"));
  }
  await loadingTask.destroy();

  const total = pageTexts.reduce((a, t) => a + t.length, 0);
  if (total < MIN_READABLE_CHARS) {
    throw new Error(
      "This looks like a scanned or image-based PDF — no readable text was found. " +
        "Download a text-based statement from your broker instead (OCR isn't supported).",
    );
  }
  return truncatePages(pageTexts);
}

/**
 * Keep everything if it fits; otherwise keep page 1 (statement date, broker,
 * cash summary) plus the pages most likely to hold the positions table.
 * Exported separately so it's unit-testable without pdfjs.
 */
export function truncatePages(
  pageTexts: string[],
  maxChars = MAX_STATEMENT_CHARS,
): ExtractedPdf {
  const total = pageTexts.reduce((a, t) => a + t.length, 0);
  if (total <= maxChars) {
    return {
      text: pageTexts.map((t, i) => `[page ${i + 1}]\n${t}`).join("\n\n"),
      pageCount: pageTexts.length,
      droppedPages: [],
    };
  }

  const scored = pageTexts.map((t, i) => ({
    index: i,
    score: i === 0 ? Number.POSITIVE_INFINITY : (t.match(HOLDINGS_KEYWORDS) ?? []).length,
  }));
  scored.sort((a, b) => b.score - a.score);

  const kept = new Set<number>();
  let used = 0;
  for (const { index } of scored) {
    const len = pageTexts[index].length;
    if (used + len > maxChars && kept.size > 0) continue;
    kept.add(index);
    used += len;
  }

  const keptSorted = [...kept].sort((a, b) => a - b);
  const dropped = pageTexts.map((_, i) => i + 1).filter((p) => !kept.has(p - 1));
  return {
    text: keptSorted.map((i) => `[page ${i + 1}]\n${pageTexts[i]}`).join("\n\n"),
    pageCount: pageTexts.length,
    droppedPages: dropped,
  };
}
