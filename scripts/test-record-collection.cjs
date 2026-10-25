/* Check every imported Instagram record and its catalog provenance. */
"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const data=JSON.parse(fs.readFileSync("data/45rpm-collection.json","utf8"));
assert.equal(data.records.length,34);
const index=fs.readFileSync("45rpm.html","utf8");
assert.equal((index.match(/class="record-grid-item record-import-tile"/g)||[]).length,34);
assert.match(index,/click a record to see its a-side, b-side, label, pressing notes, and more/);
for(const r of data.records){
 const file="records/"+r.id+".html";
 const html=fs.readFileSync(file,"utf8");
 const photo="assets/records/imported/"+r.id+".jpg";
 if(fs.existsSync(photo)){
   assert.ok(fs.statSync(photo).size>2000,file+": cached photo file empty");
   assert.ok(index.includes('src="'+photo+'"'),file+": gallery not using permanent photo");
   assert.ok(html.includes('src="../'+photo+'"'),file+": detail not using permanent photo");
 }
 assert.ok(index.includes('href="'+file+'"'),file+": missing gallery link");
 assert.ok(html.includes('<!-- LASTFM_START -->'),file+": Last.fm sidebar absent");
 assert.ok(html.includes("record-collection-notes"),file+": original notes not preserved");
 assert.ok(html.includes("record-research"),file+": source provenance not marked");
 assert.ok(html.includes('href="'+r.postUrl+'"'),file+": Instagram source link missing");
 assert.ok(html.includes("catalog-neighbors"),file+": browse controls missing");
 assert.ok(html.includes('id="eggseed-mobile-size"'),file+": responsive view control missing");
 assert.ok(html.includes('src="'+r.image.replaceAll("&","&amp;")+'"') || html.includes('src="../assets/records/imported/'+r.id+'.jpg"'),file+": photo URL missing");
 if(!r.caption)assert.ok(html.includes("has no caption"),file+": empty caption must be marked");
}
console.log("45rpm import OK: 34 image-first items, 34 detail pages, source notes and provenance.");
