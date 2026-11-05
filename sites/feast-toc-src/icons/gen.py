import cairosvg, io
from PIL import Image

F_GOOD = "#C8232B"; F_ACC="#F5A623"; F_INK="#0B0A0D"; F_CREAM="#FFF4E2"
T_RED="#9E1B14"; T_GOLD="#C9A24B"; T_NAVY="#0F1524"; T_CREAM="#F3E9D2"

def svg(inner, bg):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{bg}"/>{inner}</svg>'

# --- Feast: lantern ---
feast_lantern = svg(f'''
<path d="M32 5v7" stroke="{F_ACC}" stroke-width="3.4" stroke-linecap="square"/>
<rect x="21" y="11" width="22" height="6" fill="{F_ACC}"/>
<path d="M21 17h22c5.6 6.6 5.6 22.4 0 29H21c-5.6-6.6-5.6-22.4 0-29z" fill="{F_GOOD}"/>
<path d="M26.4 21.5c-2.2 6.4-2.2 15.6 0 22" stroke="{F_CREAM}" stroke-width="2.2" opacity=".42" fill="none"/>
<rect x="21" y="46" width="22" height="6" fill="{F_ACC}"/>
<path d="M32 52v6" stroke="{F_ACC}" stroke-width="3.2"/>
<path d="M27.6 58h8.8L32 64z" fill="{F_ACC}"/>
''', F_INK)

# --- Feast alt: bowl + steam bold ---
feast_bowl = svg(f'''
<path d="M30 12c-4 4 4 6 0 10M38 12c-4 4 4 6 0 10" stroke="{F_CREAM}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
<path d="M9 30h46c0 14.4-10.3 24-23 24S9 44.4 9 30z" fill="{F_CREAM}"/>
<rect x="15" y="55" width="34" height="4.6" fill="{F_ACC}"/>
''', F_GOOD)

# --- Feast alt2: F monogram ---
feast_F = svg(f'''
<rect x="0" y="0" width="10" height="64" fill="{F_ACC}"/>
<path d="M14 8h40v11H28v9h22v11H28v25H14z" fill="{F_CREAM}"/>
''', F_GOOD)

# --- ToC: TC monogram in seal ---
toc_tc = svg(f'''
<rect x="6" y="6" width="52" height="52" fill="{T_RED}"/>
<rect x="10" y="10" width="44" height="44" fill="none" stroke="{T_GOLD}" stroke-width="2"/>
<path d="M17 19h18v5.4H29.6V45H22.4V24.4H17z" fill="{T_GOLD}"/>
<path d="M52 25.5h-5.6v-1.2c0-2.2-1.3-3.4-3.6-3.4-2.4 0-3.7 1.3-3.7 3.9v14.4c0 2.6 1.3 3.9 3.7 3.9 2.3 0 3.6-1.2 3.6-3.4v-1.6H52v1.2c0 5.5-3.5 9-9 9s-9-3.6-9-9.6V24.5c0-6 3.5-9.6 9-9.6s9 3.5 9 9.1z" fill="{T_GOLD}"/>
''', T_NAVY)

# --- ToC alt: 家 stamp (simplified) ---
toc_jia = svg(f'''
<rect x="5" y="5" width="54" height="54" fill="{T_RED}"/>
<rect x="9" y="9" width="46" height="46" fill="none" stroke="{T_GOLD}" stroke-width="1.8"/>
<text x="32" y="45" font-family="Noto Serif CJK SC,AR PL UMing CN,serif" font-size="36" text-anchor="middle" fill="{T_GOLD}">家</text>
''', T_NAVY)

# --- ToC alt2: gold bowl/chopsticks on navy ---
toc_bowl = svg(f'''
<path d="M20 10l6 44M24 10l6 44" stroke="{T_GOLD}" stroke-width="3"/>
<path d="M20 34h26c0 11-5.8 18-13 18s-13-7-13-18z" fill="{T_GOLD}"/>
<rect x="42" y="30" width="4" height="22" fill="{T_GOLD}" opacity=".85"/>
''', T_NAVY)

cands = {
 'feast-lantern': feast_lantern, 'feast-bowl': feast_bowl, 'feast-F': feast_F,
 'toc-tc': toc_tc, 'toc-jia': toc_jia, 'toc-bowl': toc_bowl,
}
import os
for n,s in cands.items():
    open(f'{n}.svg','w').write(s)

SIZES=[16,32,48,96]
sheet_rows=[]
for n,s in cands.items():
    row=Image.new('RGB',(4*120+3*120+40,150),(235,235,235))
    x=0
    for bg in [(235,235,235),(60,60,60)]:
        for sz in SIZES:
            png=cairosvg.svg2png(bytestring=s.encode(),output_width=sz,output_height=sz)
            im=Image.open(io.BytesIO(png)).convert('RGB')
            row.paste(im,(x+ (100-sz)//2, 25))
            x+=100
    sheet_rows.append((n,row))
W=max(r.width for _,r in sheet_rows); H=sum(r.height for _,r in sheet_rows)
sheet=Image.new('RGB',(W,H),(235,235,235))
y=0
for n,r in sheet_rows:
    sheet.paste(r,(0,y)); y+=r.height
sheet.save('candidates.png')
print('ok',sheet.size)
