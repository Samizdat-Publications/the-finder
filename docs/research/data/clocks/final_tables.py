import json, math, sys
S=sys.argv[1]
exec(open(S+'/spindown.py').read().split("print(\"=== 3a")[0])
order=['B0531+21','B0833-45','B1727-47','B0525+21','B1933+16','B1240-64','B2217+47','B0329+54','B1642-03','B0823+26','B1929+10','B0950+08','B2016+28','B1451-68']
NS={'B0531+21':2.342,'B0833-45':1.7}
print("| PSR | n | P_map (s) | P(+40,055 yr) (s) | dP (s) | dP/P | dP if n=3 | yr of error per 1 km/s | dt/t per unit dn |")
for b in order:
    d=D[b]; useF2=(b=='B0531+21')
    Pm=MAP[b]/fH; P71,Pd71=P_and_Pdot(d,1971.0,useF2)
    n=NS.get(b,3.0); T=40055*YR
    P=Pevolve(Pm,Pd71,n,T); P3=Pevolve(Pm,Pd71,3.0,T); Pd=Pdot_at(Pm,Pd71,n,P)
    tau=Pm/(2*Pd71)/YR
    yrkms=(P*1e3/C)/Pd/YR
    print(f"| {b} | {n} | {Pm:.10f} | {P:.6g} | {P-Pm:.3e} | {(P-Pm)/Pm:.3g} | {P3-Pm:.3e} | {yrkms:.3g} | {40055/(4*tau):.2g} |")
print()
print("1 Myr:")
print("| PSR | n | P(+1 Myr) (s) | dP/P | P if n=3 |")
for b in order:
    d=D[b]; useF2=(b=='B0531+21')
    Pm=MAP[b]/fH; P71,Pd71=P_and_Pdot(d,1971.0,useF2)
    for n in ([2.342,2.5,3.0] if b=='B0531+21' else [1.4,1.7,2.81,3.0] if b=='B0833-45' else [3.0]):
        P=Pevolve(Pm,Pd71,n,1e6*YR)
        print(f"| {b} | {n} | {P:.4g} | {(P-Pm)/Pm:.3g} |")
# Crab check vs JBO 2026
nu=29.5357554730; nud=-365845.66e-15
P=1/nu; Pd=-nud/nu**2
print('Crab JBO 2026-07-24: P=%.10f Pdot=%.4e; map->2026 dP=%.4e s, frac=%.4f'%(P,Pd,P-MAP['B0531+21']/fH,(P-MAP['B0531+21']/fH)/(MAP['B0531+21']/fH)))
# PM over 40 kyr and 1 Myr
print()
for b in order:
    d=D[b]
    pm=fl(d['PMTOT'])
    if pm: print(b, 'PMTOT %.2f mas/yr -> 40kyr %.2f deg, 1Myr %.1f deg'%(pm, pm*40000/3.6e6, pm*1e6/3.6e6), ' 1/PX kpc=', (1/fl(d['PX'])) if fl(d['PX']) else '-')
