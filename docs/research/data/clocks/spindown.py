import json, math, sys
S=sys.argv[1]
D={d['PSRB']:d for d in json.load(open(S+'/q14.json'))}
fH = 1.420405752e9
YR = 365.25*86400.0
C = 299792458.0
def fl(x):
    try: return float(x)
    except: return None
def mjd2yr(m): return 2000.0+(m-51544.5)/365.25
def yr2mjd(y): return 51544.5+(y-2000.0)*365.25
MAP = {'B1727-47':1178486506,'B1451-68':374101871,'B1240-64':551117432,'B0833-45':126726823,
'B0950+08':359455043,'B0823+26':753751947,'B0531+21':47057538,'B0525+21':5320116676,
'B0329+54':1014906390,'B2217+47':764842161,'B2016+28':792520205,'B1933+16':509549854,
'B1929+10':321746104,'B1642-03':550675372}
# significant figures per Sagan et al. 1972 statement (9 for "almost all"; 1240 known to 3; 1727 ~6 (terminal zeros))
SIG = {b:9 for b in MAP}; SIG['B1240-64']=3; SIG['B1727-47']=6
order=['B0531+21','B0833-45','B1727-47','B0525+21','B1933+16','B1240-64','B2217+47','B0329+54','B1642-03','B0823+26','B1929+10','B0950+08','B2016+28','B1451-68']
def nu_at(d, yr, useF2):
    F0=fl(d['F0']);F1=fl(d['F1']);F2=fl(d['F2']) if useF2 else 0.0
    if F2 is None: F2=0.0
    dt=(yr2mjd(yr)-fl(d['PEPOCH']))*86400
    nu=F0+F1*dt+0.5*F2*dt*dt
    nud=F1+F2*dt
    return nu,nud
def P_and_Pdot(d,yr,useF2):
    nu,nud=nu_at(d,yr,useF2)
    return 1/nu, -nud/nu**2
def Pevolve(P0,Pd0,n,t):
    if abs(n-1)<1e-9:
        return P0*math.exp(Pd0*t/P0)
    base=P0**(n-1)+(n-1)*P0**(n-2)*Pd0*t
    if base<=0: return float('inf')
    return base**(1.0/(n-1))
def Pdot_at(P0,Pd0,n,P):
    return Pd0*(P/P0)**(2-n)
def invert_t(Pnow,Pdnow,Pmap,n):
    if abs(n-1)<1e-9: return Pnow/Pdnow*math.log(Pnow/Pmap)
    return (Pnow**(n-1)-Pmap**(n-1))/((n-1)*Pnow**(n-2)*Pdnow)

print("=== 3a: change 1971.0 -> 2026.0, vs map precision ===")
print(f"{'PSR':9} {'P2026(s)':>13} {'Pdot':>10} {'tau_c(yr)':>9} {'dP55(s)':>10} {'dP/P':>8} {'bits':>4} {'LSB/P':>8} {'sig':>3} {'dPstat(s)':>9} {'S/N':>8} {'dt_LSB(d)':>9} {'dt_stat':>10}")
rows3a=[]
for b in order:
    d=D[b]; useF2 = (b=='B0531+21')
    P71,Pd71=P_and_Pdot(d,1971.0,useF2)
    P26,Pd26=P_and_Pdot(d,2026.0,useF2)
    dP=P26-P71
    N=MAP[b]; bits=N.bit_length(); Pm=N/fH
    e=math.floor(math.log10(Pm)); dPstat=0.5*10**(e-SIG[b]+1)
    snr=dP/dPstat
    dt_lsb=(0.5/fH)/Pd26/86400
    dt_stat=dPstat/Pd26/YR
    tau=P26/(2*Pd26)/YR
    rows3a.append((b,P26,Pd26,tau,dP,dP/P26,bits,1/N,SIG[b],dPstat,snr,dt_lsb,dt_stat))
    print(f"{b:9} {P26:>13.10f} {Pd26:>10.3e} {tau:>9.3g} {dP:>10.3e} {dP/P26:>8.1e} {bits:>4} {1/N:>8.1e} {SIG[b]:>3} {dPstat:>9.1e} {snr:>8.2g} {dt_lsb:>9.3g} {('%.3g yr'%dt_stat):>10}")

print()
print("=== 3b/3c: future periods (from 2026 state) ===")
NSET={'B0531+21':[2.342,2.50,3.0],'B0833-45':[1.4,1.7,2.81,3.0]}
for T in [40000.0, 1.0e6]:
    t=T*YR
    print(f"--- t = {T:,.0f} yr ---")
    print(f"{'PSR':9} {'n':>5} {'P0(2026)':>11} {'P(t)':>11} {'dP(s)':>10} {'dP/P0':>9} {'linear dP':>10} {'Pdot(t)':>10} {'dt/t per dn':>11} {'yr per km/s':>11}")
    for b in order:
        d=D[b]; useF2=(b=='B0531+21')
        P0,Pd0=P_and_Pdot(d,2026.0,useF2)
        tau=P0/(2*Pd0)/YR
        for n in NSET.get(b,[3.0]):
            P=Pevolve(P0,Pd0,n,t)
            Pd=Pdot_at(P0,Pd0,n,P)
            dP=P-P0
            sens=T/(4*tau)
            # Doppler: 1 km/s -> dP = P*1e3/C ; equivalent years = dP / (mean Pdot) ~ use Pd at t
            yr_per_kms = (P*1e3/C)/Pd/YR
            print(f"{b:9} {n:>5.2f} {P0:>11.7f} {P:>11.6g} {dP:>10.4g} {dP/P0:>9.3g} {Pd0*t:>10.4g} {Pd:>10.3e} {sens:>11.3g} {yr_per_kms:>11.3g}")
