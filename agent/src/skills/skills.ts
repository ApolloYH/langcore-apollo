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
    const results: Array<{ name: string; path: string; summary: string }> = [];
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
          if (!query || haystack.includes(query.toLowerCase())) {
            results.push({
              name: entry,
              path: path.relative(this.config.workspaceRoot, skillPath),
              summary: truncate(body.replace(/\s+/g, " "), 400),
            });
          }
        } catch {
          // Ignore malformed skill folders.
        }
      }
    }
    return results;
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
