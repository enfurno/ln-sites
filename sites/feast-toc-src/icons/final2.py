import cairosvg, io, json, base64
from PIL import Image

F_RED="#C8232B"; F_ACC="#F5A623"; F_INK="#0B0A0D"; F_CREAM="#FFF4E2"
T_RED="#9E1B14"; T_GOLD="#C9A24B"; T_NAVY="#0F1524"; T_CREAM="#F3E9D2"

def wrap(inner,bg): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{bg}"/>{inner}</svg>'

# ---------- Feast: lantern ----------
feast = wrap(f'''
<path d="M32 3.2v6.4" stroke="{F_ACC}" stroke-width="4"/>
<rect x="19" y="9.6" width="26" height="7" fill="{F_ACC}"/>
<path d="M20.4 16.6h23.2c6 7.2 6 23.6 0 30.8H20.4c-6-7.2-6-23.6 0-30.8z" fill="{F_RED}"/>
<path d="M27.4 21.6c-2.4 6.8-2.4 16.6 0 23.4" stroke="{F_CREAM}" stroke-width="3" opacity=".55" fill="none"/>
<rect x="20.4" y="47.4" width="23.2" height="7" fill="{F_ACC}"/>
<path d="M32 54.4v5.4" stroke="{F_ACC}" stroke-width="3.6"/>
<path d="M26.6 59.8h10.8L32 64z" fill="{F_ACC}"/>''', F_INK)

# ---------- ToC: cream TC inside the red seal, gold keyline, navy ground ----------
toc = wrap(f'''
<rect x="4" y="4" width="56" height="56" fill="{T_RED}"/>
<rect x="4" y="4" width="56" height="56" fill="none" stroke="{T_GOLD}" stroke-width="3.2"/>
<path d="M8.6 14.6h24.6v9.4h-7.7V48h-9.2V24H8.6z" fill="{T_CREAM}"/>
<path d="M57 25.2h-7v-2.8c0-2.4-1.5-3.9-4.1-3.9s-4.1 1.6-4.1 4.5v18.6c0 2.9 1.5 4.5 4.1 4.5s4.1-1.5 4.1-3.9v-3h7v3.4c0 7-4.5 11.3-11.1 11.3s-11.1-4.5-11.1-12.2V24.5c0-7.7 4.5-12.2 11.1-12.2S57 16.7 57 23.6z" fill="{T_CREAM}"/>''', T_NAVY)

# ---------- hand-set 16px pixel masters ----------
def px(n, spec):
    im = Image.new('RGB',(n,n),spec['bg']); p = im.load()
    def rect(x0,y0,x1,y1,c):
        for y in range(y0,y1+1):
            for x in range(x0,x1+1): p[x,y]=c
    for r in spec['rects']: rect(*r)
    return im

def scale_rects(rects, s):
    out=[]
    for x0,y0,x1,y1,c in rects:
        out.append((int(round(x0*s)),int(round(y0*s)),int(round(x1*s)),int(round(y1*s)),c))
    return out

FEAST_PX = {
 'bg': (11,10,13),
 'rects': [
   (7,0,8,0,(245,166,35)),          # hanger
   (4,1,11,2,(245,166,35)),         # top cap
   (3,3,12,11,(200,35,43)),         # body
   (5,4,5,10,(255,244,226)),        # sheen
   (4,12,11,13,(245,166,35)),       # bottom cap
   (7,14,8,15,(245,166,35)),        # tassel
 ]}
TOC_PX = {
 'bg': (15,21,36),
 'rects': [
   (0,0,15,15,(201,162,75)),        # gold ring
   (1,1,14,14,(15,21,36)),          # navy
   (2,2,13,13,(158,27,20)),         # red field
   (3,4,7,5,(243,233,210)),         # T bar
   (4,6,5,12,(243,233,210)),        # T stem
   (9,4,13,5,(243,233,210)),        # C top
   (9,6,10,12,(243,233,210)),       # C stem
   (9,11,13,12,(243,233,210)),      # C bottom
 ]}

out={}
for k,svg,spec,bg in (('feast',feast,FEAST_PX,F_INK),('toc',toc,TOC_PX,T_NAVY)):
    out[k]={'svg':svg}
    # large sizes from the vector
    for px_size,name in ((180,'apple'),(512,'512'),(48,'48'),(32,'32')):
        png=cairosvg.svg2png(bytestring=svg.encode(),output_width=px_size,output_height=px_size)
        open(f'{k}-{name}.png','wb').write(png)
        out[k][name]=base64.b64encode(png).decode()
    # 16px: hand-set grid (crisper than any downsample)
    im=px(16,spec); im.save(f'{k}-16.png')
    out[k]['16']=base64.b64encode(open(f'{k}-16.png','rb').read()).decode()
    open(f'{k}.svg','w').write(svg)

# multi-resolution .ico: hand-set 16, vector 32 and 48
for k,svg,spec in (('feast',feast,FEAST_PX),('toc',toc,TOC_PX)):
    ims=[px(16,spec)]
    for s in (32,48):
        ims.append(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(),output_width=s,output_height=s))).convert('RGB'))
    ims[0].save(f'{k}.ico',sizes=[(16,16),(32,32),(48,48)],append_images=ims[1:])
json.dump(out,open('icons.json','w'))
print({k:{kk:len(vv) for kk,vv in v.items()} for k,v in out.items()})
