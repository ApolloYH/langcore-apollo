import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filename = url.searchParams.get("file") ?? "";
  const format = url.searchParams.get("format") ?? "md";

  if (!isSafeMarkdownFilename(filename)) {
    return new Response("Invalid report filename", { status: 400 });
  }

  if (format !== "md" && format !== "pdf") {
    return new Response("Invalid report format", { status: 400 });
  }

  let markdown = "";
  try {
    const reportPath = await findReportPath(filename);
    markdown = await fs.readFile(reportPath, "utf8");
  } catch {
    return new Response("Report not found", { status: 404 });
  }

  if (format === "md") {
    return new Response(markdown, {
      headers: {
        "content-disposition": `attachment; filename="${filename}"`,
        "content-type": "text/markdown; charset=utf-8",
      },
    });
  }

  const pdf = await markdownToPdf(markdown, filename);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-disposition": `attachment; filename="${filename.replace(/\.md$/i, ".pdf")}"`,
      "content-type": "application/pdf",
    },
  });
}

function isSafeMarkdownFilename(filename: string) {
  return (
    filename.length > 3 &&
    filename.length <= 180 &&
    filename.endsWith(".md") &&
    path.basename(filename) === filename &&
    /^[a-zA-Z0-9._-]+\.md$/.test(filename)
  );
}

async function findReportPath(filename: string) {
  const docsDirs = [
    path.resolve(process.cwd(), "..", "docs"),
    path.resolve(process.cwd(), "..", "agent", "docs"),
  ];

  for (const docsDir of docsDirs) {
    const reportPath = path.resolve(docsDir, filename);
    if (!reportPath.startsWith(`${docsDir}${path.sep}`)) {
      continue;
    }

    try {
      const stat = await fs.stat(reportPath);
      if (stat.isFile()) {
        return reportPath;
      }
    } catch {
      // Try the next report directory.
    }
  }

  throw new Error("Report not found");
}

async function markdownToPdf(markdown: string, filename: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(markdownToHtml(markdown, filename), { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      margin: { bottom: "18mm", left: "18mm", right: "18mm", top: "18mm" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}

function markdownToHtml(markdown: string, filename: string) {
  const body = renderMarkdown(markdown);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filename)}</title>
  <style>
    body {
      color: #202124;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 13px;
      line-height: 1.6;
    }
    h1, h2, h3 { line-height: 1.25; margin: 22px 0 10px; }
    h1 { font-size: 24px; }
    h2 { border-top: 1px solid #ddd; font-size: 18px; padding-top: 16px; }
    h3 { font-size: 15px; }
    p { margin: 7px 0; }
    li { margin: 5px 0; }
    code {
      background: #f3f4f4;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 1px 4px;
    }
    pre {
      background: #f7f7f7;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 10px;
      white-space: pre-wrap;
    }
    .table-wrap { margin: 12px 0; overflow-x: auto; }
    table { border-collapse: collapse; font-size: 11px; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 6px 7px; vertical-align: top; }
    th { background: #f4f4f4; font-weight: 700; }
    .align-right { text-align: right; }
    .align-center { text-align: center; }
    a { color: #1769aa; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextLine = lines[index + 1] ?? "";

    if (isMarkdownTableLine(line) && isMarkdownTableSeparator(nextLine)) {
      const tableLines = [line, nextLine];
      index += 2;
      while (index < lines.length && isMarkdownTableLine(lines[index] ?? "")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      index -= 1;
      html.push(renderMarkdownTable(tableLines));
      continue;
    }

    html.push(renderMarkdownLine(line));
  }

  return html.join("\n");
}

function renderMarkdownLine(line: string) {
  if (!line.trim()) return "<br>";

  const heading = line.match(/^(#{1,3})\s+(.+)$/);
  if (heading?.[1] && heading[2]) {
    const level = heading[1].length;
    return `<h${level}>${renderInline(heading[2])}</h${level}>`;
  }

  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  if (bullet?.[1]) {
    return `<p>• ${renderInline(bullet[1])}</p>`;
  }

  return `<p>${renderInline(line)}</p>`;
}

function renderMarkdownTable(lines: string[]) {
  const headers = splitMarkdownTableRow(lines[0] ?? "");
  const alignments = splitMarkdownTableRow(lines[1] ?? "").map(parseTableAlignment);
  const rows = lines.slice(2).map(splitMarkdownTableRow);

  const head = headers
    .map((header, index) => `<th class="${alignments[index] ?? "align-left"}">${renderInline(header)}</th>`)
    .join("");
  const body = rows
    .map((row) => {
      const cells = headers
        .map((_, index) => `<td class="${alignments[index] ?? "align-left"}">${renderInline(row[index] ?? "")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("\n");

  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function isMarkdownTableLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.slice(1, -1).includes("|");
}

function isMarkdownTableSeparator(line: string) {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableAlignment(cell: string) {
  const trimmed = cell.trim();
  if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "align-center";
  if (trimmed.endsWith(":")) return "align-right";
  return "align-left";
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderInline(text: string) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
