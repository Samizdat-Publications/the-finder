import json,sys
lines=open(sys.argv[1]).read().strip().splitlines()
hdr=[h for h in lines[0].split(';')]
out=[]
for L in lines[2:]:
    f=L.split(';')
    if len(f)<10: continue
    d={}
    # Columns (long csv with errors): # ;PSRJ;ref;PSRB;ref;P0;err;ref;P1;err;ref;F0;err;ref;F1;err;ref;F2;err;ref;PEPOCH;ref;DM;err;ref;DIST;DIST_DM;ref;DIST_A;err;ref;DIST1;PX;err;ref;GL;GB;PMRA;err;ref;PMDEC;err;ref;PML;err;PMB;err;PMTOT;err;VTRANS;AGE;NGLT;DISC;ASSOC
    keys=['idx','PSRJ','PSRJ_ref','PSRB','PSRB_ref','P0','P0_err','P0_ref','P1','P1_err','P1_ref','F0','F0_err','F0_ref','F1','F1_err','F1_ref','F2','F2_err','F2_ref','PEPOCH','PEPOCH_ref','DM','DM_err','DM_ref','DIST','DIST_DM','DIST_DM_ref','DIST_A','DIST_A_err','DIST_A_ref','DIST1','PX','PX_err','PX_ref','GL','GB','PMRA','PMRA_err','PMRA_ref','PMDEC','PMDEC_err','PMDEC_ref','PML','PML_err','PMB','PMB_err','PMTOT','PMTOT_err','VTRANS','AGE','NGLT','DISC','ASSOC']
    for k,v in zip(keys,f):
        d[k]=v
    out.append(d)
json.dump(out,open(sys.argv[2],'w'),indent=1)
for d in out:
    print(d['PSRB'],d['PSRJ'],d['P0'],d['P1'],d['F2'],d['PEPOCH'],d['DM'],d['DIST'],d['DIST_DM'],d['DIST_A'],d['PX'],d['PX_err'],d['GL'],d['GB'],d['PMRA'],d['PMDEC'],d['PMTOT'],d['VTRANS'],d['AGE'],d['NGLT'],d['DISC'])
