import cairosvg, io
from PIL import Image
RED="#9E1B14"; GOLD="#C9A24B"; NAVY="#0F1524"; CREAM="#F3E9D2"
def wrap(inner,bg,size=64): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"><rect width="{size}" height="{size}" fill="{bg}"/>{inner}</svg>'

# --- A: bolder TC, no inner keyline (keyline only at outer edge), letters thicker
A = wrap(f'''<rect x="2" y="2" width="60" height="60" rx="0" fill="{RED}"/>
<rect x="2" y="2" width="60" height="60" fill="none" stroke="{GOLD}" stroke-width="4"/>
<path d="M9 15h25v9.5h-7.5V50h-10V24.5H9z" fill="{GOLD}"/>
<path d="M55 25h-7v-2.6c0-2.4-1.4-3.8-4-3.8s-4 1.5-4 4.3v18.2c0 2.8 1.4 4.3 4 4.3s4-1.4 4-3.8V39h7v3.3c0 6.9-4.4 11-11 11s-11-4.4-11-12V22.7c0-7.6 4.4-12 11-12s11 4.1 11 10.9z" fill="{GOLD}"/>''', NAVY)

# --- B: gold seal block with red TC cut out (high contrast both ways)
B = wrap(f'''<rect x="2" y="2" width="60" height="60" fill="{GOLD}"/>
<rect x="6" y="6" width="52" height="52" fill="{RED}"/>
<path d="M11 17h22v8h-6.5V48h-9V25H11z" fill="{CREAM}"/>
<path d="M53 26.5h-6.2v-2.4c0-2.2-1.2-3.4-3.6-3.4s-3.6 1.3-3.6 3.9v16.8c0 2.6 1.2 3.9 3.6 3.9s3.6-1.2 3.6-3.4V39h6.2v3.2c0 6.5-4 10.3-9.9 10.3s-9.9-4.1-9.9-11.2V25c0-7.1 4-11.2 9.9-11.2S53 17.7 53 24.3z" fill="{CREAM}"/>''', NAVY)

# --- C: single heavy TC, cream on red, no border (cleanest at 16)
C = wrap(f'''<rect width="64" height="64" fill="{RED}"/>
<path d="M6 13h26v10h-8v30h-10V23H6z" fill="{CREAM}"/>
<path d="M58 24.5h-7.5v-3c0-2.6-1.5-4.1-4.3-4.1s-4.3 1.6-4.3 4.7v19.6c0 3.1 1.5 4.7 4.3 4.7s4.3-1.5 4.3-4.1V39H58v3.6c0 7.4-4.7 11.8-11.8 11.8s-11.8-4.7-11.8-12.8V24.4c0-8.1 4.7-12.8 11.8-12.8S58 16.1 58 23.6z" fill="{CREAM}"/>''', NAVY)

Z=7
variants=[('A',A),('B',B),('C',C)]
row=Image.new('RGB',(len(variants)*(5*(16*Z+10)+30)+20,16*Z+70),(238,236,230)); x=20
for nm,svg in variants:
    for sz in [16,24,32,48,64]:
        png=cairosvg.svg2png(bytestring=svg.encode(),output_width=sz,output_height=sz)
        im=Image.open(io.BytesIO(png)).convert('RGB').resize((16*Z,16*Z),Image.NEAREST)
        row.paste(im,(x,20)); x+=16*Z+10
    x+=30
row.save('tc3.png'); print(row.size)
