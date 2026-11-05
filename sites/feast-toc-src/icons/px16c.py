from PIL import Image
RED=(158,27,20); CREAM=(243,233,210)
im=Image.new('RGB',(16,16),RED); p=im.load()
def box(x0,x1,y0,y1,c=CREAM):
    for y in range(y0,y1+1):
        for x in range(x0,x1+1): p[x,y]=c
# T: bar 1..6 (y3..5), stem 3..4 (y3..13)
box(1,6,3,5); box(3,4,6,13)
# C: stem 9..10 (y3..13), arms y3..5 and y11..13 from 9..15
box(9,10,3,13); box(9,15,3,5); box(9,15,11,13)
im.save('toc-16.png')
im.resize((16*16,16*16),Image.NEAREST).save('/tmp/toc16c.png')
print('ok')
