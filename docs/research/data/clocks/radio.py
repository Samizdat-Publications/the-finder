import math
YR=365.25*86400; NA=6.02214076e23; MeV=1.602176634e-13
T={'U238':4.468e9,'U234':2.455e5,'Th230':7.538e4,'Ra226':1600.0,'Pu238':87.74,'Pu239':24100.0,'Pu240':6561.0,'U235':7.04e8,'U236':2.343e7}
L={k:math.log(2)/v for k,v in T.items()}  # per year
# --- U-238 source on record cover ---
A0_uCi=0.00026; A0=A0_uCi*3.7e4  # Bq
lam238_s=L['U238']/YR
N238=A0/lam238_s; m238=N238*238.0508/NA
print(f"U-238 source: {A0:.3f} Bq = {A0*86400:,.0f} decays/day; N={N238:.3e} atoms; mass={m238*1e3:.3f} mg; areal density over 2 cm dia = {m238*1e3/(math.pi*1.0**2):.3f} mg/cm2; U-metal-equivalent thickness={m238/(math.pi*1.0**2)/19.05*1e4:.3f} um")
spec=lam238_s*NA/238.0508; print(f"U-238 specific activity {spec:.4g} Bq/g")
def bateman3(t, l1,l2,l3):
    # N1(0)=1, others 0; returns N1,N2,N3
    N1=math.exp(-l1*t)
    N2=l1/(l2-l1)*(math.exp(-l1*t)-math.exp(-l2*t))
    N3=l1*l2*( math.exp(-l1*t)/((l2-l1)*(l3-l1)) + math.exp(-l2*t)/((l1-l2)*(l3-l2)) + math.exp(-l3*t)/((l1-l3)*(l2-l3)) )
    return N1,N2,N3
def bateman4(t,l1,l2,l3,l4):
    ls=[l1,l2,l3,l4]; N=[]
    for n in range(1,5):
        pref=1.0
        for i in range(n-1): pref*=ls[i]
        s=0.0
        for i in range(n):
            den=1.0
            for j in range(n):
                if j!=i: den*=(ls[j]-ls[i])
            s+=math.exp(-ls[i]*t)/den
        N.append(pref*s)
    return N
print()
print("Pure U-238 at t=0 (short-lived Th-234/Pa-234m ignored):")
for t in [49.0, 1000.0, 10000.0, 40000.0, 1.0e6]:
    N1,N2,N3,N4=bateman4(t,L['U238'],L['U234'],L['Th230'],L['Ra226'])
    A1,A2,A3,A4=L['U238']*N1,L['U234']*N2,L['Th230']*N3,L['Ra226']*N4
    approx2=L['U234']*t; approx3=L['U234']*L['Th230']*t*t/2
    print(f" t={t:>9.0f} y: A234/A238={A2/A1:.6e} (approx lam234*t={approx2:.6e}); A230/A238={A3/A1:.6e} (approx {approx3:.4e}); A226/A238={A4/A1:.4e}; atom N234/N238={N2/N1:.4e}; N230/N238={N3/N1:.4e}")
    rate234=A0*(A2/A1)*86400; rate230=A0*(A3/A1)*86400; rate226=A0*(A4/A1)*86400
    print(f"      U-234 decays/day={rate234:,.3f}; Th-230 decays/day={rate230:,.5f}; Ra-226 decays/day={rate226:,.5f}")
    for eff in [0.3,1.0]:
        for rel in [0.10,0.01]:
            need=1/rel**2
            print(f"        eff={eff}: counting time for {int(rel*100)}% on U-234 = {need/(rate234*eff):.4g} d ; on Th-230 = {need/(rate230*eff) if rate230>0 else float('inf'):.4g} d")
# dating precision from ratio: t = -ln(1-R)/lam234 for U234/U238
for t in [49.0,40000.0]:
    R=1-math.exp(-L['U234']*t)
    dtdR=1/(L['U234']*(1-R))
    print(f" t={t}: R={R:.6e}; 1% error in R -> dt = {0.01*R*dtdR:.3g} y ; 0.1% -> {0.001*R*dtdR:.3g} y")
# half-life sensitivity at 40,000 y: U-234 half-life 0.24% (LNHB) -> dt
print()
print("Alternative: chemically purified NATURAL uranium (U-234 in equilibrium, A234/A238=1, Th-230=0):")
for t in [49.0,40000.0]:
    # Th230 growth from U234 (equilibrium with U238), ignoring U238 decay
    A230=1-math.exp(-L['Th230']*t)  # approx when A234/A238=1 constant
    print(f" t={t}: A230/A238 ~ {A230:.4e}; Th-230 decays/day={A0*A230*86400:,.2f}")
