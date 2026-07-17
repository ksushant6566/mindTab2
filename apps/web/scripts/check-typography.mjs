import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");

const allowedPathParts = [
  `${path.sep}components${path.sep}ui${path.sep}`,
  `${path.sep}components${path.sep}ai-elements${path.sep}`,
  `${path.sep}components${path.sep}layout${path.sep}`,
  `${path.sep}components${path.sep}patterns${path.sep}`,
  `${path.sep}components${path.sep}domain${path.sep}`,
];

const documentedExceptions = new Set([
  path.join(root, "src", "components", "text-editor", "rich-text-editor.tsx"),
]);

const typographyPatterns = [
  /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g,
  /\btext-\[[^\]]+\]/g,
  /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|mono|sans|serif)\b/g,
  /\bleading-(?:none|tight|snug|normal|relaxed|loose|\d+|\[[^\]]+\])\b/g,
  /\btracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])\b/g,
];

const approvedTokenPattern =
  /text-\[length:var\(--type-|font-\[var\(--type-|leading-\[var\(--type-/g;

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
    if (/\.(tsx|ts)$/.test(entry)) files.push(fullPath);
  }

  return files;
}

function isAllowedFile(filePath) {
  return (
    allowedPathParts.some((part) => filePath.includes(part)) ||
    documentedExceptions.has(filePath)
  );
}

const findings = [];

for (const filePath of collectFiles(srcDir)) {
  if (isAllowedFile(filePath)) continue;

  const source = readFileSync(filePath, "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    const matches = new Set();
    for (const pattern of typographyPatterns) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        const utility = match[0];
        if (utility === "font-mono" && line.includes("CommandShortcut")) continue;
        if (approvedTokenPattern.test(utility)) {
          approvedTokenPattern.lastIndex = 0;
          continue;
        }
        approvedTokenPattern.lastIndex = 0;
        matches.add(utility);
      }
    }

    if (matches.size > 0) {
      findings.push({
        file: path.relative(root, filePath),
        line: index + 1,
        utilities: [...matches].sort(),
      });
    }
  });
}

const uniqueUtilities = new Set(findings.flatMap((finding) => finding.utilities));
const files = new Set(findings.map((finding) => finding.file));

console.log("Typography audit (warning only)");
console.log(`Files with raw typography utilities: ${files.size}`);
console.log(`Raw utility occurrences: ${findings.length}`);
console.log(`Unique raw utilities: ${uniqueUtilities.size}`);

if (findings.length > 0) {
  console.log("\nTop findings:");
  findings.slice(0, 80).forEach((finding) => {
    console.log(
      `${finding.file}:${finding.line} ${finding.utilities.join(", ")}`
    );
  });

  if (findings.length > 80) {
    console.log(`...and ${findings.length - 80} more`);
  }
}

process.exit(0);
