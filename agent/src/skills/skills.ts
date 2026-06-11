import fs from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "../types.js";
import { safeResolve, truncate } from "../utils.js";

export class SkillManager {
  constructor(private readonly config: AgentConfig) {}

  private skillDirs(): string[] {
    return this.config.skills.directories.map((dir) => path.resolve(this.config.workspaceRoot, dir));
  }

  async search(query: string): Promise<Array<{ name: string; path: string; summary: string }>> {
    const results: Array<{ name: string; path: string; score: number; summary: string }> = [];
    const terms = tokenizeQuery(query);
    for (const dir of this.skillDirs()) {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const skillPath = path.join(dir, entry, "SKILL.md");
        try {
          const body = await fs.readFile(skillPath, "utf8");
          const haystack = `${entry}\n${body}`.toLowerCase();
          const score = scoreSkillMatch(haystack, terms, query);
          if (!query || score > 0) {
            results.push({
              name: entry,
              path: path.relative(this.config.workspaceRoot, skillPath),
              score,
              summary: truncate(body.replace(/\s+/g, " "), 400),
            });
          }
        } catch {
          // Ignore malformed skill folders.
        }
      }
    }
    return results
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map(({ score: _score, ...result }) => result);
  }

  async metadata(): Promise<Array<{ description: string; name: string; path: string }>> {
    const results: Array<{ description: string; name: string; path: string }> = [];
    for (const dir of this.skillDirs()) {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const skillPath = path.join(dir, entry, "SKILL.md");
        try {
          const body = await fs.readFile(skillPath, "utf8");
          const frontmatter = parseFrontmatter(body);
          results.push({
            description: frontmatter.description || "",
            name: frontmatter.name || entry,
            path: path.relative(this.config.workspaceRoot, skillPath),
          });
        } catch {
          // Ignore malformed skill folders.
        }
      }
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async read(skillPath: string): Promise<string> {
    const fullPath = safeResolve(this.config.workspaceRoot, skillPath);
    const body = await fs.readFile(fullPath, "utf8");
    return truncate(body, 20000);
  }

  async installLocal(sourcePath: string, requestedName?: string): Promise<{ name: string; path: string }> {
    const source = path.resolve(this.config.workspaceRoot, sourcePath);
    const stat = await fs.stat(source);
    const skillFile = stat.isDirectory() ? path.join(source, "SKILL.md") : source;
    if (path.basename(skillFile) !== "SKILL.md") {
      throw new Error("Skill source must be a SKILL.md file or a directory containing SKILL.md.");
    }

    const body = await fs.readFile(skillFile, "utf8");
    const name = sanitizeSkillName(requestedName ?? path.basename(path.dirname(skillFile)));
    const installRoot = this.skillDirs()[0];
    if (!installRoot) throw new Error("No skill directories configured.");

    const targetDir = path.join(installRoot, name);
    const targetFile = path.join(targetDir, "SKILL.md");
    try {
      await fs.stat(targetDir);
      throw new Error(`Skill already installed: ${name}`);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetFile, body, "utf8");
    return {
      name,
      path: path.relative(this.config.workspaceRoot, targetFile),
    };
  }
}

function sanitizeSkillName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("Skill name is empty.");
  return normalized;
}

function parseFrontmatter(body: string): { description?: string; name?: string } {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return {};

  const metadata: { description?: string; name?: string } = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = stripYamlString(line.slice(separator + 1).trim());
    if (key === "name" || key === "description") {
      metadata[key] = value;
    }
  }
  return metadata;
}

function stripYamlString(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function tokenizeQuery(query: string): string[] {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return [];

  const terms = new Set<string>();
  terms.add(normalized);

  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9_-]{1,}/g)) {
    terms.add(match[0]);
  }

  for (const match of normalized.matchAll(/[\u3400-\u9fff]{2,}/g)) {
    const text = match[0];
    terms.add(text);
    for (let size = 2; size <= Math.min(4, text.length); size += 1) {
      for (let index = 0; index <= text.length - size; index += 1) {
        terms.add(text.slice(index, index + size));
      }
    }
  }

  return [...terms].filter((term) => term.length >= 2);
}

function scoreSkillMatch(haystack: string, terms: string[], query: string): number {
  if (!query) return 1;
  let score = 0;
  for (const term of terms) {
    if (!haystack.includes(term)) continue;
    score += term.length >= 6 ? 4 : term.length >= 3 ? 2 : 1;
  }
  return score;
}
