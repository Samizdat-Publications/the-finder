import json, math, sys
data = json.load(open(sys.argv[1]))
GC = 2032.3  # local units, origin to GC-line end tick (Mysid Pioneer_plaque.svg)
R0 = 10.0    # kpc assumed (IAU 1964 value); scale factor
names = {14.065:'B1642-03',47.966:'B1929+10',52.863:'B1933+16',68.795:'B2016+28',98.077:'B2217+47',144.757:'B0329+54',
         182.478:'B0525+21',185.502:'B0531+21',198.27:'B0823+26',230.804:'B0950+08',264.789:'B0833-45',300.604:'B1240-64(binary track)',
         301.6:'B1240-64',311.248:'B1451-68',342.825:'B1727-47'}
johnston = {'B1727-47':'1000110001111100100011011101010','B1451-68':'10110010011000101011101101111','B1240-64':'100000110110010110001001111000',
 'B0833-45':'111100011011011001010100111','B0950+08':'10101011011001101100101000011','B0823+26':'101100111011010101011110001011',
 'B0531+21':'10110011100000101010000010','B0525+21':'100111101000110101000100111000100','B0329+54':'111100011111100011111000010110',
 'B2217+47':'101101100101101001000010110001','B2016+28':'101111001111001110011000001101','B1933+16':'11110010111110001110100011110',
 'B1929+10':'10011001011010111010010111000','B1642-03':'100000110100101010001110101100'}
truelb = {'B1642-03':(14.114,26.062),'B1929+10':(47.382,-3.885),'B1933+16':(52.436,-2.093),'B2016+28':(68.099,-3.983),'B2217+47':(98.385,-7.598),
 'B0329+54':(144.995,-1.221),'B0525+21':(183.856,-6.896),'B0531+21':(184.557,-5.784),'B0823+26':(196.964,31.743),'B0950+08':(228.908,43.697),
 'B0833-45':(263.552,-2.787),'B1240-64':(302.051,-1.532),'B1451-68':(313.868,-8.543),'B1727-47':(342.565,-7.669)}
# solid-line definition per line (end of last solid segment, tick position) chosen by inspection
solid = { # name: (r_end, tick or None, break(start,end) or None, binary_start)
 'B1642-03':(159.6, 83.6, (48.5,64.7)), 'B1929+10':(20.5, None, None), 'B1933+16':(825.1,796.1,(48.9,70.0)),
 'B2016+28':(76.6, 66.0, (49.8,65.6)), 'B2217+47':(225.2,198.8,(49.0,66.0)), 'B0329+54':(138.5,134.4,(50.1,66.8)),
 'B0525+21':(252.1,221.7,(49.0,63.2)), 'B0531+21':(395.8,356.9,None), 'B0823+26':(83.3,32.9,(47.8,67.1)),
 'B0950+08':(15.8,None,None), 'B0833-45':(331.0,310.1,(50.5,68.3)), 'B1240-64':(1142.5,1123.8,(52.7,71.8)),
 'B1451-68':(41.9,36.8,(21.3,30.9)), 'B1727-47':(611.8,542.0,(45.6,63.7)) }
def decode(items, rmin):
    marks=[]
    for t,a0,a1,rho,lat in items:
        if rho <= rmin: continue
        if t=='P':
            L=a1-a0
            if L>20:
                k=max(1,round((L+8)/19.5)); step=(L-11*k)/(k-1) if k>1 else 0
                for i in range(k):
                    s=a0+i*(11+step); marks.append(('0',s+5.5))
            else:
                marks.append(('0',(a0+a1)/2))
        elif t=='X':
            marks.append(('1',rho))
    marks.sort(key=lambda m:m[1])
    # merge dash fragments closer than 8 units center-to-center
    out=[]
    for m in marks:
        if out and m[0]=='0' and out[-1][0]=='0' and m[1]-out[-1][1]<9: continue
        out.append(m)
    return ''.join(m[0] for m in out), out[0][1], out[-1][1]
rows=[]
for g in data:
    th=g['th']
    name=names.get(th)
    if not name or name=='B1240-64': continue
    if name.startswith('B1240-64'):
        bits,b0,b1 = decode(g['items'], 0); name='B1240-64'
    else:
        r_end = solid[name][0]
        bits,b0,b1 = decode(g['items'], r_end+3)
    rows.append((name,th,bits,b0,b1))
th_of={'B1240-64':301.6}
print(f"{'pulsar':9} {'angle':>7} {'l_true':>7} {'d_ang':>6} {'r/GC':>6} {'r_kpc':>6} {'tick':>6} {'|z|/GC':>7} {'z_kpc':>6} {'b_map':>6} {'b_true':>6} {'break':>12} {'bin@':>11} bits ok")
for name,th,bits,b0,b1 in sorted(rows, key=lambda r: (r[1] if r[0]!='B1240-64' else 301.6)):
    if name=='B1240-64': th=301.6
    r_end,tick,brk = solid[name]
    z = (r_end-tick) if tick else None
    bmap = math.degrees(math.atan2(z, r_end)) if z is not None else float('nan')
    l,b = truelb[name]
    print(f"{name:9} {th:7.2f} {l:7.2f} {th-l:6.2f} {r_end/GC:6.4f} {r_end/GC*R0:6.3f} {(tick or float('nan')):6.1f} {(z/GC if z is not None else float('nan')):7.4f} {(z/GC*R0 if z is not None else float('nan')):6.3f} {bmap:6.1f} {abs(b):6.2f} {str(brk):>12} {b0:5.0f}-{b1:5.0f} {len(bits):2d} {'OK' if bits==johnston[name] else 'MISMATCH '+bits}")
