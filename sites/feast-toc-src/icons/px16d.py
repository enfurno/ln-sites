from PIL import Image
F_RED=(200,35,43); F_ACC=(245,166,35); F_INK=(11,10,13)
T_RED=(158,27,20); T_GOLD=(201,162,75); T_NAVY=(15,21,36); CREAM=(243,233,210)

def canvas(bg): 
    im=Image.new('RGB',(16,16),bg); return im, im.load()
def rect(p,x0,y0,x1,y1,c):
    for y in range(y0,y1+1):
        for x in range(x0,x1+1): p[x,y]=c

# ---- Feast: lantern on ink, drawn on the 16px grid
im,p=canvas(F_INK)
rect(p,6,0,9,0,F_ACC)          # hanger
rect(p,4,1,11,2,F_ACC)         # top cap
rect(p,3,3,12,11,F_RED)        # body
rect(p,3,3,3,11,F_RED); rect(p,12,3,12,11,F_RED)
rect(p,5,4,6,10,(255,244,226)) # sheen -> use cream, thin
rect(p,5,4,5,10,(255,244,226))
rect(p,4,4,11,10,F_RED); rect(p,5,4,6,10,(255,244,226))
rect(p,4,12,11,13,F_ACC)       # bottom cap
rect(p,7,14,8,15,F_ACC)        # tassel
im.save('feast-16.png'); im.resize((256,256),Image.NEAREST).save('/tmp/px_feast.png')

# ---- ToC: heavy T + C on red, balanced 6+2+6 grid
im,p=canvas(T_RED)
rect(p,1,3,6,4,CREAM); rect(p,3,5,4,12,CREAM)     # T
rect(p,9,3,14,4,CREAM); rect(p,9,5,10,12,CREAM); rect(p,9,11,14,12,CREAM)  # C
im.save('toc-16.png'); im.resize((256,256),Image.NEAREST).save('/tmp/px_toc.png')
print('ok')
