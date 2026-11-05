import cairosvg, io, json, base64
from PIL import Image

F_RED="#C8232B"; F_ACC="#F5A623"; F_INK="#0B0A0D"; F_CREAM="#FFF4E2"
T_RED="#9E1B14"; T_GOLD="#C9A24B"; T_NAVY="#0F1524"

def wrap(inner, bg):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{bg}"/>{inner}</svg>'

# Feast: lantern, tuned so the gold caps survive 16px
feast = wrap(f'''
<path d="M32 4.5v6.2" stroke="{F_ACC}" stroke-width="3.6" stroke-linecap="butt"/>
<rect x="20" y="10.5" width="24" height="6.4" fill="{F_ACC}"/>
<path d="M20.6 16.9h22.8c5.9 7 5.9 23.2 0 30.2H20.6c-5.9-7-5.9-23.2 0-30.2z" fill="{F_RED}"/>
<path d="M26.9 21.4c-2.5 6.7-2.5 16.5 0 23.2" stroke="{F_CREAM}" stroke-width="2.6" opacity=".5" fill="none"/>
<rect x="20.6" y="47.1" width="22.8" height="6.4" fill="{F_ACC}"/>
<path d="M32 53.5v5" stroke="{F_ACC}" stroke-width="3.4"/>
<path d="M27.2 58.5h9.6L32 64z" fill="{F_ACC}"/>
''', F_INK)

# ToC: gold TC inside the red lacquer seal on navy
toc = wrap(f'''
<rect x="4" y="4" width="56" height="56" fill="{T_RED}"/>
<rect x="7.5" y="7.5" width="49" height="49" fill="none" stroke="{T_GOLD}" stroke-width="1.8"/>
<path d="M13.5 20h20.4v5.6h-7.1V45h-6.2V25.6h-7.1z" fill="{T_GOLD}"/>
<path d="M53 26.6h-5.2v-1.5c0-2-1.2-3.1-3.4-3.1s-3.4 1.2-3.4 3.6v13.6c0 2.4 1.2 3.6 3.4 3.6s3.4-1.1 3.4-3.1v-1.8H53v1.4c0 5.4-3.3 8.9-8.6 8.9s-8.6-3.6-8.6-9.6v-13c0-6 3.3-9.6 8.6-9.6S53 19.5 53 25.2z" fill="{T_GOLD}"/>
''', T_NAVY)

svgs={"feast":feast,"toc":toc}
out={}
for k,svg in svgs.items():
    out[k]={"svg":svg}
    for px,name in [(180,'apple'),(32,'32'),(16,'16')]:
        png=cairosvg.svg2png(bytestring=svg.encode(),output_width=px,output_height=px)
        open(f'{k}-{name}.png','wb').write(png)
        out[k][name]=base64.b64encode(png).decode()
    open(f'{k}.svg','w').write(svg)
json.dump(out,open('icons.json','w'))
print({k:{kk:(len(vv) if kk!='svg' else 'svg') for kk,vv in v.items()} for k,v in out.items()})
