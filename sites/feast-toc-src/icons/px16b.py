from PIL import Image
RED=(158,27,20); CREAM=(243,233,210); GOLD=(201,162,75); NAVY=(15,21,36)
W=H=16
im=Image.new('RGB',(W,H),RED)
p=im.load()
# T : bar y3..5 x2..8 ; stem x4..6 y3..13
for y in range(3,6):
    for x in range(2,9): p[x,y]=CREAM
for y in range(3,14):
    for x in range(4,7): p[x,y]=CREAM
# C : left stem x9..11 y3..13 ; top arm y3..5 x9..14 ; bottom arm y11..13 x9..14
for y in range(3,14):
    for x in range(9,12): p[x,y]=CREAM
for y in range(3,6):
    for x in range(9,15): p[x,y]=CREAM
for y in range(11,14):
    for x in range(9,15): p[x,y]=CREAM
# tiny gold notch bottom-right to echo the seal keyline
im.save('toc-16.png')
Z=16
im.resize((W*Z,H*Z),Image.NEAREST).save('/tmp/toc16b.png')
print('ok')
