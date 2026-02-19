import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";

const PUBLIC_PATHS = ["/auth/", "/api/nextauth/", "/api/register", "/api/migrate-local-data"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function addSecurityHeaders(response: NextResponse): void {
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
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.amazonaws.com https://api.telegram.org",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; ")
  );
}

export default auth((request) => {
  const { pathname } = request.nextUrl;

  // Block common scanners / path traversal
  if (
    pathname.includes("..") ||
    pathname.includes("\\") ||
    /\.(php|asp|aspx|jsp|cgi|env)$/i.test(pathname)
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const session = request.auth;

  // Authenticated users trying to access auth pages → redirect to home
  if (session && isPublic(pathname) && pathname.startsWith("/auth/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Unauthenticated users on protected routes → redirect to login
  if (!session && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}) as (request: NextRequest) => NextResponse;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|api/nextauth|.well-known).*)",
  ],
};
