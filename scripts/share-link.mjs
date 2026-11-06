// Builds the "share my idea with S3" link from PROJECT.md (used by the start-my-project skill).
//
//   node scripts/share-link.mjs            → prints a labelled link and a copy-paste version
//   node scripts/share-link.mjs --raw      → also prints the plain link (if the label doesn't work)
//
// Nothing is sent. The learner decides whether to open the link; the page on hellos3.com
// shows the brief for them to review and edit before they press submit.
//
// Link format (v1, shared with hellos3.com/bumper-lanes/share):
//   https://hellos3.com/bumper-lanes/share?v=1&src=kit&project=<name>&brief=<text>
// Values are URL-encoded; the whole link stays under MAX_URL_LENGTH characters so it
// works in every browser and email client. If it's too long, "Later ideas" is left out of
// the link first; if it's still too long, the brief is shortened (with "…") to fit. The
// copy-paste version always has everything.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARE_URL = 'https://hellos3.com/bumper-lanes/share';
export const LINK_LABEL = 'Send my idea to S3 →';
/** Left out of the link first when it's too long (still in the copy-paste version). */
const OPTIONAL_SECTIONS = /^later ideas$/i;
export const MAX_URL_LENGTH = 1800;
const MAX_PROJECT_LENGTH = 80;

/** PROJECT.md → { name, sections: { heading: text } }, ignoring placeholder lines. */
export function parseProject(markdown) {
  const name = (/^#\s+(.+)$/m.exec(markdown)?.[1] ?? 'My project').trim();
  const sections = {};
  for (const [, heading, body] of markdown.matchAll(/^##\s+(.+)\n([\s\S]*?)(?=^##\s|(?![\s\S]))/gm)) {
    const text = body
      .split('\n')
      .filter((line) => !/^\s*>/.test(line) && !/^\s*[-*]?\s*_.*_\s*$/.test(line) && !/^\s*[-*]\s*_?…_?\s*$/.test(line))
      .join('\n')
      .trim();
    if (text) sections[heading.trim()] = text;
  }
  return { name, sections };
}

/** A compact plain-text brief: "Heading: text" blocks, in PROJECT.md order. */
export function briefText({ sections }, { skip } = {}) {
  return Object.entries(sections)
    .filter(([heading]) => !skip?.test(heading))
    .map(([heading, text]) => `${heading}:\n${text}`)
    .join('\n\n');
}

/** The link as a short, clickable Markdown label — Claude Code and Codex show just the label. */
export const markdownLink = (url) => `[**${LINK_LABEL}**](${url})`;

/**
 * Builds the share link. Returns { url, brief, shortened } where `brief` is the full
 * text (for copy-paste) and `shortened` says whether the link had to trim it.
 */
export function buildShareLink(markdown, { base = SHARE_URL, maxLength = MAX_URL_LENGTH } = {}) {
  const project = parseProject(markdown);
  const name = project.name.slice(0, MAX_PROJECT_LENGTH);
  const brief = briefText(project);
  if (!brief) throw new Error('PROJECT.md has no answers yet — run start-my-project first.');

  const make = (text) => {
    const params = new URLSearchParams({ v: '1', src: 'kit', project: name, brief: text });
    return `${base}?${params.toString()}`;
  };

  let url = make(brief);
  if (url.length <= maxLength) return { url, brief, shortened: false };

  // Too long: leave out the optional sections, if that's enough.
  const core = briefText(project, { skip: OPTIONAL_SECTIONS }) || brief;
  url = make(core);
  if (url.length <= maxLength) return { url, brief, shortened: true };

  // Still too long: find the longest prefix (on a word boundary) that fits.
  let lo = 0;
  let hi = core.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (make(`${core.slice(0, mid)}…`).length <= maxLength) lo = mid;
    else hi = mid - 1;
  }
  const cut = core.slice(0, lo);
  const atWord = cut.lastIndexOf(' ') > lo * 0.8 ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  url = make(`${atWord.trimEnd()}…`);
  return { url, brief, shortened: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const root = resolve(dir ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const file = join(root, 'PROJECT.md');
  if (!existsSync(file)) {
    console.error('PROJECT.md not found — run start-my-project first.');
    process.exit(1);
  }
  try {
    const { url, brief, shortened } = buildShareLink(readFileSync(file, 'utf8'));
    console.log('Show the learner this link exactly as written (it appears as a short label; nothing is sent until they open it and press Send):\n');
    console.log(markdownLink(url));
    if (process.argv.includes('--raw')) console.log(`\nPlain link:\n${url}`);
    if (shortened) console.log('\n(The link holds a shorter brief. The full text is below to paste in if they like.)');
    console.log(`\nCopy-paste version (if the link doesn't open, go to ${SHARE_URL} and paste this):\n`);
    console.log(brief);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
