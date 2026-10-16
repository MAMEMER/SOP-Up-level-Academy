import {NextResponse, type NextRequest} from "next/server";
export function proxy(request: NextRequest){
 const p=request.nextUrl.pathname;
 if(p.startsWith("/_next/") || p.startsWith("/assets/") || p === "/up-level-academy-logo.png" || ["/login","/grand-opening-checklist","/api/auth/session","/api/grand-opening-checklist"].includes(p)) return NextResponse.next();
 if(p.startsWith("/api/"))return NextResponse.json({error:"rehearsal-route-disabled"},{status:403});
 return NextResponse.redirect(new URL("/grand-opening-checklist",request.url));
}
