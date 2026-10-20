const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
require(path.join(root,'dist/core.js'));
const L=require(path.join(root,'dist/lofts.js'));
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'dist/data.js'),'utf8'),sandbox);
const clubs=JSON.parse(JSON.stringify(sandbox.window.PING_CLUBS));
const byId=new Map(clubs.map(c=>[c.id,c]));
let checks=0;
function check(name,fn){fn();checks++;}
check('Main G generation lofts and their differing pitching wedges',()=>{
  for(const [id,seven,pw] of [['iron-g440',29,42],['iron-g430',29,41],['iron-g425',30,44.5],['iron-g410',30,44.5]]){
    assert.equal(L.getLoft(byId.get(id)),seven,id);
    assert.equal(L.getLoft(byId.get(id),'PW'),pw,id);
  }
});
check('Published decimal values are retained without rounding',()=>{
  for(const [id,value] of [['iron-g30',30.5],['iron-g2',34.3],['iron-s56',34.25],['iron-anser-forged',33.5]]){
    assert.equal(L.getLoft(byId.get(id)),value,id);
    assert.ok(L.badge(byId.get(id)).includes(value+'°'),id);
  }
});
check('Unconfirmed lofts remain visibly unconfirmed',()=>{
  const c=byId.get('iron-karsten1');
  assert.equal(L.getLoft(c),null);
  assert.ok(L.badge(c).includes('未確認'));
  assert.ok(L.detail(c).includes('公式資料を確認できていません'));
  assert.ok(L.comparison(c).includes('未確認'));
  assert.ok(!L.comparison(c).includes('0°'));
});
check('Other club categories do not receive iron loft displays',()=>{
  const c=clubs.find(c=>c.category==='driver');
  assert.equal(L.badge(c),'');
  assert.equal(L.detail(c),'');
  assert.equal(L.comparison(c),'対象外');
});
check('Power lofts are distinguished from Japanese published specifications',()=>{
  for(const id of ['iron-g700','iron-g710','iron-i500','iron-i525']){
    const c=byId.get(id);
    assert.equal(L.basisLabel(c),'パワーロフト');
    assert.ok(!L.badge(c).includes('標準'));
    assert.ok(L.comparison(c).includes('パワーロフト'));
  }
  assert.equal(L.basisLabel(byId.get('iron-g440')),'日本公式仕様');
});
check('All researched rows, sources, and manufacture notes are rendered',()=>{
  for(const c of clubs.filter(c=>c.ironLofts)){
    const detail=L.detail(c);
    assert.equal((detail.match(/<th scope="row">/g)||[]).length,c.ironLofts.clubs.length,c.id);
    for(const r of c.ironLofts.clubs)assert.ok(detail.includes('<td>'+r.loft+'°</td>'),c.id+' '+r.club);
    for(const source of c.ironLofts.sourceUrls)assert.ok(detail.includes(globalThis.ArchiveCore.escapeHtml(source.url)),c.id);
    if(c.ironLofts.note)assert.ok(detail.includes(globalThis.ArchiveCore.escapeHtml(c.ironLofts.note)),c.id);
    assert.ok(L.badge(c).includes(L.getLoft(c)+'°'),c.id);
    assert.ok(L.comparison(c).includes(L.getLoft(c)+'°'),c.id);
  }
});
check('Different wedge labels are retained exactly as published',()=>{
  assert.deepEqual(L.rows(byId.get('iron-g430')).slice(-4).map(r=>r.club),['45','50','54','58']);
  assert.deepEqual(L.rows(byId.get('iron-g440')).slice(-3).map(r=>r.club),['UW','52','56']);
  assert.deepEqual(L.rows(byId.get('iron-i3')).slice(-4).map(r=>r.club),['W','U','S','L']);
});
console.log(JSON.stringify({status:'passed',checks,ironModels:clubs.filter(c=>c.category==='iron').length,modelsWithLofts:clubs.filter(c=>c.ironLofts).length,loftRows:clubs.reduce((n,c)=>n+L.rows(c).length,0)}));
