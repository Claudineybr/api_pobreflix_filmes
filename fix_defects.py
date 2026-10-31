import os
import re
import json
from pathlib import Path

def clean_url(url):
    if not url: return url
    url = url.strip()
    
    # Defeito 3: Remove tags HTML (ex: <b></b>)
    url = re.sub(r'<[^>]+>', '', url)
    
    # Defeito 1: Remove texto na frente do endereço (ex: "7 http://...")
    match = re.search(r'(https?://.+?)(?:\s|$)', url)
    if match:
        url = match.group(1)
    else:
        # Defeito 4: Adiciona http:// se não tiver
        if not url.startswith('http'):
            url = 'http://' + url
            
    # Defeito 2: Remove endereço repetido (ex: "http://AAA http://AAA")
    parts = url.split()
    if parts:
        url = parts[0]
        
    return url

def fix_json_file(filepath):
    try:
        content = filepath.read_text(encoding='utf-8')
        match = re.search(r'<script type="application/ld\+json">(.*?)</script>', content, re.DOTALL)
        if not match: return
        
        json_str = match.group(1)
        
        # Defeito 5: Aspas sem escape no título (quebra o JSON)
        try:
            json.loads(json_str)
        except json.JSONDecodeError:
            json_str = re.sub(r'("name":\s*")(.*?)(",\n)', lambda m: m.group(1) + m.group(2).replace('"', '\\"') + m.group(3), json_str)
            json_str = re.sub(r'("description":\s*")(.*?)(",\n|\n})', lambda m: m.group(1) + m.group(2).replace('"', '\\"') + m.group(3), json_str)

        # Aplica os consertos de URL
        def repl_url(m):
            return f'"{m.group(1)}": "{clean_url(m.group(2))}"'
        
        json_str = re.sub(r'"(contentUrl|embedUrl)":\s*"([^"]*)"', repl_url, json_str)
        
        # Valida o JSON final
        data = json.loads(json_str)
        new_json_str = json.dumps(data, ensure_ascii=False, indent=2)
        
        new_content = content.replace(match.group(1), new_json_str)
        filepath.write_text(new_content, encoding='utf-8')
        print(f"[OK] Consertado: {filepath.name}")
    except Exception as e:
        print(f"[ERRO] Falha ao consertar {filepath.name}: {e}")

for filepath in Path('.').glob('*.json'):
    if any(x in filepath.name for x in ['pendentes', 'fila', 'feitas', 'descartados', 'cache']):
        continue
    fix_json_file(filepath)
