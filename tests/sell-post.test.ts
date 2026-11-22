import { test } from "node:test";
import { strict as assert } from "node:assert";
import { canGenerate, filterSellGroups, gameForProduct, generateVariants, hasForbiddenMembershipOffer } from "../lib/sell-post.ts";
test("membership offer guard detects both orders and whitespace",()=>{assert.equal(hasForbiddenMembershipOffer("สมัครสมาชิก วันนี้ ฟรี"),true);assert.equal(hasForbiddenMembershipOffer("ฟรี\nสำหรับสมาชิก"),true);assert.equal(hasForbiddenMembershipOffer("สินค้าราคาพิเศษ"),false);});
test("groups match chosen game",()=>{const rows=[{name:"a",url:"https://example.com",games:["pokemon"]},{name:"b",url:"https://example.com",games:["other"]}];assert.deepEqual(filterSellGroups(rows,"pokemon"),[rows[0]]);assert.equal(gameForProduct("Pokemon Shield"),"pokemon");});
test("daily quota rejects exhausted and invalid counts",()=>{assert.equal(canGenerate(29),true);assert.equal(canGenerate(30),false);assert.equal(canGenerate(-1),false);});
test("generation retries unsafe model output and blocks repeated unsafe output",async()=>{let n=0;assert.deepEqual(await generateVariants(async()=>++n===1?["สมาชิกฟรี","ok"]:["short","long"]),["short","long"]);assert.equal(n,2);await assert.rejects(()=>generateVariants(async()=>["สมาชิกฟรี","ok"]));});
