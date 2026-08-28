export const NARRATIVE_KINDS = new Set([
  "product",
  "architecture",
  "governance",
  "operational",
  "correction",
  "experiment",
]);

const REQUIRED_HEADINGS = [
  "Narrative Kind",
  "Narrative Context",
  "Narrative Decision",
  "Narrative Consequences",
];

function sections(body) {
  const headings = [...String(body || "").matchAll(/^## ([^\r\n]+)[ \t]*$/gm)];
  return new Map(REQUIRED_HEADINGS.map((heading) => [
    heading,
    headings
      .map((match, index) => ({
        heading: match[1],
        content: String(body).slice(match.index + match[0].length, headings[index + 1]?.index).trim(),
      }))
      .filter((section) => section.heading === heading),
  ]));
}

/**
 * Read the explicit PR evidence. Kind selection is deliberately bounded to the six canonical
 * values: this function never derives a kind from other PR or repository metadata.
 */
export function parseNarrativeEvidence(body) {
  const found = sections(body);
  const kindSections = found.get("Narrative Kind");
  if (!kindSections.length) {
    throw new Error("A narrative-required PR must contain the exact ## Narrative Kind heading");
  }
  if (kindSections.length > 1) {
    throw new Error("A narrative-required PR must contain exactly one ## Narrative Kind heading");
  }
  const kind = kindSections[0].content;
  if (!kind) {
    throw new Error("Narrative Kind must contain exactly one canonical value: product, architecture, governance, operational, correction, or experiment");
  }
  if (!NARRATIVE_KINDS.has(kind)) {
    throw new Error(`Unsupported Narrative Kind '${kind}'. Use exactly one canonical value: product, architecture, governance, operational, correction, or experiment`);
  }

  const evidence = { kind };
  for (const [heading, property] of [["Narrative Context", "context"], ["Narrative Decision", "decision"], ["Narrative Consequences", "consequences"]]) {
    const matching = found.get(heading);
    if (!matching.length || !matching[0].content) {
      throw new Error(`A narrative-required PR must contain a non-empty exact ## ${heading} heading`);
    }
    evidence[property] = matching[0].content;
  }
  return evidence;
}
