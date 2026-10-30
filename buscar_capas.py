import os
import re
import json
import requests
import time
import sys
from bs4 import BeautifulSoup
from pathlib import Path

TMDB_API_KEY = os.environ.get("TMDB_API_KEY")
if not TMDB_API_KEY:
    print("ERRO: TMDB_API_KEY nao configurada nos Secrets do GitHub.")
    sys.exit(1)

ARQ_PROCESSADOS = Path("capas_processadas.txt")
processados = set()
if ARQ_PROCESSADOS.exists():
    processados = set(line.strip() for line in ARQ_PROCESSADOS.read_text(encoding="utf-8").splitlines() if line.strip())

arquivos = list(Path(".").glob("*.json"))
faltam = [f for f in arquivos if f.name not in processados]

# Limita o lote para nao estourar tempo/API por run
lote = faltam[:1000]

print(f"Total de JSONs: {len(arquivos)} | Ja processados: {len(processados)} | Restantes: {len(faltam)}")
print(f"Processando lote de {len(lote)} arquivos...")

def buscar_capa_tmdb(titulo, ano):
    url = f"https://api.themoviedb.org/3/search/movie?api_key={TMDB_API_KEY}&language=pt-BR&query={requests.utils.quote(titulo)}&year={ano}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            dados = r.json()
            if dados.get("results"):
                poster_path = dados["results"][0].get("poster_path")
                if poster_path:
                    return f"https://image.tmdb.org/t/p/w500{poster_path}"
    except: pass
    return None

contador = 0
for arquivo in lote:
    try:
        conteudo = arquivo.read_text(encoding="utf-8")
        
        # Se ja tem capa do TMDB, pula
        if "image.tmdb.org" in conteudo:
            with open(ARQ_PROCESSADOS, "a", encoding="utf-8") as f:
                f.write(arquivo.name + "\n")
            continue

        # Extrai o JSON de dentro do HTML
        soup = BeautifulSoup(conteudo, "html.parser")
        script_tag = soup.find("script", type="application/ld+json")
        if not script_tag: continue
        
        dados = json.loads(script_tag.string)
        nome_json = dados.get("name", "")
        
        # Extrai titulo e ano usando Regex (ex: "A Hipótese do Amor (2026) - 🍿Clau")
        match = re.search(r'^(.*?)\s*\((\d{4})\)\s*-', nome_json)
        if not match: 
            match = re.search(r'^(.*?)\s*-', nome_json)
            if not match: continue
            titulo = match.group(1).strip()
            ano = ""
        else:
            titulo = match.group(1).strip()
            ano = match.group(2)

        if not titulo: continue

        print(f"Buscando: {titulo} ({ano})...", end=" ")
        
        capa_url = buscar_capa_tmdb(titulo, ano)
        if capa_url:
            print("ACHEI!")
            dados["thumbnailUrl"] = [capa_url]
            novo_json_str = json.dumps(dados, ensure_ascii=False, indent=2)
            
            # Substitui no HTML original mantendo a estrutura
            novo_html = conteudo.replace(script_tag.string, novo_json_str)
            arquivo.write_text(novo_html, encoding="utf-8")
            contador += 1
        else:
            print("NAO ACHOU")
        
        # Marca como processado para nao tentar de novo
        with open(ARQ_PROCESSADOS, "a", encoding="utf-8") as f:
            f.write(arquivo.name + "\n")

        time.sleep(0.2) # Rate Limit do TMDB
    except Exception as e:
        print(f"Erro no arquivo {arquivo.name}: {e}")

print(f"\nFinalizado! {contador} capas adicionadas.")
