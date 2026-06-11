import { NextResponse } from "next/server";
export async function GET() {
  const workspacePath = process.cwd();

  return NextResponse.json({
    name: "LangCore",
    path: workspacePath
  });
}
