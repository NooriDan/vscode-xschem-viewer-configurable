v {xschem version=3.4.5 file_version=1.2}
G {}
K {}
V {}
S {}
E {}
C {devices/title.sym} 160 -30 0 0 {name=l1 author="xschem-viewer-configurable smoke test"}
C {devices/vsource.sym} 180 -220 0 0 {name=V1 value=1.2}
C {devices/gnd.sym} 180 -160 0 0 {name=l2 lab=GND}
C {devices/lab_pin.sym} 180 -280 0 0 {name=p1 sig_type=std_logic lab=VDD}
C {sg13g2_pr/sg13_lv_nmos.sym} 380 -220 0 0 {name=M1 w=1u l=0.13u ng=1 m=1}
C {sg13g2_pr/sg13_lv_pmos.sym} 540 -220 0 0 {name=M2 w=1u l=0.13u ng=1 m=1}
C {sky130_fd_pr/nfet_01v8.sym} 700 -220 0 0 {name=M3 W=1 L=0.15 nf=1 m=1}
C {sub.sym} 880 -220 0 0 {name=x1 descr="has a sibling sub.sch, so clicking it descends"}
C {devices/code_shown.sym} 160 -480 0 0 {name=REGRESSION only_toplevel=true
place=end
value="
.control
** Bare inner quotes: xschem TOGGLES quote parity here, it does not end the value.
** Parity must stay even, and an unescaped close-brace would still end the record.
** Before patch 0003 this file died with a SyntaxError at the first inner quote, and a
** rebuild without the grammar fix truncated the value instead, inventing junk keys.
** $& converts vars defined by "let" into string vars defined by "set"
op
.endc
"}
