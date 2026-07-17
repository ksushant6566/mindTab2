import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");

const approvedPathParts = [
  `${path.sep}components${path.sep}ui${path.sep}`,
  `${path.sep}components${path.sep}ai-elements${path.sep}`,
  `${path.sep}components${path.sep}layout${path.sep}`,
  `${path.sep}components${path.sep}patterns${path.sep}`,
  `${path.sep}components${path.sep}domain${path.sep}`,
  `${path.sep}styles${path.sep}`,
];

const documentedExceptions = new Set([
  path.join(root, "src", "components", "appearance-root.tsx"),
]);

const checkGroups = [
  {
    name: "raw-classname",
    patterns: [/\bclassName\s*=/g],
  },
  {
    name: "typography",
    patterns: [
      /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g,
      /\btext-\[[^\]]+\]/g,
      /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|mono|sans|serif)\b/g,
      /\bleading-(?:none|tight|snug|normal|relaxed|loose|\d+|\[[^\]]+\])\b/g,
      /\btracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])\b/g,
    ],
    approved: /text-\[length:var\(--type-|font-\[var\(--type-|leading-\[var\(--type-/,
  },
  {
    name: "colors",
    patterns: [
      /\b(?:text|bg|border|ring|from|to|via|decoration|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?\b/g,
      /\b(?:text|bg|border|ring|from|to|via|decoration|accent)-\[[^\]]+\]/g,
    ],
    approved: /(?:text|bg|border|ring|decoration|accent)-\[(?:length:)?var\(--(?:type-|tone-|bg-|border|r-|shadow-|ink|muted|task|note|project|sidebar|card|primary|secondary|destructive|accent|popover|foreground|background|input|ring)/,
  },
  {
    name: "arbitrary-values",
    patterns: [/\b[a-z-]+-\[[^\]]+\]/g],
    approved: /(?:text-\[length:var\(--type-|font-\[var\(--type-|leading-\[var\(--type-|rounded-\[var\(--r-|bg-\[var\(--bg-|border-\[var\(--border|shadow-\[var\(--shadow)/,
  },
  {
    name: "shadows",
    patterns: [/\bshadow(?:-(?:sm|md|lg|xl|2xl|inner|none))?\b/g, /\bshadow-\[[^\]]+\]/g],
    approved: /shadow-\[var\(--shadow/,
  },
  {
    name: "radii",
    patterns: [/\brounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?\b/g],
    approved: /rounded-\[var\(--r-/,
  },
  {
    name: "spacing",
    patterns: [/\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y)-\[[^\]]+\]/g],
  },
  {
    name: "state-styles",
    patterns: [/\b(?:hover|focus|focus-visible|active|disabled|group-hover|data-\[[^\]]+\]):[^\s"'`]+/g],
  },
];

const globalGuardrailGroups = [
  {
    name: "undefined-semantic-token",
    patterns: [
      /\b(?:bg|text|border|ring|from|to|via|hover:bg|hover:text|active:bg|active:text|focus:bg|focus:text)-sidebar(?:-[a-z]+)*\b/g,
    ],
  },
  {
    name: "known-tailwind-noop",
    patterns: [
      /\b(?:h|w|size)-18\b/g,
      /\b[a-z:-]+-[^\s"'`]*\/8\b/g,
    ],
  },
];

function collectFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (/\.(tsx|ts|css)$/.test(entry)) files.push(fullPath);
  }

  return files;
}

function isApprovedFile(filePath) {
  return (
    approvedPathParts.some((part) => filePath.includes(part)) ||
    documentedExceptions.has(filePath)
  );
}

function classifyFile(filePath) {
  const rel = path.relative(root, filePath);
  if (rel.startsWith(`src${path.sep}routes${path.sep}`)) return "route";
  if (rel.includes(`${path.sep}settings-page.tsx`) || rel.includes(`${path.sep}web-chat-page.tsx`) || rel.includes(`${path.sep}web-vault-page.tsx`)) return "page";
  if (rel.startsWith(`src${path.sep}components${path.sep}`)) return "feature";
  return "other";
}

const findings = [];

for (const filePath of collectFiles(srcDir)) {
  const source = readFileSync(filePath, "utf8");
  const lines = source.split("\n");
  const bucket = classifyFile(filePath);

  lines.forEach((line, index) => {
    for (const group of globalGuardrailGroups) {
      const matches = new Set();
      for (const pattern of group.patterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          matches.add(match[0]);
        }
      }
      if (matches.size > 0) {
        findings.push({
          file: path.relative(root, filePath),
          line: index + 1,
          bucket,
          group: group.name,
          utilities: [...matches].sort(),
        });
      }
    }
  });

  if (isApprovedFile(filePath)) continue;

  lines.forEach((line, index) => {
    for (const group of checkGroups) {
      const matches = new Set();
      for (const pattern of group.patterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const utility = match[0];
          if (group.approved?.test(utility)) continue;
          matches.add(utility);
        }
      }
      if (matches.size > 0) {
        findings.push({
          file: path.relative(root, filePath),
          line: index + 1,
          bucket,
          group: group.name,
          utilities: [...matches].sort(),
        });
      }
    }
  });
}

const byGroup = new Map();
const byBucket = new Map();
const byFile = new Map();

for (const finding of findings) {
  byGroup.set(finding.group, (byGroup.get(finding.group) || 0) + finding.utilities.length);
  byBucket.set(finding.bucket, (byBucket.get(finding.bucket) || 0) + finding.utilities.length);
  byFile.set(finding.file, (byFile.get(finding.file) || 0) + finding.utilities.length);
}

console.log("UI architecture audit (warning only)");
console.log(`Files with raw UI styling outside approved layers: ${byFile.size}`);
console.log(`Raw UI styling findings: ${findings.length}`);

if (findings.length > 0) {
  console.log("\nFindings by category:");
  [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([group, count]) => console.log(`- ${group}: ${count}`));

  console.log("\nFindings by file type:");
  [...byBucket.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([bucket, count]) => console.log(`- ${bucket}: ${count}`));

  console.log("\nTop files:");
  [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .forEach(([file, count]) => console.log(`- ${file}: ${count}`));

  console.log("\nSample findings:");
  findings.slice(0, 120).forEach((finding) => {
    console.log(`${finding.file}:${finding.line} [${finding.group}] ${finding.utilities.join(", ")}`);
  });

  if (findings.length > 120) {
    console.log(`...and ${findings.length - 120} more`);
  }
}

process.exit(0);
