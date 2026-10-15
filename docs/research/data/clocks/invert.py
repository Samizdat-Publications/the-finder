import json, math, sys
exec(open(sys.argv[1]+'/spindown.py').read().split("print(\"=== 3a")[0].replace("S=sys.argv[1]","S=sys.argv[1]"))
# True evolution from the 1971 map epoch: start at P_map with Pdot implied by the modern ephemeris at 1971
def invert(b, n_true, n_assumed, T):
    d=D[b]; useF2=(b=='B0531+21')
    Pm=MAP[b]/fH
    P71,Pd71=P_and_Pdot(d,1971.0,useF2)
    # use modern Pdot at 1971 but start from map period (they agree to ~1e-6 for good pulsars)
    t=T*YR
    P=Pevolve(Pm,Pd71,n_true,t); Pd=Pdot_at(Pm,Pd71,n_true,P)
    test=invert_t(P,Pd,Pm,n_assumed)/YR
    return P,Pd,test
print("Elapsed time recovered by an observer who measures P and Pdot at the find epoch and assumes braking index n_assumed")
for b,cases in [('B0531+21',[(2.342,2.342),(2.342,2.5),(2.342,3.0),(2.5,2.342)]),('B0833-45',[(1.7,1.7),(1.7,1.4),(1.7,2.81),(1.7,3.0),(1.4,1.7)]),('B1727-47',[(3,3),(3,2),(2,3)]),('B0329+54',[(3,3),(3,2),(3,5)]),('B1933+16',[(3,3),(3,2)]),('B2016+28',[(3,3),(3,2)])]:
    for T in [40055.0, 1.0e6]:
        for nt,na in cases:
            P,Pd,te=invert(b,nt,na,T)
            print(f"{b:9} T_true={T:>9.0f} n_true={nt:<5} n_assumed={na:<5} P={P:.6g} Pdot={Pd:.3e} -> t_est={te:,.0f} yr  (err {100*(te-T)/T:+.2f}%)")
