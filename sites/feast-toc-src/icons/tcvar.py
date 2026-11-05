import cairosvg, io
from PIL import Image
T_RED="#9E1B14"; T_GOLD="#C9A24B"; T_NAVY="#0F1524"
def wrap(inner,bg): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{bg}"/>{inner}</svg>'

A = wrap(f'''<rect x="4" y="4" width="56" height="56" fill="{T_RED}"/>
<rect x="7.5" y="7.5" width="49" height="49" fill="none" stroke="{T_GOLD}" stroke-width="1.8"/>
<path d="M13.5 20h20.4v5.6h-7.1V45h-6.2V25.6h-7.1z" fill="{T_GOLD}"/>
<path d="M53 26.6h-5.2v-1.5c0-2-1.2-3.1-3.4-3.1s-3.4 1.2-3.4 3.6v13.6c0 2.4 1.2 3.6 3.4 3.6s3.4-1.1 3.4-3.1v-1.8H53v1.4c0 5.4-3.3 8.9-8.6 8.9s-8.6-3.6-8.6-9.6v-13c0-6 3.3-9.6 8.6-9.6S53 19.5 53 25.2z" fill="{T_GOLD}"/>''', T_NAVY)

# B: bigger, bolder letters, frame pulled to edge
B = wrap(f'''<rect x="2" y="2" width="60" height="60" fill="{T_RED}"/>
<rect x="5" y="5" width="54" height="54" fill="none" stroke="{T_GOLD}" stroke-width="2"/>
<path d="M10.5 17.5h24v7.2h-8V48h-8V24.7h-8z" fill="{T_GOLD}"/>
<path d="M57 25.4h-6.4v-2c0-2.4-1.5-3.7-4.1-3.7s-4.1 1.5-4.1 4.3v16c0 2.9 1.5 4.3 4.1 4.3s4.1-1.3 4.1-3.7v-2.2H57v1.8c0 6.4-3.9 10.4-10.2 10.4s-10.2-4.2-10.2-11.3V24.6c0-7.1 3.9-11.3 10.2-11.3S57 17.2 57 23.7z" fill="{T_GOLD}"/>''', T_NAVY)

# C: no inner frame, letters fill the seal
C = wrap(f'''<rect x="2" y="2" width="60" height="60" fill="{T_RED}"/>
<path d="M7 15h27v8.4h-9V51h-9V23.4H7z" fill="{T_GOLD}"/>
<path d="M60 24h-7.2v-2.4c0-2.8-1.7-4.3-4.6-4.3s-4.6 1.7-4.6 4.9v18c0 3.2 1.7 4.9 4.6 4.9s4.6-1.5 4.6-4.3V38H60v2c0 7.2-4.4 11.7-11.4 11.7s-11.4-4.7-11.4-12.7V23c0-8 4.4-12.7 11.4-12.7S60 15 60 22.3z" fill="{T_GOLD}"/>''', T_NAVY)

Z=7; rows=[]
for s in (A,B,C):
    row=Image.new('RGB',(4*(16*Z+16)+16,16*Z+28),(240,240,240)); x=16
    for sz in [16,24,32,48]:
        png=cairosvg.svg2png(bytestring=s.encode(),output_width=sz,output_height=sz)
        im=Image.open(io.BytesIO(png)).convert('RGB').resize((16*Z,16*Z),Image.NEAREST)
        row.paste(im,(x,14)); x+=16*Z+16
    rows.append(row)
W=max(r.width for r in rows); H=sum(r.height for r in rows)+20
sh=Image.new('RGB',(W,H),(240,240,240)); y=0
for r in rows: sh.paste(r,(0,y)); y+=r.height+10
sh.save('tcvar.png'); print(sh.size)
# save B and C for reference
open('tc-B.svg','w').write(B); open('tc-C.svg','w').write(C)
