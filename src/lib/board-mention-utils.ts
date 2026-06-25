export type MentionUser = { id: string; name: string };

/**
 * Internal plain-text token written into comment content for @ALL mentions.
 * Locale-specific display is resolved at render time to keep the stored value stable.
 */
export const ALL_TOKEN = "@ALL";

/**
 * Parses comment content into a sequence of plain text and mention segments.
 *
 * Strategy:
 * - @ALL (case-insensitive) → single "all" mention segment
 * - remaining @Name patterns matched against mentionedUsers using longest-prefix-first
 *   so "김지수연" won't partially match "김지수" if the longer name is in the list
 */
export function renderMentionContent(
  content: string,
  mentionedUsers: MentionUser[],
  mentionAll: boolean,
  allLabel: string,
): Array<
  | { type: "text"; text: string }
  | { type: "mention"; label: string; userId: string | "ALL" }
> {
  if (!content) return [];

  // Sort names longest-first so greedy matching won't clip a longer name.
  const sortedUsers = [...mentionedUsers].sort((a, b) => b.name.length - a.name.length);

  const segments: Array<
    | { type: "text"; text: string }
    | { type: "mention"; label: string; userId: string | "ALL" }
  > = [];

  let i = 0;
  while (i < content.length) {
    if (content[i] !== "@") {
      // Accumulate plain text until next @
      const end = content.indexOf("@", i + 1);
      segments.push({ type: "text", text: content.slice(i, end === -1 ? undefined : end) });
      i = end === -1 ? content.length : end;
      continue;
    }

    // Try @ALL first (case-insensitive)
    const allMatch = content.slice(i).match(/^@ALL\b/i);
    if (allMatch && mentionAll) {
      segments.push({ type: "mention", label: `@${allLabel}`, userId: "ALL" });
      i += allMatch[0].length;
      continue;
    }

    // Try each user name (longest first)
    let matched = false;
    for (const user of sortedUsers) {
      if (content.slice(i + 1, i + 1 + user.name.length) === user.name) {
        const after = content[i + 1 + user.name.length];
        // Require word boundary after the name (space, punctuation, or end of string)
        if (after === undefined || /[\s,.!?。、]/.test(after)) {
          segments.push({ type: "mention", label: `@${user.name}`, userId: user.id });
          i += 1 + user.name.length;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // No match — treat the @ as plain text
      segments.push({ type: "text", text: "@" });
      i += 1;
    }
  }

  // Merge adjacent text segments (happens when an @ had no match)
  const merged: typeof segments = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (seg.type === "text" && last?.type === "text") {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}
