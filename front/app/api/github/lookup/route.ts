import { NextResponse } from "next/server";

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  language: string | null;
  default_branch: string;
  updated_at: string;
  pushed_at: string | null;
  topics?: string[];
  license: {
    spdx_id: string | null;
    name: string;
  } | null;
};

type GitHubUser = {
  login: string;
  html_url: string;
  avatar_url: string;
  name: string | null;
  public_repos: number;
  followers: number;
  following: number;
};

type LookupRequest = {
  input?: string;
  token?: string;
};

const githubApiBase = "https://api.github.com";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LookupRequest;
  const rawInput = body.input?.trim();

  if (!rawInput) {
    return NextResponse.json({ error: "请输入 GitHub 仓库 URL、owner/repo 或用户名。" }, { status: 400 });
  }

  const token = body.token?.trim() || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const target = parseGitHubTarget(rawInput);

  if (!target) {
    return NextResponse.json({ error: "无法识别 GitHub 输入，请使用仓库 URL、owner/repo 或用户名。" }, { status: 400 });
  }

  try {
    if (target.type === "repo") {
      const repository = await githubFetch<GitHubRepository>(`/repos/${target.owner}/${target.repo}`, token);
      return NextResponse.json({
        kind: "repo",
        repository: normalizeRepository(repository)
      });
    }

    const [user, starred] = await Promise.all([
      githubFetch<GitHubUser>(`/users/${target.username}`, token),
      githubFetch<GitHubRepository[]>(`/users/${target.username}/starred?per_page=30&sort=updated`, token)
    ]);

    return NextResponse.json({
      kind: "user",
      repositories: starred.map(normalizeRepository),
      user: {
        avatarUrl: user.avatar_url,
        followers: user.followers,
        following: user.following,
        htmlUrl: user.html_url,
        login: user.login,
        name: user.name,
        publicRepos: user.public_repos
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub 查询失败。";
    const status = message.includes("not found") ? 404 : message.includes("rate limit") ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${githubApiBase}${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("GitHub resource not found");
    }

    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw new Error("GitHub rate limit reached，请输入 token 后重试。");
    }

    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message || `GitHub request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function parseGitHubTarget(input: string): { owner: string; repo: string; type: "repo" } | { type: "user"; username: string } | null {
  const trimmed = input.trim().replace(/^@/, "");

  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return owner && repo ? { owner, repo: stripGitSuffix(repo), type: "repo" } : null;
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) {
      return /^[\w.-]+$/.test(trimmed) ? { type: "user", username: trimmed } : null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const [owner, repo] = parts;
      return owner && repo ? { owner, repo: stripGitSuffix(repo), type: "repo" } : null;
    }

    if (parts.length === 1) {
      const [username] = parts;
      return username ? { type: "user", username } : null;
    }

    return null;
  } catch {
    return /^[\w.-]+$/.test(trimmed) ? { type: "user", username: trimmed } : null;
  }
}

function stripGitSuffix(repo: string) {
  return repo.replace(/\.git$/i, "");
}

function normalizeRepository(repository: GitHubRepository) {
  return {
    defaultBranch: repository.default_branch,
    description: repository.description,
    forks: repository.forks_count,
    fullName: repository.full_name,
    htmlUrl: repository.html_url,
    id: repository.id,
    language: repository.language,
    license: repository.license?.spdx_id || repository.license?.name || null,
    name: repository.name,
    openIssues: repository.open_issues_count,
    owner: repository.owner.login,
    pushedAt: repository.pushed_at,
    stars: repository.stargazers_count,
    topics: repository.topics ?? [],
    updatedAt: repository.updated_at,
    watchers: repository.watchers_count
  };
}