# --- RTG ---
print()
Q238=5593.20e-3 # MeV (LNHB Q for alpha 0,0); use total decay energy ~5.5932 MeV
lam238pu_s=L['Pu238']/YR
spP=lam238pu_s*NA/238.0496*Q238*MeV
print(f"Pu-238 specific power (alpha Q=5.5932 MeV): {spP:.4f} W/g")
sph_g=251.5; Pu_frac_atoms=0.80
molPuO2=0.93; mPu238=molPuO2*Pu_frac_atoms*238.0496
print(f"Per 100 W sphere: PuO2 {sph_g} g, Pu-238 {mPu238:.1f} g -> {mPu238*spP:.1f} W")
per_rtg_Pu238=24*mPu238
print(f"Per RTG: PuO2 {24*sph_g/1000:.2f} kg, Pu-238 {per_rtg_Pu238/1000:.2f} kg -> {per_rtg_Pu238*spP:.0f} W(th); per spacecraft x3: PuO2 {3*24*sph_g/1000:.1f} kg, Pu-238 {3*per_rtg_Pu238/1000:.2f} kg")
for t in [49.1, 40000.0]:
    f=math.exp(-L['Pu238']*t)
    print(f" t={t} y: Pu-238 remaining fraction {f:.6g} (log10={math.log10(f) if f>0 else -999:.1f}); thermal per RTG from 2400 W -> {2400*f:.4g} W; U-234/Pu-238 atom ratio = {(1-f)/f if f>0 else float('inf'):.6g}")
# dating precision for U-234/Pu-238 at 49 y
t=49.1; R=math.exp(L['Pu238']*t)-1; dtdR=1/(L['Pu238']*(1+R))
print(f" 49.1 y: R={R:.4f}; 1% in R -> {0.01*R*dtdR:.3f} y; 0.1% -> {0.001*R*dtdR*365.25:.1f} d")
# 40,000 y: Pu-238 -> U-234 -> Th-230 -> Ra-226 chain from Pu-238 start
N=bateman4(40000.0, L['Pu238'], L['U234'], L['Th230'], L['Ra226'])
A=[N[0]*L['Pu238'],N[1]*L['U234'],N[2]*L['Th230'],N[3]*L['Ra226']]
print(f" 40,000 y from pure Pu-238: N(U234)={N[1]:.5f}, N(Th230)={N[2]:.5f}, N(Ra226)={N[3]:.3e} per initial Pu-238 atom; A230/A234={A[2]/A[1]:.4f}; atom Th230/U234={N[2]/N[1]:.4f}; A226/A230={A[3]/A[2]:.4f}")
Npu=3*per_rtg_Pu238/238.0496*NA
print(f"  per spacecraft: U-234 {N[1]*Npu*234.0410/NA/1000:.2f} kg; Th-230 {N[2]*Npu*230.0331/NA/1000:.3f} kg; Ra-226 {N[3]*Npu*226.0254/NA:.1f} g; He produced ~{Npu*(1-N[0]+N[2]+N[3]):.3e} atoms (vented by design)")
# Th230/U234 dating precision at 40,000 y
def RA(t): 
    d=L['Th230']-L['U234']; return L['Th230']/d*(1-math.exp(-d*t))
R0=RA(40000.0); dR=(RA(40010.0)-RA(39990.0))/20.0
print(f"  A230/A234(40ky)={R0:.4f}; dR/dt={dR:.3e}/yr -> 1% in ratio = {0.01*R0/dR:.0f} y; 0.1% = {0.001*R0/dR:.0f} y")
# half-life systematics: Th-230 +/-0.4% (LNHB) vs 0.15% (Cheng 2013, 2 sigma 110 y)
for lab,T230,T234 in [('LNHB',7.538e4,2.455e5),('Cheng2013',75584.0,245620.0)]:
    l30=math.log(2)/T230; l34=math.log(2)/T234; d=l30-l34
    # invert R0 with these half-lives
    tt=-math.log(1-R0*d/l30)/d
    print(f"  inverting with {lab} half-lives: t={tt:,.0f} y")
# Pu-239 -> U-235, Pu-240 -> U-236 clocks at 40,000 y
for p,dgt in [('Pu239','U235'),('Pu240','U236')]:
    for t in [49.1, 40000.0]:
        f=math.exp(-L[p]*t); r=(1-f)/f
        print(f" {p}->{dgt}: t={t} y remaining {f:.4g}; daughter/parent atom ratio {r:.4g}; 1% ratio -> {0.01*r/(L[p]*(1+r)):.3g} y")
