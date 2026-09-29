# -*- coding: utf-8 -*-
"""Gera seed.sql com a configuração, RNCs, ações e fotos atuais do app Streamlit (pasta app/data).
Uso:  python gerar_seed.py [pasta_data]   (padrão: ../../app/data)
Depois execute seed.sql no SQL Editor do Supabase (após schema.sql). Usuários NÃO são migrados
(senhas em PBKDF2); recrie-os no painel Administração do web app."""
import base64, json, mimetypes, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "..", "..", "app", "data")
CONFIG = ["setores", "setor_params", "parametros", "colaboradores", "centros_custo", "maquinas", "pecas"]


def q(v):
    return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def s(v):
    return "'" + str(v).replace("'", "''") + "'"


def ler(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


out = ["-- gerado por gerar_seed.py", "begin;"]
for k in CONFIG:
    p = os.path.join(DATA, "config", k + ".json")
    if os.path.exists(p):
        out.append(f"insert into config(chave, valor) values ({s(k)}, {q(ler(p))}) "
                   "on conflict (chave) do update set valor = excluded.valor;")
for col in ("rnc", "acoes"):
    d = os.path.join(DATA, col)
    for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if fn.endswith(".json"):
            r = ler(os.path.join(d, fn))
            out.append(f"insert into {col}(id, dados, versao) values ({s(r['id'])}, {q(r)}, {int(r.get('versao') or 1)}) "
                       "on conflict (id) do update set dados = excluded.dados, versao = excluded.versao;")
fd = os.path.join(DATA, "fotos")
for rid in sorted(os.listdir(fd)) if os.path.isdir(fd) else []:
    for fn in sorted(os.listdir(os.path.join(fd, rid))):
        mime = mimetypes.guess_type(fn)[0] or "image/jpeg"
        with open(os.path.join(fd, rid, fn), "rb") as f:
            url = f"data:{mime};base64," + base64.b64encode(f.read()).decode("ascii")
        out.append(f"insert into fotos(rnc_id, nome, conteudo) select {s(rid)}, {s(fn)}, {s(url)} "
                   f"where exists(select 1 from rnc where id = {s(rid)});")
out.append("commit;")
with open(os.path.join(BASE, "seed.sql"), "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
print(f"seed.sql gerado ({len(out) - 3} comandos).")
