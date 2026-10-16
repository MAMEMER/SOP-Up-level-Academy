import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyGoogleIdToken } from "../../../../lib/firebase-token.ts";
export async function POST(request: Request) {
 const {idToken} = await request.json().catch(()=>({}));
 if(typeof idToken !== "string" || !await verifyGoogleIdToken(idToken)) return NextResponse.json({error:"rehearsal-identity-required"},{status:403});
 (await cookies()).set("test_sop_rehearsal",idToken,{httpOnly:true,secure:new URL(request.url).protocol === "https:",sameSite:"strict",path:"/",maxAge:3500});
 return NextResponse.json({ok:true});
}
export async function DELETE(){(await cookies()).delete("test_sop_rehearsal");return NextResponse.json({ok:true});}
