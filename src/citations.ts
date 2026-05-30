import type { RawMdCitation, Reference } from './types';

export interface ResolvedReferences {
  /** Unique references in first-appearance order. */
  references: Reference[];
  /** For each input citation index, its footnote name, or null if it has none. */
  nameByIndex: (string | null)[];
}

/** Friendly description for the reference list: preview_title || title. */
function friendlyLabel(c: RawMdCitation): string {
  return c.metadata?.preview_title || c.title || '';
}

/** Dedup key: the URL if present, else the (preview) title. Null if neither. */
function identityKey(c: RawMdCitation): string | null {
  if (typeof c.url === 'string' && c.url.length > 0) return `url:${c.url}`;
  const title = c.metadata?.preview_title || c.title;
  return title ? `title:${title}` : null;
}

/** Footnote name from the title slug (preview_title when title is absent). */
function baseName(c: RawMdCitation): string {
  const src = c.title || c.metadata?.preview_title || '';
  return src.trim().replace(/\s+/g, '_').replace(/[[\]]/g, '');
}

export function resolveReferences(
  mdCitations: RawMdCitation[] | undefined,
): ResolvedReferences {
  const references: Reference[] = [];
  const nameByIndex: (string | null)[] = [];
  const byIdentity = new Map<string, Reference>();
  const usedNames = new Set<string>();
  const list = Array.isArray(mdCitations) ? mdCitations : [];

  list.forEach((c, i) => {
    const key = c ? identityKey(c) : null;
    if (!key) {
      nameByIndex[i] = null;
      return;
    }

    const existing = byIdentity.get(key);
    if (existing) {
      nameByIndex[i] = existing.name;
      return;
    }

    // New reference -> assign a unique name.
    let name = baseName(c) || `ref-${references.length + 1}`;
    if (usedNames.has(name)) {
      let n = 2;
      while (usedNames.has(`${name}-${n}`)) n++;
      name = `${name}-${n}`;
    }
    usedNames.add(name);

    const ref: Reference = {
      name,
      label: friendlyLabel(c),
      url: typeof c.url === 'string' ? c.url : '',
    };
    byIdentity.set(key, ref);
    references.push(ref);
    nameByIndex[i] = name;
  });

  return { references, nameByIndex };
}
