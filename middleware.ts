import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // --- Security headers ---
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.amazonaws.com https://api.telegram.org",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  // --- Block common scanners / path traversal ---
  const path = request.nextUrl.pathname;
  if (
    path.includes("..") ||
    path.includes("\\") ||
    /\.(php|asp|aspx|jsp|cgi|env)$/i.test(path)
  ) {
    return new NextResponse(null, { status: 404 });
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js).*)",
  ],
};
