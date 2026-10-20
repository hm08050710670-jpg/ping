"""CDX API で hero 画像が保存された時点を探し、その時点から取得する（作業用）。ログ: tmp/archive/log.txt"""
import os, re, json, time, urllib.request
OUT='tmp/archive'; os.makedirs(OUT+'/images',exist_ok=True)
UA={'User-Agent':'Mozilla/5.0 (GOLF GUTS archive maintenance)'}
LOG=open(OUT+'/log.txt','w')
def log(*a):
    s=' '.join(map(str,a)); print(s,flush=True); LOG.write(s+'\n'); LOG.flush()
def get(url,binary=False,tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=60) as r:
                return r.read() if binary else r.read().decode('utf-8','replace')
        except Exception as e: err=e; time.sleep(8)
    log('FAIL',url,repr(err)[:100]); return None
TARGETS=['www.pinggolf.com/classics/irons/images/hero_eye2.jpg','www.pinggolf.com/classics/irons/images/hero_zing.jpg','www.pinggolf.com/classics/irons/images/hero_zing2.jpg',
 'www.pinggolf.com/classics/irons/images/hero_isi.jpg','www.pinggolf.com/classics/irons/images/hero_i3.jpg','www.pinggolf.com/classics/woods/images/hero_tisi.jpg','www.pinggolf.com/classics/woods/images/hero_tisitec.jpg',
 'www.pinggolf.com/classics/irons/images/hero_eye.jpg','www.pinggolf.com/classics/irons/images/hero_karsten.jpg','www.pinggolf.com/classics/woods/images/hero_ti3fairway.jpg']
report=[]
for t in TARGETS:
    cdx=get(f'https://web.archive.org/cdx/search/cdx?url={t}&output=json&filter=statuscode:200&fl=timestamp,mimetype,length&limit=5')
    log('CDX',t,(cdx or '')[:300].replace('\n',' '))
    rows=[]
    try: rows=json.loads(cdx)[1:] if cdx else []
    except Exception as e: log('cdx-parse-fail',t,e)
    for ts,mime,length in rows:
        if not mime.startswith('image'): continue
        data=get(f'https://web.archive.org/web/{ts}im_/http://{t}',binary=True)
        if data and len(data)>800 and b'<html' not in data[:300].lower():
            name=re.sub(r'[^A-Za-z0-9._-]+','_',t.split('pinggolf.com')[-1])
            open(f'{OUT}/images/{name}','wb').write(data)
            report.append({'img':t,'ts':ts,'bytes':len(data),'file':f'{OUT}/images/{name}'})
            log('IMG',t,ts,len(data)); break
        else: log('bad-payload',t,ts,len(data) if data else None)
    time.sleep(2)
json.dump(report,open(OUT+'/report.json','w'),indent=1)
log('done',len(report))
