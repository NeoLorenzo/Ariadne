import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const REPOSITORY_ROOT = process.cwd();
const PRIVATE_SEED_IDENTIFIER = "seed_goat_" + "academics_for_current_user";
const SKIPPED_DIRECTORIES = new Set([".git", ".next", "node_modules"]);
const TEXT_FILE_EXTENSIONS = new Set([
  "",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".webmanifest",
  ".yml",
  ".yaml"
]);

const SECRET_PATTERNS = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]+/],
  ["OpenAI API key", /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /gh[opusr]_[A-Za-z0-9]{20,}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["JWT", /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/]
];

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function readTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8"
  });
  return output.split("\0").filter(Boolean).map(normalizePath);
}

function collectTextFiles(directoryPath) {
  if (!existsSync(directoryPath)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directoryPath)) {
    if (SKIPPED_DIRECTORIES.has(entry)) {
      continue;
    }
    const entryPath = join(directoryPath, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      files.push(...collectTextFiles(entryPath));
    } else if (TEXT_FILE_EXTENSIONS.has(extname(entry).toLowerCase())) {
      files.push(entryPath);
    }
  }
  return files;
}

function inspectText(fileLabel, text, findings) {
  for (const [findingName, pattern] of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      findings.push(`${fileLabel}: possible ${findingName}`);
    }
  }

  if (text.includes(PRIVATE_SEED_IDENTIFIER)) {
    findings.push(`${fileLabel}: private academic seed routine is prohibited`);
  }
}

const findings = [];
const trackedFiles = readTrackedFiles();

for (const trackedFile of trackedFiles) {
  const normalized = normalizePath(trackedFile);
  const fileName = normalized.split("/").at(-1) || "";
  if (/^\.env(?:\.|$)/i.test(fileName)) {
    findings.push(`${normalized}: environment files must not be tracked`);
    continue;
  }
  if (/\.(?:key|p12|pfx|pem)$/i.test(fileName)) {
    findings.push(`${normalized}: credential files must not be tracked`);
    continue;
  }

  const absolutePath = join(REPOSITORY_ROOT, trackedFile);
  if (!existsSync(absolutePath) || !TEXT_FILE_EXTENSIONS.has(extname(fileName).toLowerCase())) {
    continue;
  }
  const bytes = readFileSync(absolutePath);
  if (bytes.includes(0)) {
    continue;
  }
  inspectText(normalized, bytes.toString("utf8"), findings);
}

const exportDirectory = join(REPOSITORY_ROOT, "out");
for (const exportFile of collectTextFiles(exportDirectory)) {
  const fileLabel = normalizePath(relative(REPOSITORY_ROOT, exportFile));
  inspectText(fileLabel, readFileSync(exportFile, "utf8"), findings);
}

if (findings.length > 0) {
  console.error("Privacy check failed:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exitCode = 1;
} else {
  console.log("Privacy check passed: no prohibited files, private seed data, or credential patterns found.");
}
