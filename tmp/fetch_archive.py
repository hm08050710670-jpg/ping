"""Web アーカイブ上の PING 米国公式 classics ページから、ページ HTML と画像を取得する（作業用）。"""
import os, re, sys, time, json, urllib.request, urllib.parse
from html.parser import HTMLParser

OUT = 'tmp/archive'
UA = {'User-Agent': 'Mozilla/5.0 (GOLF GUTS archive maintenance; contact: site owner)'}
SEEDS = [
    'http://www.pinggolf.com/classics/',
    'http://www.pinggolf.com/classics/irons/',
    'http://www.pinggolf.com/classics/irons/eye2.html',
    'http://www.pinggolf.com/classics/putters/',
    'http://www.pinggolf.com/classics/woods/',
    'http://www.pinggolf.com/classics/metalwoods/',
]
TIMESTAMPS = ['20031012124115', '20020601000000', '20041201000000', '20060601000000']

def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read() if binary else r.read().decode('utf-8', 'replace')
        except Exception as e:
            err = e; time.sleep(3 * (i + 1))
    print('FAIL', url, err); return None

class Links(HTMLParser):
    def __init__(self): super().__init__(); self.a=[]; self.img=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if tag=='a' and d.get('href'): self.a.append(d['href'])
        if tag=='img' and d.get('src'): self.img.append((d['src'], d.get('alt','')))

def wb(ts, url, raw=True):
    return f'https://web.archive.org/web/{ts}{"id_" if raw else ""}/{url}'

def strip_wb(u):
    m = re.match(r'https?://web\.archive\.org/web/\d+(?:id_|im_)?/(.*)', u)
    return m.group(1) if m else u

seen_pages=set(); seen_imgs=set(); report=[]
queue=[(ts,u) for ts in TIMESTAMPS for u in SEEDS]
while queue:
    ts,u = queue.pop(0)
    key=(ts,u)
    if key in seen_pages: continue
    seen_pages.add(key)
    html = get(wb(ts,u))
    if not html: continue
    p=Links(); p.feed(html)
    folder=os.path.join(OUT, ts, re.sub(r'[^A-Za-z0-9._-]+','_',u)[:120])
    os.makedirs(folder, exist_ok=True)
    open(os.path.join(folder,'page.html'),'w',encoding='utf-8').write(html)
    base=u
    for href in p.a:
        full=strip_wb(urllib.parse.urljoin(base, href))
        if 'pinggolf.com' in full and '/classics/' in full and full.split('#')[0].lower().endswith(('/', '.html', '.htm')):
            if len(seen_pages) < 120: queue.append((ts, full.split('#')[0]))
    for src,alt in p.img:
        full=strip_wb(urllib.parse.urljoin(base, src))
        if 'pinggolf.com' not in full: continue
        if (ts,full) in seen_imgs: continue
        seen_imgs.add((ts,full))
        name=re.sub(r'[^A-Za-z0-9._-]+','_',full.split('pinggolf.com')[-1])[-100:]
        data=get(wb(ts,full), binary=True)
        if data and len(data) > 1500:
            open(os.path.join(folder,name),'wb').write(data)
            report.append({'ts':ts,'page':u,'img':full,'alt':alt,'bytes':len(data),'file':os.path.join(folder,name)})
    time.sleep(1)
json.dump(report, open(os.path.join(OUT,'report.json'),'w'), ensure_ascii=False, indent=1)
print('pages',len(seen_pages),'images',len(report))
