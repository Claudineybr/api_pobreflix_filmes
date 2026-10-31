import re
from pathlib import Path

def clean_url(url):
    if not url: return url
    url = url.strip()
    url = re.sub(r'<[^>]+>', '', url)
    match = re.search(r'(https?://[^\s"]+)', url)
    if match:
        url = match.group(1)
    elif not url.startswith('http'):
        url = 'http://' + url
    parts = url.split()
    if parts: url = parts[0]
    return url

for filepath in Path('.').glob('*.json'):
    if any(x in filepath.name for x in ['pendentes', 'fila', 'feitas', 'descartados', 'cache']): continue
    try:
        content = filepath.read_text(encoding='utf-8')
        original = content
        
        # Conserta as URLs de forma segura
        def repl_url(m):
            return f'"{m.group(1)}": "{clean_url(m.group(2))}"'
        content = re.sub(r'"(contentUrl|embedUrl)":\s*"([^"]*)"', repl_url, content)
        
        if content != original:
            filepath.write_text(content, encoding='utf-8')
    except Exception: pass
