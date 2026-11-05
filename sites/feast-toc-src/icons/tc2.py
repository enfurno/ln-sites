import cairosvg, io
from PIL import Image
T_RED="#9E1B14"; T_GOLD="#C9A24B"; T_NAVY="#0F1524"
def wrap(inner,bg): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{bg}"/>{inner}</svg>'

# C + gold keyline hugging the red edge (keeps the seal feel, survives 16px)
C = wrap(f'''<rect x="1.5" y="1.5" width="61" height="61" fill="{T_RED}"/>
<rect x="4.75" y="4.75" width="54.5" height="54.5" fill="none" stroke="{T_GOLD}" stroke-width="2.6"/>
<path d="M8.6 16.6h26.2v8.2h-8.6V49h-9V24.8H8.6z" fill="{T_GOLD}"/>
<path d="M59.4 24.6h-6.9v-2.4c0-2.7-1.6-4.2-4.5-4.2s-4.5 1.7-4.5 4.8v17.4c0 3.1 1.6 4.8 4.5 4.8s4.5-1.5 4.5-4.2v-2.5h6.9V41c0 7-4.3 11.4-11.4 11.4s-11.4-4.6-11.4-12.4V23.6c0-7.8 4.3-12.4 11.4-12.4s11.4 4.4 11.4 11.3z" fill="{T_GOLD}"/>''', T_NAVY)

Z=8
row=Image.new('RGB',(5*(16*Z+14)+14,16*Z+28),(240,240,240)); x=14
for sz in [16,24,32,48,64]:
    png=cairosvg.svg2png(bytestring=C.encode(),output_width=sz,output_height=sz)
    im=Image.open(io.BytesIO(png)).convert('RGB').resize((16*Z,16*Z),Image.NEAREST)
    row.paste(im,(x,14)); x+=16*Z+14
row.save('tc-final.png'); open('toc.svg','w').write(C)
print(row.size)
