import type {CitationAnnotation} from './types';

export interface CitationSource {
  number: number;
  url: string;
  title: string;
}

export interface CitedMarkdown {
  markdown: string;
  sources: CitationSource[];
}

const CITATION_SCHEME = 'morechat-citation:';

export const isCitationHref = (href: string | undefined): boolean =>
  typeof href === 'string' && href.startsWith(CITATION_SCHEME);

export const citationNumberFromHref = (href: string): string =>
  href.slice(CITATION_SCHEME.length);

/**
 * DeepSeek reports citation offsets as Unicode code points, while JS strings
 * are indexed by UTF-16 code units. Convert one to the other.
 */
export function codePointIndexToCodeUnitIndex(
  text: string,
  codePointIndex: number,
): number {
  if (codePointIndex <= 0) {
    return 0;
  }
  let codeUnits = 0;
  let codePoints = 0;
  for (const char of text) {
    if (codePoints >= codePointIndex) {
      break;
    }
    codeUnits += char.length;
    codePoints += 1;
  }
  return codeUnits;
}

/** Ordered, de-duplicated sources without injecting markers. */
export function extractCitationSources(
  annotations: CitationAnnotation[] | undefined,
): CitationSource[] {
  if (!annotations || annotations.length === 0) {
    return [];
  }
  const sources: CitationSource[] = [];
  const seen = new Set<string>();
  const sorted = annotations
    .filter(annotation => annotation?.url_citation?.url)
    .slice()
    .sort((a, b) => a.url_citation.end_index - b.url_citation.end_index);
  for (const annotation of sorted) {
    const {url, title} = annotation.url_citation;
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    sources.push({number: sources.length + 1, url, title: title || url});
  }
  return sources;
}

/**
 * Injects superscript citation markers into the markdown source so the
 * renderer can turn them into tappable references.
 */
export function buildCitedMarkdown(
  content: string,
  annotations: CitationAnnotation[] | undefined,
): CitedMarkdown {
  if (!content || !annotations || annotations.length === 0) {
    return {markdown: content, sources: []};
  }

  const sources: CitationSource[] = [];
  const numberByUrl = new Map<string, number>();
  const markersByPosition = new Map<number, number[]>();

  const valid = annotations
    .filter(
      annotation =>
        annotation?.type === 'url_citation' && annotation.url_citation?.url,
    )
    .slice()
    .sort((a, b) => a.url_citation.end_index - b.url_citation.end_index);

  for (const annotation of valid) {
    const {url, title, end_index} = annotation.url_citation;
    let number = numberByUrl.get(url);
    if (!number) {
      number = sources.length + 1;
      numberByUrl.set(url, number);
      sources.push({number, url, title: title || url});
    }

    const position = codePointIndexToCodeUnitIndex(content, end_index);
    const existing = markersByPosition.get(position) ?? [];
    if (!existing.includes(number)) {
      existing.push(number);
      markersByPosition.set(position, existing);
    }
  }

  let markdown = content;
  const positions = Array.from(markersByPosition.keys()).sort((a, b) => b - a);
  for (const position of positions) {
    const numbers = (markersByPosition.get(position) ?? []).sort(
      (a, b) => a - b,
    );
    const marker = numbers
      .map(number => `[${number}](${CITATION_SCHEME}${number})`)
      .join('');
    markdown = markdown.slice(0, position) + marker + markdown.slice(position);
  }

  return {markdown, sources};
}
