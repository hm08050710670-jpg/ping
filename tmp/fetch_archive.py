"""2003-10 時点の PING 米国公式 classics の対象ページと hero 画像を並列取得する（作業用）。"""
import os, re, json, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
TS='20031012124115'; BASE='http://www.pinggolf.com/classics/'
PAGES=['irons/eye.html','irons/eye2.html','irons/zing.html','irons/zing2.html','irons/zing2wedges.html','irons/karsten.html','irons/isi.html','irons/i3.html',
       'woods/tisi.html','woods/tisitec.html','woods/ti3fairway.html','woods/eye2.html','woods/eye.html','woods/karsten.html','woods/zing.html','woods/zing2.html',
       'putters/bronze.html','putters/stainless.html','putters/home.html','putters/misc.html','putters/isoforce.html','putters/isopur.html']
OUT='tmp/archive'; UA={'User-Agent':'Mozilla/5.0 (GOLF GUTS archive maintenance)'}
def get(url, binary=False):
    for i in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=40) as r:
                return r.read() if binary else r.read().decode('utf-8','replace')
        except Exception as e: err=e; time.sleep(2)
    print('FAIL',url,err,flush=True); return None
class P(HTMLParser):
    def __init__(s): super().__init__(); s.img=[]; s.txt=[]
    def handle_starttag(s,tag,a):
        d=dict(a)
        if tag=='img' and d.get('src'): s.img.append((d['src'],d.get('alt','')))
    def handle_data(s,d): s.txt.append(d)
def page(rel):
    u=BASE+rel; html=get(f'https://web.archive.org/web/{TS}id_/{u}')
    if not html: return []
    folder=os.path.join(OUT,rel.replace('/','_')); os.makedirs(folder,exist_ok=True)
    open(os.path.join(folder,'page.html'),'w',encoding='utf-8').write(html)
    p=P(); p.feed(html)
    # also pick image names referenced in scripts (putter pages swap images via JS)
    extra=re.findall(r'["\']([^"\']+\.(?:jpg|gif|png))["\']',html)
    srcs=[(s,a) for s,a in p.img]+[(e,'') for e in extra]
    out=[]
    for src,alt in srcs:
        if 'shim' in src or 'menu_' in src: continue
        full=urllib.parse.urljoin(u,src)
        if 'pinggolf.com' not in full: continue
        out.append((rel,folder,full,alt))
    print('PAGE',rel,'imgs',len(out),flush=True); return out
def img(t):
    rel,folder,full,alt=t
    data=get(f'https://web.archive.org/web/{TS}im_/{full}',binary=True)
    if data and len(data)>800:
        name=re.sub(r'[^A-Za-z0-9._-]+','_',full.split('pinggolf.com')[-1])[-100:]
        open(os.path.join(folder,name),'wb').write(data)
        print('IMG',rel,full,len(data),flush=True)
        return {'page':rel,'img':full,'alt':alt,'bytes':len(data),'file':os.path.join(folder,name)}
os.makedirs(OUT,exist_ok=True)
with ThreadPoolExecutor(6) as ex:
    targets=[t for lst in ex.map(page,PAGES) for t in lst]
    seen=set(); uniq=[t for t in targets if not (t[2] in seen or seen.add(t[2]))]
    report=[r for r in ex.map(img,uniq) if r]
json.dump(report,open(os.path.join(OUT,'report.json'),'w'),ensure_ascii=False,indent=1)
print('done pages',len(PAGES),'images',len(report),flush=True)
