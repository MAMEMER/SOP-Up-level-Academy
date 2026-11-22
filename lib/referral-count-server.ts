import "server-only";
import { adminDb } from "./firebase-admin.ts";
import { countActiveReferrals } from "./referral-count.ts";

export async function referralCount(code: string) {
  const snapshot = await adminDb().collection("users").where("referredByStaff", "==", code).get();
  return countActiveReferrals(snapshot.docs.map(doc => doc.data()));
}
