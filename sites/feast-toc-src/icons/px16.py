from PIL import Image
RED=(158,27,20); GOLD=(201,162,75); NAVY=(15,21,36); CREAM=(243,233,210)
def mk(rows, pal):
    im=Image.new('RGB',(16,16))
    for y,r in enumerate(rows):
        for x,c in enumerate(r):
            im.putpixel((x,y),pal[c])
    return im
# Taste of China, hand set for 16px: gold ring, red field, cream TC
TOC=[
"GGGGGGGGGGGGGGGG",
"GNNNNNNNNNNNNNNG",
"GNRRRRRRRRRRRRNG",
"GNRRCCCCCCCCCCNG",
"GNRRCCCCCCCCCCNG",
"GNRRRRCCRRCCCRNG",
"GNRRRRCCRRCCCRNG",
"GNRRRRCCRRCCCRNG",
"GNRRRRCCRRCCCRNG",
"GNRRRRCCRRCCCRNG",
"GNRRRRCCRRCCCRNG",
"GNRRCCCCCCCCCCNG",
"GNRRCCCCCCCCCCNG",
"GNRRRRRRRRRRRRNG",
"GNNNNNNNNNNNNNNG",
"GGGGGGGGGGGGGGGG",
]
pal={'G':GOLD,'N':NAVY,'R':RED,'C':CREAM}
im=mk(TOC,pal)
im.save('toc-16.png')
Z=14
im.resize((16*Z,16*Z),Image.NEAREST).save('/tmp/toc16.png')
print('ok')
