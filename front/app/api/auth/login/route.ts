import { NextResponse } from "next/server";
import { loginUser, registerUser } from "@/lib/db";

type LoginRequest = {
  action?: "login" | "register";
  name?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginRequest;
  const name = body.name?.trim();
  const password = body.password ?? "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  if (name.length > 32) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  if (password.length < 6 || password.length > 72) {
    return NextResponse.json({ error: "Password length is invalid" }, { status: 400 });
  }

  const action = body.action ?? "login";
  const user = action === "register" ? await registerUser(name, password) : await loginUser(name, password);

  if (!user) {
    return NextResponse.json(
      { error: action === "register" ? "User already exists" : "Invalid credentials" },
      { status: 409 }
    );
  }

  return NextResponse.json({ user });
}
