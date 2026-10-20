"""2003-10 時点の PING 米国公式 classics: 既知の hero 画像を優先して順次取得し、残りのページも取る（作業用）。ログは tmp/archive/log.txt。"""
import os, re, json, time, urllib.request, urllib.parse
from html.parser import HTMLParser
TS='20031012124115'; BASE='http://www.pinggolf.com/classics/'; OUT='tmp/archive'
UA={'User-Agent':'Mozilla/5.0 (GOLF GUTS archive maintenance)'}
os.makedirs(OUT,exist_ok=True); LOG=open(os.path.join(OUT,'log.txt'),'a')
def log(*a):
    s=' '.join(str(x) for x in a); print(s,flush=True); LOG.write(s+'\n'); LOG.flush()
def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=45) as r:
                return r.read() if binary else r.read().decode('utf-8','replace')
        except Exception as e:
            err=e; log('retry',i+1,url,repr(e)[:120]); time.sleep(5+5*i)
    log('FAIL',url,repr(err)[:120]); return None
KNOWN_IMGS=['irons/images/hero_eye2.jpg','irons/images/hero_zing.jpg','irons/images/hero_zing2.jpg','irons/images/hero_isi.jpg','irons/images/hero_i3.jpg',
            'irons/images/hero_eye.jpg','irons/images/hero_karsten.jpg','irons/images/hero_zing2wedges.jpg',
            'woods/images/hero_tisi.jpg','woods/images/hero_tisitec.jpg','woods/images/hero_eye2.jpg','woods/images/hero_eye.jpg','woods/images/hero_karsten.jpg','woods/images/hero_zing.jpg','woods/images/hero_zing2.jpg','woods/images/hero_ti3fairway.jpg']
PAGES=['irons/eye.html','irons/karsten.html','irons/zing2wedges.html','woods/eye2.html','woods/eye.html','woods/karsten.html','woods/zing.html','woods/zing2.html','woods/ti3fairway.html','putters/bronze.html','putters/stainless.html','putters/home.html','putters/misc.html']
report=json.load(open(os.path.join(OUT,'report.json'))) if os.path.exists(os.path.join(OUT,'report.json')) else []
have={r['img'] for r in report}
def save_img(full, page='', alt=''):
    if full in have: return
    data=get(f'https://web.archive.org/web/{TS}im_/{full}',binary=True)
    if data and len(data)>800 and data[:4]!=b'<!DO' and b'<html' not in data[:200].lower():
        name=re.sub(r'[^A-Za-z0-9._-]+','_',full.split('pinggolf.com')[-1])[-100:]
        folder=os.path.join(OUT,'images'); os.makedirs(folder,exist_ok=True)
        open(os.path.join(folder,name),'wb').write(data)
        report.append({'page':page,'img':full,'alt':alt,'bytes':len(data),'file':os.path.join(folder,name)}); have.add(full)
        json.dump(report,open(os.path.join(OUT,'report.json'),'w'),ensure_ascii=False,indent=1)
        log('IMG',full,len(data))
    time.sleep(2)
class P(HTMLParser):
    def __init__(s): super().__init__(); s.img=[]
    def handle_starttag(s,tag,a):
        d=dict(a)
        if tag=='img' and d.get('src'): s.img.append((d['src'],d.get('alt','')))
for rel in KNOWN_IMGS: save_img(BASE+rel)
for rel in PAGES:
    u=BASE+rel; html=get(f'https://web.archive.org/web/{TS}id_/{u}')
    if not html: continue
    folder=os.path.join(OUT,rel.replace('/','_')); os.makedirs(folder,exist_ok=True)
    open(os.path.join(folder,'page.html'),'w',encoding='utf-8').write(html)
    p=P(); p.feed(html); extra=re.findall(r'["\']([^"\']+\.(?:jpg|png))["\']',html)
    srcs=[(s,a) for s,a in p.img]+[(e,'') for e in extra]
    log('PAGE',rel,'imgs',len(srcs))
    for src,alt in srcs:
        if 'shim' in src or 'menu_' in src: continue
        full=urllib.parse.urljoin(u,src)
        if 'pinggolf.com' in full: save_img(full,rel,alt)
log('done images',len(report))
