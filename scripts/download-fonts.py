"""Keep the requested Google Fonts local, including their Unicode subsets and licenses."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'dist/assets/fonts'
DEST.mkdir(parents=True, exist_ok=True)
CSS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300..700&family=Poppins:wght@300;400;500;600&display=swap'
HEADERS = {'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'}


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as response:
        return response.read()


css = fetch(CSS_URL).decode()
urls = list(dict.fromkeys(re.findall(r'url\((https://[^)]+)\)', css)))
mapping = {url: ('noto-sans-jp' if '/notosansjp/' in url else 'poppins') + '-%03d.woff2' % i for i, url in enumerate(urls, 1)}


def download(url):
    path = DEST / mapping[url]
    content = fetch(url)
    assert content[:4] == b'wOF2', url
    path.write_bytes(content)
    return len(content)


with ThreadPoolExecutor(max_workers=8) as pool:
    sizes = list(pool.map(download, urls))
for url, name in mapping.items():
    css = css.replace(url, 'assets/fonts/' + name)
(ROOT / 'dist/fonts.css').write_text('/* Google Fonts, self-hosted. Licenses: assets/fonts/*-OFL.txt. */\n' + css)
for folder, filename in [('notosansjp', 'Noto-Sans-JP-OFL.txt'), ('poppins', 'Poppins-OFL.txt')]:
    (DEST / filename).write_bytes(fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/' + folder + '/OFL.txt'))
print({'font_files': len(urls), 'font_bytes': sum(sizes), 'css_bytes': len(css.encode()), 'licenses': 2})
