const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const C=require(path.join(root,'dist/core.js'));
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'dist/data.js'),'utf8'),sandbox);
const clubs=JSON.parse(JSON.stringify(sandbox.window.PING_CLUBS));
let checks=0;
function check(name,fn){fn();checks++;}
check('Catalog preserves every reviewed ID',()=>assert.equal(new Set(clubs.map(c=>c.id)).size,clubs.length));
for(const cat of C.categories)check(cat.label+' filter',()=>{const rows=C.filterClubs(clubs,{category:cat.id});assert.ok(rows.length>0);assert.ok(rows.every(c=>c.category===cat.id));});
check('Full-width model search',()=>assert.deepEqual(C.filterClubs(clubs,{q:'Ｇ４３０'}).map(c=>c.id),C.filterClubs(clubs,{q:'g430'}).map(c=>c.id)));
check('Multiple search terms',()=>{const rows=C.filterClubs(clubs,{q:'G430 ドライバー MAX'});assert.ok(rows.length>0);assert.ok(rows.every(c=>c.category==='driver'));});
check('Unknown year has its own filter',()=>{const rows=C.filterClubs(clubs,{year:'unknown'});assert.ok(rows.length>0);assert.ok(rows.every(c=>c.year===null));});
check('Known dates precede unknown dates in chronological views',()=>{for(const sort of ['oldest','newest']){const rows=C.filterClubs(clubs,{sort});const i=rows.findIndex(c=>c.year===null);assert.ok(i>0);assert.ok(rows.slice(i).every(c=>c.year===null));const years=rows.slice(0,i).map(c=>c.year);assert.ok(years.every((y,k)=>k===0||(sort==='oldest'?y>=years[k-1]:y<=years[k-1])));}});
check('Decade and category combine',()=>{const rows=C.filterClubs(clubs,{decade:'2020',category:'iron'});assert.ok(rows.length>0);assert.ok(rows.every(c=>c.category==='iron'&&c.year>=2020&&c.year<=2029));});
check('Absent models yield an empty result',()=>assert.equal(C.filterClubs(clubs,{q:'not-a-real-ping-model-xyz'}).length,0));
check('Saved view uses selected IDs only',()=>{const ids=[clubs[0].id,clubs[3].id];assert.deepEqual(new Set(C.filterClubs(clubs,{view:'saved'},ids).map(c=>c.id)),new Set(ids));});
check('Invalid and duplicate persisted IDs are discarded',()=>assert.deepEqual(C.readSaved(JSON.stringify({favorites:[clubs[0].id,clubs[0].id,'invalid'],notes:{[clubs[0].id]:'a'.repeat(3100),invalid:'bad'}}),clubs),{favorites:[clubs[0].id],notes:{[clubs[0].id]:'a'.repeat(3000)}}));
check('Malformed storage does not break loading',()=>assert.deepEqual(C.readSaved('{broken',clubs),{favorites:[],notes:{}}));
check('Comparison is capped at three and remains removable',()=>{const ids=clubs.slice(0,3).map(c=>c.id);const full=C.toggleComparison(ids,clubs[3].id,clubs);assert.equal(full.error,'limit');assert.deepEqual(full.selected,ids);assert.equal(C.toggleComparison(ids,ids[1],clubs).selected.length,2);});
check('URL state round-trips',()=>{const state={...C.defaults,q:'G430 MAX',category:'driver',view:'timeline',decade:'2020',sort:'oldest'};assert.deepEqual(C.stateFromUrl('?'+C.stateToSearch(state),clubs),state);});
check('Invalid URL states fall back to defaults',()=>assert.deepEqual(C.stateFromUrl('?category=bad&view=bad&sort=bad&year=9999&family=bad',clubs),C.defaults));
check('Every generation returns the reviewed set of clubs',()=>{
  const expected={g440:11,g430:11,g425:7,g410:7,g400:8,'g-2016':7,g30:6,g25:4,g20:4,g15:4,g10:4,g5:4,g2:4};
  for(const [generation,count] of Object.entries(expected))assert.equal(C.filterClubs(clubs,{generation}).length,count,generation);
});
check('Generation matching keeps similar model numbers separate',()=>{
  for(const [name,generation] of [['G2','g2'],['G20','g20'],['G25','g25'],['G440 K HL','g440'],['G430 MAX 10K','g430'],['Ｇ４３０ ＬＳＴ','g430'],['G4400',null],['G740',null],['G700',null],['G LE3',null],['G MAX',null],['GLIDE 4.0',null]])assert.equal(C.generationOf({name}),generation,name);
});
check('Original G generation includes its variants without absorbing G LE or G MAX',()=>{
  for(const name of ['G','G (2016)','G LS TEC','G SF TEC','G Crossover'])assert.equal(C.generationOf({name}),'g-2016',name);
  for(const name of ['G LE','G LE2','G MAX'])assert.equal(C.generationOf({name,family:'Gシリーズ',summary:'G430'}),null,name);
});
check('Generation and club category combine',()=>{
  const rows=C.filterClubs(clubs,{generation:'g430',category:'driver'});
  assert.equal(rows.length,5);
  assert.ok(rows.some(c=>c.name==='G430 MAX 10K'));
  assert.ok(rows.every(c=>c.category==='driver'&&c.name.startsWith('G430')));
});
check('Generation links restore their selection and reject unknown generations',()=>{
  const state={...C.defaults,generation:'g425',category:'iron'};
  assert.deepEqual(C.stateFromUrl('?'+C.stateToSearch(state),clubs),state);
  assert.equal(C.filterClubs(clubs,C.stateFromUrl('?generation=g425&category=iron',clubs)).length,1);
  assert.equal(C.stateFromUrl('?generation=g4400',clubs).generation,'all');
  assert.equal(C.stateToSearch(C.defaults),'');
});
check('Notes and labels are HTML escaped',()=>assert.equal(C.escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;'));
check('Photos exist and stay within the shipped asset directory',()=>{for(const c of clubs.filter(c=>c.image)){assert.ok(c.image.startsWith('assets/'));assert.ok(!c.image.includes('..'));assert.ok(fs.existsSync(path.join(root,'dist',c.image)));}});
console.log(JSON.stringify({status:'passed',checks,items:clubs.length}));
