import json, math
S=__import__('sys').argv[1]
D={d['PSRB']:d for d in json.load(open(S+'/q14.json'))}
fH = 1.420405752e9   # Sagan et al. 1972 value
YR = 365.25*86400.0
def mjd2yr(m): return 2000.0+(m-51544.5)/365.25
def yr2mjd(y): return 51544.5+(y-2000.0)*365.25
# map numbers (binary integers as engraved, from Johnston transcription; equal to Sagan Table 1 to rounding)
MAP = {'B1727-47':1178486506,'B1451-68':374101871,'B1240-64':551117432,'B0833-45':126726823,
'B0950+08':359455043,'B0823+26':753751947,'B0531+21':47057538,'B0525+21':5320116676,
'B0329+54':1014906390,'B2217+47':764842161,'B2016+28':792520205,'B1933+16':509549854,
'B1929+10':321746104,'B1642-03':550675372}
SAGAN = {'B1727-47':8.296830000e-1,'B1451-68':2.633767640e-1,'B1240-64':3.880000000e-1,'B0833-45':8.921874790e-2,
'B0950+08':2.530650432e-1,'B0823+26':5.306595990e-1,'B0531+21':3.312964500e-2,'B0525+21':3.745490800,
'B0329+54':7.145186424e-1,'B2217+47':5.384673780e-1,'B2016+28':5.579533900e-1,'B1933+16':3.587354200e-1,
'B1929+10':2.265170380e-1,'B1642-03':3.876887790e-1}
order=['B0531+21','B0833-45','B1727-47','B0525+21','B1933+16','B1240-64','B2217+47','B0329+54','B1642-03','B0823+26','B1929+10','B0950+08','B2016+28','B1451-68']
def fl(x):
    try: return float(x)
    except: return None
print("Implied epoch of each map period, from ATNF v2.9.0 ephemeris (F0,F1[,F2]) extrapolated")
print(f"{'PSR':9} {'Pmap(s)':>14} {'PEPOCH':>8} {'yrPE':>7} {'t(F0,F1)':>9} {'t(+F2)':>9} {'n_F2':>8} {'LSBres_d':>9}")
res={}
for b in order:
    d=D[b]; F0=fl(d['F0']);F1=fl(d['F1']);F2=fl(d['F2']); pe=fl(d['PEPOCH'])
    Pm = MAP[b]/fH
    num = 1.0/Pm
    # linear in nu
    dt1 = (num-F0)/F1
    t1 = mjd2yr(pe+dt1/86400)
    t2=None
    if F2:
        # F0+F1 dt + 0.5 F2 dt^2 = num  -> solve
        a=0.5*F2; bb=F1; c=F0-num
        disc=bb*bb-4*a*c
        if disc>0:
            r1=(-bb+math.sqrt(disc))/(2*a); r2=(-bb-math.sqrt(disc))/(2*a)
            dt2 = r1 if abs(r1-dt1)<abs(r2-dt1) else r2
            t2=mjd2yr(pe+dt2/86400)
    n_F2 = F0*F2/F1**2 if F2 else None
    Pdot = fl(d['P1'])
    lsb_res_days = (0.5/fH)/Pdot/86400
    res[b]=(t1,t2)
    print(f"{b:9} {Pm:>14.10f} {pe:>8.1f} {mjd2yr(pe):>7.1f} {t1:>9.2f} {('%9.2f'%t2) if t2 else '        -'} {('%8.2f'%n_F2) if n_F2 else '       -'} {lsb_res_days:>9.3g}")
