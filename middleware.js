import { NextResponse } from "next/server";

export const config = {
  matcher: ["/ops/:path*"],
};

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="AROC Ops"',
    },
  });
}

export default function middleware(req) {
  const user = process.env.OPS_USER;
  const pass = process.env.OPS_PASS;

  if (!user || !pass) {
    // Fail closed if env vars missing
    return unauthorized();
  }

  const auth = req.headers.get("authorization") || "";
  const [type, encoded] = auth.split(" ");

  if (type !== "Basic" || !encoded) return unauthorized();

  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch (e) {
    return unauthorized();
  }

  const idx = decoded.indexOf(":");
  if (idx === -1) return unauthorized();

  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  if (u !== user || p !== pass) return unauthorized();

  return NextResponse.next();
}
