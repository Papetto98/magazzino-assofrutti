import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";

const qi=l=>Number((((l.mv||0)*100*5+(l.mo||0)*100*7+(l.co||0)*100*3)/15).toFixed(2));
const bn=i=>i<=2.5?1:i<=3?2:i<=4.5?3:i<=6?4:5;
const pct=v=>((v||0)*100).toFixed(2)+"%";
const dsp=l=>(l.q_iniz||0)-(l.mov||0);
const fmtD=d=>{if(!d)return"-";const p=String(d).split("T")[0].split("-");return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d};
const xls=(data,cols,name)=>{const rows=data.map(r=>{const o={};cols.forEach(c=>{o[c.label]=c.gv?c.gv(r):r[c.key]??""});return o});const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Dati");XLSX.writeFile(wb,name+".xlsx")};

// DUAL THEMES
const LIGHT={bg:"#f5f3ef",sf:"#ffffff",sfH:"#f0ece4",card:"#ffffff",bd:"#e2ddd4",bdH:"#c9a84c88",acc:"#b8892e",accD:"#8a6820",accL:"#f5e6c8",g:"#2d8a4e",gD:"#e6f5ec",r:"#c0392b",rD:"#fbeaea",o:"#d68910",oD:"#fdf2e0",b:"#2471a3",bD:"#e4f0f9",t:"#2c2418",tD:"#6b5e4f",tM:"#9a8d7e",pk:"#faf6ef",pkS:"#f5eed8",zebra:C.zebra,thBg:"#f8f5f0"};
const DARK={bg:"#080c10",sf:"#12171e",sfH:"#1a2029",card:"#151b24",bd:"#252d38",bdH:"#c9a84c88",acc:"#d4a855",accD:"#a3833e",accL:"#d4a85520",g:"#4ade80",gD:"#4ade8018",r:"#f87171",rD:"#f8717118",o:"#fb923c",oD:"#fb923c18",b:"#60a5fa",bD:"#60a5fa18",t:"#e8e0d4",tD:"#8899aa",tM:"#5a6a7a",pk:"#1a2029",pkS:"#1e2836",zebra:"#111820",thBg:"#0d1218"};
let C=LIGHT;
const BD={1:{l:"Eccellente",c:"#1e8449",bg:"#e8f8ef"},2:{l:"Buona",c:"#7d9a1e",bg:"#f3f9e0"},3:{l:"Media",c:"#d68910",bg:"#fdf2e0"},4:{l:"Bassa",c:"#c0392b",bg:"#fbeaea"},5:{l:"Critica",c:"#922b21",bg:"#f5d5d1"}};
const TC={"CONVENZIONALI":"#b8892e","BIOLOGICHE":"#1e8449","GIFFONI":"#2471a3","FAIR FOR LIFE":"#7d3c98","BIOSUISSE":"#c0392b"};

// UPDATED VALUES
const TIPI=["CONVENZIONALI","BIOLOGICHE","FAIR FOR LIFE","BIOSUISSE","GIFFONI"];
const LAVS=["SGUSCIATE","ROTTAME","SCARTI"];
const CALS=["9/11","11/13","13/15","DA SCEGLIERE","VENTILATO","PICCOLO","GRANDE","GRANELLA","FARINA","PASTA"];
const MAGS=["Caprarola","Soriano","Fabbrica","Vignanello"];

const XC={
  giacenze:[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc2",label:"Lavoraz."},{key:"desc3",label:"Calibro"},{label:"Disponibile",gv:r=>dsp(r)},{key:"magazzino",label:"Magazzino"},{label:"M.V. %",gv:r=>((r.mv||0)*100).toFixed(2)},{label:"M.O. %",gv:r=>((r.mo||0)*100).toFixed(2)},{label:"C.V. %",gv:r=>((r.cv||0)*100).toFixed(2)},{label:"C.O. %",gv:r=>((r.co||0)*100).toFixed(2)},{label:"C.E. %",gv:r=>((r.ce||0)*100).toFixed(2)},{label:"Indice",gv:r=>qi(r)},{key:"contratto",label:"Contratto"},{key:"acquirente",label:"Acquirente"}],
  lotti:[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc2",label:"Lavoraz."},{key:"desc3",label:"Calibro"},{key:"q_iniz",label:"Q.Iniziale"},{key:"mov",label:"Movimentato"},{label:"Disponibile",gv:r=>dsp(r)},{key:"magazzino",label:"Magazzino"},{key:"contratto",label:"Contratto"}],
  contratti:[{key:"id",label:"N."},{key:"cliente",label:"Cliente"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Calibro"},{key:"qta_tot",label:"Totale"},{key:"qta_evasa",label:"Evasa"},{label:"Residuo",gv:r=>(r.qta_tot||0)-(r.qta_evasa||0)},{label:"Scadenza",gv:r=>fmtD(r.scadenza)}],
  movimenti:[{key:"tipo",label:"Tipo"},{label:"Data",gv:r=>fmtD(r.data)},{key:"imballo",label:"Imballo"},{key:"lotto",label:"Lotto"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{key:"qta",label:"Qta"},{key:"magazzino",label:"Mag."},{key:"contratto_id",label:"Contr."}],
};

const CSS=`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@700;800;900&display=swap');
::selection{background:#b8892e44}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
@keyframes barGrow{from{width:0}}
@media print{
  *{color:black!important;background:white!important;box-shadow:none!important;text-shadow:none!important;border-color:#ccc!important}
  body,html,#root{background:white!important}
  [data-no-print]{display:none!important}
  table{width:100%!important;border-collapse:collapse!important;page-break-inside:auto!important;font-size:9px!important}
  tr{page-break-inside:avoid!important}
  th{background:#eee!important;border:1px solid #999!important;padding:4px 6px!important;font-size:8px!important;font-weight:700!important;text-transform:uppercase!important}
  td{border:1px solid #bbb!important;padding:3px 6px!important;font-size:9px!important;white-space:normal!important;word-break:break-word!important}
  span{background:none!important;border:none!important;padding:0!important;font-size:9px!important}
  h1{font-size:16px!important}h2,h3{font-size:12px!important}
  div[style*="overflow"]{overflow:visible!important;max-height:none!important}
  @page{margin:0.8cm;size:A4 landscape}
}
@media(max-width:1200px){
  td,th{padding:6px 8px!important;font-size:12px!important}
}
@media(max-width:900px){
  td,th{padding:4px 6px!important;font-size:11px!important}
}`;

// === UI ===
const Badge=({children,color,bg,onClick,style:s})=><span onClick={onClick} style={{display:"inline-block",padding:"3px 10px",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:.3,color:color||C.t,background:bg||"#f0ece4",cursor:onClick?"pointer":"default",transition:"all .15s",...s}} onMouseEnter={e=>{if(onClick)e.currentTarget.style.opacity=.8}} onMouseLeave={e=>{e.currentTarget.style.opacity=1}}>{children}</span>;
const Msg=({msg})=>msg?<div style={{padding:"10px 16px",borderRadius:8,marginBottom:16,background:msg.t==="ok"?C.gD:C.rD,color:msg.t==="ok"?C.g:C.r,border:"1px solid "+(msg.t==="ok"?C.g+"33":C.r+"33"),fontSize:13,animation:"fadeUp .3s both"}}>{msg.x}</div>:null;
const Tbl=({cols,data,onRow})=><div style={{borderRadius:10,border:"1px solid "+C.bd,overflow:"auto",background:C.sf,maxWidth:"100%"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:600}}><thead><tr>{cols.map((c,i)=><th key={i} style={{padding:"10px 12px",textAlign:"left",background:C.thBg,color:C.tD,fontSize:10,textTransform:"uppercase",letterSpacing:.8,borderBottom:"2px solid "+C.acc,whiteSpace:"nowrap",fontWeight:700}}>{c.label}</th>)}</tr></thead><tbody>{data.length===0?<tr><td colSpan={cols.length} style={{padding:30,textAlign:"center",color:C.tM}}>Nessun dato</td></tr>:data.map((row,ri)=><tr key={row.id||ri} onClick={()=>onRow&&onRow(row)} style={{cursor:onRow?"pointer":"default",background:ri%2===0?C.sf:C.zebra,transition:"background .15s"}} onMouseEnter={e=>{e.currentTarget.style.background=C.sfH}} onMouseLeave={e=>{e.currentTarget.style.background=ri%2===0?C.sf:C.zebra}}>{cols.map((c,ci)=><td key={ci} style={{padding:"9px 12px",borderBottom:"1px solid "+C.bd+"66",whiteSpace:"nowrap",color:C.t}}>{c.render?c.render(row):row[c.key]}</td>)}</tr>)}</tbody></table></div>;
const Sel=({label,value,onChange,options,style:s})=><div style={{display:"flex",flexDirection:"column",gap:4,...s}}>{label&&<label style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:.8,fontWeight:600}}>{label}</label>}<select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"8px 12px",background:C.sf,border:"1px solid "+C.bd,borderRadius:8,color:C.t,fontSize:13,outline:"none"}}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
const Inp=({label,value,onChange,type,placeholder,style:s,disabled})=><div style={{display:"flex",flexDirection:"column",gap:4,...s}}>{label&&<label style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:.8,fontWeight:600}}>{label}</label>}<input type={type||"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{padding:"8px 12px",background:disabled?C.bd+"44":C.sf,border:"1px solid "+C.bd,borderRadius:8,color:disabled?C.tM:C.t,fontSize:13,outline:"none",opacity:disabled?.6:1}}/></div>;
const Btn=({children,onClick,primary,small,disabled,danger,style:s})=><button onClick={onClick} disabled={disabled} style={{padding:small?"6px 14px":"10px 20px",borderRadius:8,border:"1px solid "+(danger?C.r:primary?C.acc:C.bd),cursor:disabled?"not-allowed":"pointer",fontWeight:700,fontSize:small?12:13,background:danger?C.r:primary?C.acc:C.sf,color:danger?"#fff":primary?"#fff":C.t,opacity:disabled?.5:1,transition:"all .15s",boxShadow:primary?"0 2px 8px "+C.acc+"33":"none",...s}} onMouseEnter={e=>{if(!disabled)e.currentTarget.style.transform="translateY(-1px)"}} onMouseLeave={e=>{e.currentTarget.style.transform=""}}>{children}</button>;
const XBtn=({data,cols,name})=>data&&data.length>0?<div data-no-print style={{display:"flex",gap:6}}><Btn small onClick={()=>xls(data,cols,name||"export")}>Excel</Btn><Btn small onClick={()=>window.print()}>Stampa</Btn></div>:null;
const GCard=({children,onClick,delay,style:s})=><div onClick={onClick} style={{background:C.card,border:"1px solid "+C.bd,borderRadius:14,padding:22,cursor:onClick?"pointer":"default",transition:"all .2s",animation:`fadeUp .4s ${delay||0}s both`,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",...s}} onMouseEnter={e=>{if(onClick){e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.08)";e.currentTarget.style.borderColor=C.bdH}}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.04)";e.currentTarget.style.borderColor=C.bd}}>{children}</div>;
const TypeChip=({label,active,color,onClick})=><button onClick={onClick} style={{padding:"8px 18px",borderRadius:20,border:"2px solid "+(active?color:C.bd),background:active?color+"15":C.sf,color:active?color:C.tD,fontSize:12,fontWeight:active?700:500,cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>{if(!active)e.currentTarget.style.borderColor=color+"66"}} onMouseLeave={e=>{if(!active)e.currentTarget.style.borderColor=C.bd}}>{label}</button>;

// === LOT PICKER (with filter for assigned only) ===
function LotPicker({lotti,onSelect,onCancel,onlyAssigned,multiSelect,onMultiSubmit}){
  const[s,setS]=useState("");const[fT,setFT]=useState("");const[fC,setFC]=useState("");const[fM,setFM]=useState("");const[fA,setFA]=useState(onlyAssigned||false);
  const[selected,setSelected]=useState([]);
  const av=useMemo(()=>lotti.filter(l=>dsp(l)>0).map(l=>({...l,d:dsp(l),qi:qi(l),bd:bn(qi(l))})),[lotti]);
  const fl=useMemo(()=>av.filter(l=>{if(fT&&l.desc1!==fT)return false;if(fC&&l.desc3!==fC)return false;if(fM&&l.magazzino!==fM)return false;if(fA&&!l.contratto&&!l.acquirente)return false;if(s.length>=2){const q=s.toUpperCase();return[l.lotto,l.imballo,l.desc1,l.desc3,l.magazzino,l.acquirente,l.contratto].some(v=>v&&String(v).toUpperCase().includes(q))}return true}),[av,fT,fC,fM,fA,s]);
  const toggleSel=lot=>{setSelected(p=>p.find(x=>x.id===lot.id)?p.filter(x=>x.id!==lot.id):[...p,lot])};
  return <div style={{background:C.pk,border:"2px solid "+C.acc+"44",borderRadius:14,padding:22,marginBottom:20,animation:"fadeUp .3s both"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div><h3 style={{fontSize:18,fontWeight:800,color:C.acc,margin:0}}>{multiSelect?"Seleziona piu lotti":"Seleziona lotto"}</h3><p style={{fontSize:12,color:C.tD,margin:"4px 0 0"}}>{fl.length} lotti disponibili</p></div><div style={{display:"flex",gap:8}}>{multiSelect&&selected.length>0&&<Btn primary small onClick={()=>onMultiSubmit(selected)}>Uscita {selected.length} lotti</Btn>}<Btn small onClick={onCancel}>Chiudi</Btn></div></div>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end"}}><div style={{flex:"1 1 200px"}}><input value={s} onChange={e=>setS(e.target.value)} placeholder="Cerca..." style={{width:"100%",padding:"9px 14px",background:C.sf,border:"1px solid "+(s?C.acc+"66":C.bd),borderRadius:8,color:C.t,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div><Sel value={fT} onChange={setFT} options={[{value:"",label:"Tutti tipi"},...TIPI.map(v=>({value:v,label:v}))]}/><Sel value={fC} onChange={setFC} options={[{value:"",label:"Calibri"},...CALS.map(v=>({value:v,label:v}))]}/><Sel value={fM} onChange={setFM} options={[{value:"",label:"Magazzini"},...MAGS.map(v=>({value:v,label:v}))]}/><label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.tD,cursor:"pointer"}}><input type="checkbox" checked={fA} onChange={e=>setFA(e.target.checked)} style={{accentColor:C.acc}}/>Solo assegnati</label></div>
    <div style={{maxHeight:300,overflowY:"auto"}}><Tbl cols={[...(multiSelect?[{label:"",render:r=><input type="checkbox" checked={!!selected.find(x=>x.id===r.id)} onChange={()=>toggleSel(r)} style={{accentColor:C.acc,cursor:"pointer"}}/>}]:[]),{label:"Lotto",render:r=><strong style={{color:C.acc}}>{r.lotto}</strong>},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Disp.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:C.acc}}>{r.d.toLocaleString()} kg</span>},{key:"magazzino",label:"Mag."},{label:"Qualita",render:r=><Badge color={BD[r.bd].c} bg={BD[r.bd].bg}>{r.qi}</Badge>},{label:"Contr.",render:r=>r.contratto?<Badge color={C.b} bg={C.bD}>{r.contratto}</Badge>:<span style={{color:C.tM}}>-</span>}]} data={fl} onRow={multiSelect?null:onSelect}/></div>
  </div>;
}

// === LOGIN ===
function LoginPage(){
  const[em,setEm]=useState("");const[pw,setPw]=useState("");const[ld,setLd]=useState(false);const[er,setEr]=useState("");
  const go=async()=>{setLd(true);setEr("");const{error}=await supabase.auth.signInWithPassword({email:em,password:pw});if(error)setEr("Email o password errati");setLd(false)};
  return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f3ef"}}>
    <style>{CSS}</style>
    <div style={{width:400,background:C.card,border:"1px solid "+C.bd,borderRadius:18,padding:48,boxShadow:"0 4px 24px rgba(0,0,0,0.06)",animation:"fadeUp .5s both"}}>
      <div style={{textAlign:"center",marginBottom:36}}><div style={{width:56,height:56,borderRadius:14,background:"linear-gradient(135deg,"+C.acc+","+C.accD+")",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"#fff",marginBottom:16,boxShadow:"0 4px 16px "+C.acc+"33"}}>A</div><h1 style={{fontSize:26,fontWeight:900,color:C.acc,margin:"8px 0 4px",fontFamily:"'Playfair Display',serif"}}>ASSOFRUTTI</h1><p style={{fontSize:13,color:C.tM,margin:0,letterSpacing:2}}>MAGAZZINO NOCCIOLE</p></div>
      {er&&<div style={{padding:"10px 14px",borderRadius:8,background:C.rD,color:C.r,fontSize:12,marginBottom:16,border:"1px solid "+C.r+"33"}}>{er}</div>}
      <Inp label="Email" value={em} onChange={setEm} placeholder="mario@assofrutti.it" type="email"/><div style={{height:14}}/><Inp label="Password" value={pw} onChange={setPw} placeholder="........" type="password"/><div style={{height:24}}/>
      <Btn primary onClick={go} disabled={ld||!em||!pw} style={{width:"100%",padding:"14px",fontSize:15}}>{ld?"Accesso...":"Accedi"}</Btn>
    </div></div>;
}

// === DASHBOARD (all KPIs clickable) ===
function DashboardPage({lotti,contratti,goPage}){
  const av=useMemo(()=>lotti.filter(l=>dsp(l)>0).map(l=>({...l,d:dsp(l),qi:qi(l),bn:bn(qi(l))})),[lotti]);
  const tot=av.reduce((s,l)=>s+l.d,0);const assigned=av.filter(l=>l.contratto||l.acquirente).length;
  const byType={};av.forEach(l=>{byType[l.desc1]=(byType[l.desc1]||0)+l.d});
  const byMag={};av.forEach(l=>{byMag[l.magazzino]=(byMag[l.magazzino]||0)+l.d});
  const byCal={};av.forEach(l=>{byCal[l.desc3]=(byCal[l.desc3]||0)+l.d});
  const byQual={1:0,2:0,3:0,4:0,5:0};av.forEach(l=>{byQual[l.bn]++});
  const openC=contratti.filter(c=>(c.qta_tot-c.qta_evasa)>0);
  const drill=(type,val)=>goPage("giacenze",{type,val});
  return <div>
    <div style={{marginBottom:32}}><h1 style={{fontSize:32,fontWeight:900,color:C.t,margin:0,fontFamily:"'Playfair Display',serif",animation:"fadeUp .4s both"}}>Dashboard</h1><p style={{color:C.tM,fontSize:14,marginTop:6,animation:"fadeUp .4s .1s both"}}>Clicca su qualsiasi dato per esplorare</p></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:28}}>
      <GCard delay={.05} onClick={()=>goPage("giacenze")}><div style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8,fontWeight:600}}>Giacenza Totale</div><div style={{fontSize:30,fontWeight:900,color:C.acc,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{tot.toLocaleString()}</div><div style={{fontSize:12,color:C.tM,marginTop:6}}>{av.length} lotti · kg</div></GCard>
      <GCard delay={.1} onClick={()=>drill("stato","libero")}><div style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8,fontWeight:600}}>Liberi</div><div style={{fontSize:30,fontWeight:900,color:C.g,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{av.length-assigned}</div><div style={{fontSize:12,color:C.tM,marginTop:6}}>Senza assegnazione</div></GCard>
      <GCard delay={.15} onClick={()=>drill("stato","assegnato")}><div style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8,fontWeight:600}}>Assegnati</div><div style={{fontSize:30,fontWeight:900,color:C.b,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{assigned}</div></GCard>
      <GCard delay={.2} onClick={()=>goPage("contratti")}><div style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8,fontWeight:600}}>Contratti Aperti</div><div style={{fontSize:30,fontWeight:900,color:C.o,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{openC.length}</div><div style={{fontSize:12,color:C.tM,marginTop:6}}>su {contratti.length}</div></GCard>
    </div>
    <div style={{marginBottom:28}}><h2 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:2,marginBottom:14,fontWeight:600}}>Per Magazzino</h2>
    <div style={{display:"grid",gridTemplateColumns:"repeat("+Object.keys(byMag).length+",1fr)",gap:14}}>{Object.entries(byMag).sort((a,b)=>b[1]-a[1]).map(([mag,kg],i)=>{const n=av.filter(l=>l.magazzino===mag).length;const p=tot>0?kg/tot*100:0;return <GCard key={mag} delay={.15+i*.06} onClick={()=>drill("magazzino",mag)}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}><div><div style={{fontSize:17,fontWeight:800,color:C.t}}>{mag}</div><div style={{fontSize:11,color:C.tM,marginTop:2}}>{n} lotti</div></div><div style={{fontSize:11,color:C.acc,fontWeight:700,padding:"3px 10px",background:C.accL,borderRadius:6}}>{p.toFixed(0)}%</div></div><div style={{fontSize:26,fontWeight:900,color:C.acc,fontFamily:"'DM Mono',monospace",marginBottom:10}}>{kg.toLocaleString()} <span style={{fontSize:13,fontWeight:500,color:C.tM}}>kg</span></div><div style={{height:5,background:C.bd+"44",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:p+"%",background:"linear-gradient(90deg,"+C.accD+","+C.acc+")",borderRadius:3,animation:"barGrow .8s "+(0.3+i*.1)+"s both"}}/></div></GCard>})}</div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:28}}>
      <GCard delay={.3}><h2 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:2,marginBottom:18,fontWeight:600}}>Per Tipo</h2>{Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([tipo,kg],i)=>{const color=TC[tipo]||C.acc;const p=tot>0?kg/tot*100:0;return <div key={tipo} onClick={()=>drill("tipo",tipo)} style={{cursor:"pointer",marginBottom:14,transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateX(3px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:13,fontWeight:600,color:C.t,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:3,background:color,display:"inline-block"}}/>{tipo}</span><span style={{fontSize:13,color,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{kg.toLocaleString()} kg</span></div><div style={{height:4,background:C.bd+"44",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:p+"%",background:color,borderRadius:3,opacity:.7,animation:"barGrow .8s "+(0.4+i*.08)+"s both"}}/></div></div>})}</GCard>
      <GCard delay={.35}><h2 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:2,marginBottom:18,fontWeight:600}}>Per Calibro</h2>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>{Object.entries(byCal).sort((a,b)=>b[1]-a[1]).map(([cal,kg])=>{const p=tot>0?kg/tot*100:0;return <div key={cal} onClick={()=>drill("calibro",cal)} style={{cursor:"pointer",background:C.zebra,borderRadius:10,padding:"12px 16px",textAlign:"center",border:"1px solid "+C.bd,transition:"all .2s",flex:"1 1 80px"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.bdH}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.bd}}><div style={{fontSize:18,fontWeight:800,color:C.acc,fontFamily:"'DM Mono',monospace"}}>{cal}</div><div style={{fontSize:16,fontWeight:700,marginTop:6,fontFamily:"'DM Mono',monospace"}}>{kg.toLocaleString()}</div><div style={{fontSize:11,color:C.tM,marginTop:2}}>{p.toFixed(0)}%</div></div>})}</div>
      <h2 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:2,marginBottom:14,fontWeight:600}}>Qualita</h2>
      <div style={{display:"flex",gap:8}}>{[1,2,3,4,5].map(b=>{const c=byQual[b];const mx=Math.max(...Object.values(byQual),1);return <div key={b} onClick={()=>c>0&&drill("qualita",String(b))} style={{flex:1,cursor:c>0?"pointer":"default",textAlign:"center",transition:"transform .15s"}} onMouseEnter={e=>{if(c>0)e.currentTarget.style.transform="translateY(-2px)"}} onMouseLeave={e=>e.currentTarget.style.transform=""}><div style={{height:60,display:"flex",alignItems:"flex-end",justifyContent:"center",marginBottom:4}}><div style={{width:"65%",height:Math.max(4,c/mx*100)+"%",background:BD[b].c,borderRadius:4,opacity:.5,animation:"barGrow .6s "+(0.5+b*.05)+"s both"}}/></div><div style={{fontSize:14,fontWeight:700,color:BD[b].c}}>{c}</div><div style={{fontSize:9,color:C.tM,marginTop:2}}>{BD[b].l}</div></div>})}</div></GCard>
    </div>
    <GCard delay={.4}><h2 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:2,marginBottom:14,fontWeight:600}}>Contratti Aperti</h2>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>{openC.map((c,i)=>{const res=c.qta_tot-c.qta_evasa;const p=c.qta_evasa/c.qta_tot*100;return <div key={c.id} style={{background:C.zebra,borderRadius:10,padding:14,border:"1px solid "+C.bd,animation:`slideIn .3s ${0.5+i*.04}s both`}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontWeight:700,color:C.acc,fontSize:13}}>N.{c.id} — {c.cliente}</span><span style={{fontSize:11,color:C.tM}}>{fmtD(c.scadenza)}</span></div><div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}><span style={{color:C.tM}}>Residuo: <strong style={{color:C.o}}>{res.toLocaleString()} kg</strong></span><span style={{color:C.tM,fontFamily:"'DM Mono',monospace"}}>{p.toFixed(0)}%</span></div><div style={{height:4,background:C.bd+"44",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:p+"%",background:p>=100?C.g:C.acc,borderRadius:2}}/></div></div>})}</div></GCard>
  </div>;
}

// === MOVIMENTI (multi-select uscita, partial transfer fix, duplicate check) ===
function MovimentiPage({lotti,contratti,movimenti,reload,isAdm}){
  const[tipo,setTipo]=useState("ENTRATA");const[showPk,setShowPk]=useState(false);const[sel,setSel]=useState(null);const[msg,setMsg]=useState(null);const[undoId,setUndoId]=useState(null);const[multiMode,setMultiMode]=useState(false);
  const ef={data:new Date().toISOString().split("T")[0],sett:"",anno:"2025",imballo:"",lotto:"",desc1:"CONVENZIONALI",desc2:"SGUSCIATE",desc3:"9/11",qta:"",magazzino:"Fabbrica",mv:"",mo:"",cv:"",co:"",ce:"",newMag:"Soriano"};
  const[form,setForm]=useState(ef);const reset=()=>{setForm(ef);setSel(null);setShowPk(false);setMultiMode(false)};const chTipo=v=>{setTipo(v);reset();if(v!=="ENTRATA")setShowPk(true)};
  const pickLot=lot=>{setSel(lot);setShowPk(false);setForm(f=>({...f,imballo:lot.imballo,lotto:lot.lotto,desc1:lot.desc1,desc2:lot.desc2,desc3:lot.desc3,magazzino:lot.magazzino}))};
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),5000)};
  const fc=lot=>contratti.find(c=>c.id===lot.contratto&&(c.qta_tot-c.qta_evasa)>0);const mc=sel?fc(sel):null;

  // DUPLICATE CHECK for entries
  const checkDuplicate=()=>{return lotti.some(l=>l.lotto===form.lotto&&l.imballo===form.imballo&&l.desc1===form.desc1&&l.desc3===form.desc3)};

  const handleSubmit=async()=>{if(!form.qta||Number(form.qta)<=0){flash("err","Quantita non valida");return}
    if(tipo==="ENTRATA"){
      if(!form.imballo||!form.lotto){flash("err","Compila imballo e lotto");return}
      if(checkDuplicate()){flash("err","ATTENZIONE: esiste gia un lotto con stessi valori di Lotto, Imballo, Tipo e Calibro!");return}
    }
    if(tipo!=="ENTRATA"&&!sel){flash("err","Seleziona un lotto");return}
    if(tipo==="USCITA"&&sel&&Number(form.qta)>sel.d){flash("err","Max: "+sel.d+" kg");return}
    // PARTIAL TRANSFER FIX
    if(tipo==="TRASFERIMENTO"&&sel&&Number(form.qta)>0&&Number(form.qta)<sel.d){
      const q=Number(form.qta);
      // Create new lot in destination with partial qty
      await supabase.from("lotti").insert({sett_prod:sel.sett_prod,anno:sel.anno,imballo:sel.imballo+" (trasf.)",lotto:sel.lotto,desc1:sel.desc1,desc2:sel.desc2,desc3:sel.desc3,q_iniz:q,mov:0,magazzino:form.newMag,mv:sel.mv,mo:sel.mo,cv:sel.cv,co:sel.co,ce:sel.ce,contratto:sel.contratto,acquirente:sel.acquirente});
      // Reduce original lot
      await supabase.from("lotti").update({mov:sel.mov+q}).eq("id",sel.id);
      await supabase.from("movimenti").insert({tipo:"TRASFERIMENTO",data:form.data,imballo:sel.imballo,lotto:sel.lotto,desc1:sel.desc1,desc2:sel.desc2,desc3:sel.desc3,qta:q,magazzino:form.newMag,contratto_id:""});
      flash("ok","Trasferimento parziale: "+q+" kg a "+form.newMag);
      reset();await reload();return;
    }
    const q=Number(form.qta);
    try{
      await supabase.from("movimenti").insert({tipo,data:form.data,imballo:form.imballo,lotto:form.lotto,desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,qta:q,magazzino:tipo==="TRASFERIMENTO"?form.newMag:form.magazzino,contratto_id:sel?.contratto||""});
      if(tipo==="ENTRATA"){await supabase.from("lotti").insert({sett_prod:Number(form.sett)||0,anno:Number(form.anno),imballo:form.imballo,lotto:form.lotto,desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,q_iniz:q,mov:0,magazzino:form.magazzino,mv:(Number(form.mv)||0)/100,mo:(Number(form.mo)||0)/100,cv:(Number(form.cv)||0)/100,co:(Number(form.co)||0)/100,ce:(Number(form.ce)||0)/100});flash("ok","Entrata: "+q+" kg "+form.desc1)}
      else if(tipo==="USCITA"){await supabase.from("lotti").update({mov:sel.mov+q}).eq("id",sel.id);if(mc){await supabase.from("contratti").update({qta_evasa:mc.qta_evasa+q}).eq("id",mc.id);flash("ok","Uscita: "+q+" kg - Contr. "+mc.id)}else flash("ok","Uscita: "+q+" kg")}
      else{await supabase.from("lotti").update({magazzino:form.newMag}).eq("id",sel.id);flash("ok","Trasferito intero a "+form.newMag)}
      reset();await reload()
    }catch(e){flash("err",e.message)}};

  // MULTI-SELECT USCITA
  const handleMultiUscita=async(lots)=>{const dt=new Date().toISOString().split("T")[0];let ok=0;
    for(const lot of lots){try{
      await supabase.from("movimenti").insert({tipo:"USCITA",data:dt,imballo:lot.imballo,lotto:lot.lotto,desc1:lot.desc1,desc2:lot.desc2,desc3:lot.desc3,qta:lot.d,magazzino:lot.magazzino,contratto_id:lot.contratto||""});
      await supabase.from("lotti").update({mov:lot.mov+lot.d}).eq("id",lot.id);
      const ctr=fc(lot);if(ctr)await supabase.from("contratti").update({qta_evasa:ctr.qta_evasa+lot.d}).eq("id",ctr.id);
      ok++;
    }catch(e){flash("err","Errore su "+lot.imballo+": "+e.message)}}
    flash("ok","Uscita completa di "+ok+" lotti");setShowPk(false);setMultiMode(false);await reload()};

  const handleUndo=async r=>{try{if(r.tipo==="ENTRATA")await supabase.from("lotti").delete().match({imballo:r.imballo,lotto:r.lotto,q_iniz:r.qta,mov:0});else if(r.tipo==="USCITA"){const{data:lot}=await supabase.from("lotti").select("*").match({imballo:r.imballo,lotto:r.lotto}).limit(1).single();if(lot)await supabase.from("lotti").update({mov:Math.max(0,lot.mov-r.qta)}).eq("id",lot.id);if(r.contratto_id){const{data:ct}=await supabase.from("contratti").select("*").eq("id",r.contratto_id).single();if(ct)await supabase.from("contratti").update({qta_evasa:Math.max(0,ct.qta_evasa-r.qta)}).eq("id",ct.id)}}else await supabase.from("lotti").update({magazzino:r.magazzino}).match({imballo:r.imballo,lotto:r.lotto});await supabase.from("movimenti").delete().eq("id",r.id);setUndoId(null);flash("ok","Annullato");await reload()}catch(e){flash("err",e.message)}};

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}><h1 style={{fontSize:28,fontWeight:900,color:C.t,margin:0,fontFamily:"'Playfair Display',serif"}}>Movimenti</h1><XBtn data={movimenti} cols={XC.movimenti} name="movimenti"/></div><Msg msg={msg}/>
    <div style={{display:"flex",gap:0,marginBottom:20,borderRadius:10,border:"1px solid "+C.bd,overflow:"hidden",background:C.sf}} data-no-print>{[{v:"ENTRATA",color:C.g,sub:"Nuovo lotto"},{v:"USCITA",color:C.r,sub:"Seleziona e preleva"},{v:"TRASFERIMENTO",color:C.b,sub:"Sposta tra magazzini"}].map(t=><div key={t.v} onClick={()=>chTipo(t.v)} style={{flex:1,padding:"14px 20px",cursor:"pointer",textAlign:"center",background:tipo===t.v?C.zebra:"transparent",borderBottom:tipo===t.v?"3px solid "+t.color:"3px solid transparent",transition:"all .15s"}}><div style={{fontSize:14,fontWeight:700,color:tipo===t.v?t.color:C.tM}}>{t.v}</div><div style={{fontSize:11,color:C.tM,marginTop:2}}>{t.sub}</div></div>)}</div>
    {tipo==="USCITA"&&!sel&&<div style={{display:"flex",gap:8,marginBottom:12}} data-no-print><Btn small primary={!multiMode} onClick={()=>{setMultiMode(false);setShowPk(true)}}>Lotto singolo</Btn><Btn small primary={multiMode} onClick={()=>{setMultiMode(true);setShowPk(true)}}>Multi-lotto</Btn></div>}
    {showPk&&tipo!=="ENTRATA"&&<LotPicker lotti={lotti} onSelect={pickLot} onCancel={()=>{setShowPk(false);setSel(null)}} multiSelect={multiMode&&tipo==="USCITA"} onMultiSubmit={handleMultiUscita}/>}
    {sel&&tipo!=="ENTRATA"&&<div style={{background:C.accL,border:"2px solid "+C.acc+"44",borderRadius:10,padding:16,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}} data-no-print><div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:10,color:C.tD,textTransform:"uppercase"}}>Lotto</div><div style={{fontSize:16,fontWeight:800,color:C.acc}}>{sel.lotto} - {sel.imballo}</div></div><div><div style={{fontSize:10,color:C.tD}}>Disp.</div><div style={{fontSize:18,fontWeight:800,color:C.g,fontFamily:"'DM Mono',monospace"}}>{sel.d.toLocaleString()} kg</div></div>{mc&&<div><div style={{fontSize:10,color:C.tD}}>Contratto</div><div style={{color:C.b,fontWeight:700}}>{mc.id} - {mc.cliente}</div></div>}</div><Btn small onClick={()=>{setShowPk(true);setSel(null)}}>Cambia</Btn></div>}
    <GCard style={{marginBottom:24}} data-no-print>
      {tipo==="ENTRATA"?<><h3 style={{fontSize:14,color:C.g,margin:"0 0 16px",fontWeight:700}}>Nuovo lotto in entrata</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12}}><Inp label="Data" type="date" value={form.data} onChange={v=>setForm({...form,data:v})}/><Inp label="Sett." value={form.sett} onChange={v=>setForm({...form,sett:v})}/><Inp label="Anno" value={form.anno} onChange={v=>setForm({...form,anno:v})}/><Inp label="Imballo *" value={form.imballo} onChange={v=>setForm({...form,imballo:v})} placeholder="BIG BAG N..."/><Inp label="Lotto *" value={form.lotto} onChange={v=>setForm({...form,lotto:v})} placeholder="SO112024"/><Sel label="Tipo" value={form.desc1} onChange={v=>setForm({...form,desc1:v})} options={TIPI.map(v=>({value:v,label:v}))}/><Sel label="Lavoraz." value={form.desc2} onChange={v=>setForm({...form,desc2:v})} options={LAVS.map(v=>({value:v,label:v}))}/><Sel label="Calibro" value={form.desc3} onChange={v=>setForm({...form,desc3:v})} options={CALS.map(v=>({value:v,label:v}))}/><Inp label="Qta (kg) *" type="number" value={form.qta} onChange={v=>setForm({...form,qta:v})} placeholder="1000"/><Sel label="Magazzino" value={form.magazzino} onChange={v=>setForm({...form,magazzino:v})} options={MAGS.map(v=>({value:v,label:v}))}/><Inp label="M.V. %" value={form.mv} onChange={v=>setForm({...form,mv:v})} placeholder="2"/><Inp label="M.O. %" value={form.mo} onChange={v=>setForm({...form,mo:v})} placeholder="1.3"/><Inp label="C.V. %" value={form.cv} onChange={v=>setForm({...form,cv:v})} placeholder="0"/><Inp label="C.O. %" value={form.co} onChange={v=>setForm({...form,co:v})} placeholder="3.3"/><Inp label="C.E. %" value={form.ce} onChange={v=>setForm({...form,ce:v})} placeholder="0"/></div></>
      :tipo==="USCITA"?<>{sel?<><h3 style={{fontSize:14,color:C.r,margin:"0 0 16px",fontWeight:700}}>Quantita da prelevare</h3><div style={{display:"flex",gap:12,alignItems:"flex-end"}}><Inp label="Data" type="date" value={form.data} onChange={v=>setForm({...form,data:v})}/><Inp label={"Qta (max "+sel.d+") *"} type="number" value={form.qta} onChange={v=>setForm({...form,qta:v})} style={{flex:1}}/><Btn small onClick={()=>setForm(f=>({...f,qta:String(sel.d)}))}>Tutto</Btn></div></>:!showPk&&<div style={{textAlign:"center",padding:20}}><Btn primary onClick={()=>setShowPk(true)}>Seleziona lotto</Btn></div>}</>
      :<>{sel?<><h3 style={{fontSize:14,color:C.b,margin:"0 0 16px",fontWeight:700}}>Trasferimento</h3><div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}><Inp label="Data" type="date" value={form.data} onChange={v=>setForm({...form,data:v})}/><div><div style={{fontSize:10,color:C.tD,marginBottom:4}}>DA</div><div style={{padding:"8px 12px",background:C.bd+"44",border:"1px solid "+C.bd,borderRadius:8,color:C.tD,fontSize:13}}>{sel.magazzino}</div></div><Sel label="A" value={form.newMag} onChange={v=>setForm({...form,newMag:v})} options={MAGS.filter(v=>v!==sel.magazzino).map(v=>({value:v,label:v}))}/><Inp label={"Qta (max "+sel.d+" kg)"} type="number" value={form.qta} onChange={v=>setForm({...form,qta:v})} placeholder={String(sel.d)}/><Btn small onClick={()=>setForm(f=>({...f,qta:String(sel.d)}))}>Tutto</Btn></div></>:!showPk&&<div style={{textAlign:"center",padding:20}}><Btn primary onClick={()=>setShowPk(true)}>Seleziona lotto</Btn></div>}</>}
      {(tipo==="ENTRATA"||sel)&&<div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}><Btn onClick={reset}>Annulla</Btn><Btn primary onClick={handleSubmit}>{tipo==="ENTRATA"?"Registra Entrata":tipo==="USCITA"?"Registra Uscita":"Trasferisci"}</Btn></div>}
    </GCard>
    <h3 style={{fontSize:13,color:C.tD,margin:"0 0 12px",textTransform:"uppercase",letterSpacing:2,fontWeight:600}}>Storico movimenti</h3>
    <Tbl cols={[{label:"Tipo",render:r=><Badge color={r.tipo==="ENTRATA"?C.g:r.tipo==="USCITA"?C.r:C.b} bg={r.tipo==="ENTRATA"?C.gD:r.tipo==="USCITA"?C.rD:C.bD}>{r.tipo}</Badge>},{label:"Data",render:r=>fmtD(r.data)},{key:"imballo",label:"Imballo"},{key:"lotto",label:"Lotto"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Qta",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700}}>{r.qta?.toLocaleString()}</span>},{key:"magazzino",label:"Mag."},{label:"Contr.",render:r=>r.contratto_id?<Badge color={C.b} bg={C.bD}>{r.contratto_id}</Badge>:<span style={{color:C.tM}}>-</span>},...(isAdm?[{label:"",render:r=>undoId===r.id?<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:11,color:C.o}}>Sicuro?</span><button onClick={e=>{e.stopPropagation();handleUndo(r)}} style={{background:C.r,border:"none",color:"#fff",cursor:"pointer",fontSize:11,padding:"4px 10px",borderRadius:6,fontWeight:700}}>Si</button><button onClick={e=>{e.stopPropagation();setUndoId(null)}} style={{background:C.sf,border:"1px solid "+C.bd,color:C.tD,cursor:"pointer",fontSize:11,padding:"4px 8px",borderRadius:6}}>No</button></div>:<button onClick={e=>{e.stopPropagation();setUndoId(r.id)}} style={{background:"none",border:"none",color:C.r,cursor:"pointer",fontSize:12,opacity:.7}}>Annulla</button>}]:[])] } data={movimenti}/>
  </div>;
}

// === GIACENZE (type buttons, sort tipo/cal/lotto/imballo, uscita button, totals) ===
function GiacenzePage({lotti,contratti,reload,isAdm,dashFilter,clearFilter}){
  const[fTipo,setFTipo]=useState(dashFilter?.type==="tipo"?dashFilter.val:"");
  const[fCal,setFCal]=useState(dashFilter?.type==="calibro"?dashFilter.val:"");
  const[fMag,setFMag]=useState(dashFilter?.type==="magazzino"?dashFilter.val:"");
  const[fQual,setFQual]=useState(dashFilter?.type==="qualita"?dashFilter.val:"");
  const[fSt,setFSt]=useState(dashFilter?.type==="stato"?(dashFilter.val==="assegnato"?"A":"L"):"");
  const[sortQ,setSortQ]=useState(false);
  const[aId,setAId]=useState(null);const[aC,setAC]=useState("");const[aA,setAA]=useState("");
  const[uscId,setUscId]=useState(null);const[uscQta,setUscQta]=useState("");
  const[msg,setMsg]=useState(null);
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};

  const enr=useMemo(()=>lotti.filter(l=>dsp(l)>0).map(l=>{const q=qi(l);return{...l,d:dsp(l),qualita:q,fascia:bn(q),stato:(l.contratto||l.acquirente)?"A":"L"}}),[lotti]);
  const fl=enr.filter(l=>{if(fTipo&&l.desc1!==fTipo)return false;if(fCal&&l.desc3!==fCal)return false;if(fMag&&l.magazzino!==fMag)return false;if(fQual&&l.fascia!==Number(fQual))return false;if(fSt&&l.stato!==fSt)return false;return true});

  // SORT: tipo > calibro > lotto > imballo (or by quality if toggled)
  const so=useMemo(()=>[...fl].sort((a,b)=>{
    if(sortQ)return a.qualita-b.qualita;
    if(a.desc1!==b.desc1)return a.desc1.localeCompare(b.desc1);
    if(a.desc3!==b.desc3)return a.desc3.localeCompare(b.desc3);
    if(a.lotto!==b.lotto)return a.lotto.localeCompare(b.lotto);
    return a.imballo.localeCompare(b.imballo);
  }),[fl,sortQ]);

  const totKg=so.reduce((s,l)=>s+l.d,0);
  const oc=contratti.filter(c=>(c.qta_tot-c.qta_evasa)>0);

  const doAssign=async id=>{if(!aC&&!aA){flash("err","Seleziona contratto o acquirente");return}const ct=contratti.find(c=>c.id===aC);await supabase.from("lotti").update({contratto:aC,acquirente:aC?ct?.cliente||aA:aA}).eq("id",id);setAId(null);setAC("");setAA("");flash("ok","Assegnato");await reload()};
  const doUn=async id=>{await supabase.from("lotti").update({contratto:"",acquirente:""}).eq("id",id);flash("ok","Rimosso");await reload()};
  const doUscita=async()=>{const lot=enr.find(l=>l.id===uscId);if(!lot)return;const q=Number(uscQta);if(!q||q<=0||q>lot.d){flash("err","Quantita non valida (max "+lot.d+")");return}
    await supabase.from("movimenti").insert({tipo:"USCITA",data:new Date().toISOString().split("T")[0],imballo:lot.imballo,lotto:lot.lotto,desc1:lot.desc1,desc2:lot.desc2,desc3:lot.desc3,qta:q,magazzino:lot.magazzino,contratto_id:lot.contratto||""});
    await supabase.from("lotti").update({mov:lot.mov+q}).eq("id",lot.id);
    const ctr=fc2(lot);if(ctr)await supabase.from("contratti").update({qta_evasa:ctr.qta_evasa+q}).eq("id",ctr.id);
    setUscId(null);setUscQta("");flash("ok","Uscita: "+q+" kg da "+lot.imballo);await reload()};
  const fc2=lot=>contratti.find(c=>c.id===lot.contratto&&(c.qta_tot-c.qta_evasa)>0);

  return <div>
    {dashFilter&&<div style={{marginBottom:12,display:"flex",alignItems:"center",gap:8}} data-no-print><span onClick={clearFilter} style={{fontSize:13,color:C.acc,cursor:"pointer",fontWeight:600}}>Dashboard</span><span style={{color:C.tM}}>/</span><span style={{fontSize:13,fontWeight:600}}>{dashFilter.val}</span></div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div><h1 style={{fontSize:28,fontWeight:900,color:C.t,margin:0,fontFamily:"'Playfair Display',serif"}}>Giacenze</h1><p style={{color:C.tM,margin:"4px 0 0",fontSize:13}}>{so.length} lotti — {totKg.toLocaleString()} kg</p></div><XBtn data={so} cols={XC.giacenze} name="giacenze"/></div><Msg msg={msg}/>

    {/* TYPE BUTTONS */}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}} data-no-print>
      <TypeChip label="Tutti" active={!fTipo} color={C.acc} onClick={()=>setFTipo("")}/>
      {TIPI.map(t=><TypeChip key={t} label={t} active={fTipo===t} color={TC[t]||C.acc} onClick={()=>setFTipo(fTipo===t?"":t)}/>)}
    </div>

    {/* OTHER FILTERS */}
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"flex-end"}} data-no-print>
      <Sel label="Calibro" value={fCal} onChange={setFCal} options={[{value:"",label:"Tutti"},...CALS.map(v=>({value:v,label:v}))]}/>
      <Sel label="Magazzino" value={fMag} onChange={setFMag} options={[{value:"",label:"Tutti"},...MAGS.map(v=>({value:v,label:v}))]}/>
      <Sel label="Qualita" value={fQual} onChange={setFQual} options={[{value:"",label:"Tutte"},...[1,2,3,4,5].map(v=>({value:String(v),label:BD[v].l}))]}/>
      <Sel label="Stato" value={fSt} onChange={setFSt} options={[{value:"",label:"Tutti"},{value:"L",label:"Liberi"},{value:"A",label:"Assegnati"}]}/>
      <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.tD,cursor:"pointer",padding:"8px 0"}}><input type="checkbox" checked={sortQ} onChange={e=>setSortQ(e.target.checked)} style={{accentColor:C.acc}}/>Ordina per qualita</label>
      {(fTipo||fCal||fMag||fQual||fSt)&&<Btn small onClick={()=>{setFTipo("");setFCal("");setFMag("");setFQual("");setFSt("");if(clearFilter)clearFilter()}}>Pulisci</Btn>}
    </div>

    {/* ASSIGN PANEL */}
    {aId&&isAdm&&<GCard style={{marginBottom:14}} data-no-print><h3 style={{fontSize:14,color:C.acc,margin:"0 0 10px",fontWeight:700}}>Assegna lotto</h3><div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}><Sel label="Contratto" value={aC} onChange={v=>{setAC(v);if(v){const c=contratti.find(x=>x.id===v);if(c)setAA(c.cliente)}}} options={[{value:"",label:"- Nessuno -"},...oc.map(c=>({value:c.id,label:c.id+" - "+c.cliente+" "+(c.qta_tot-c.qta_evasa).toLocaleString()+" kg"}))]} style={{flex:"1 1 300px"}}/><Inp label="Oppure acquirente" value={aA} onChange={setAA} disabled={!!aC}/><Btn primary small onClick={()=>doAssign(aId)}>Assegna</Btn><Btn small onClick={()=>{setAId(null);setAC("");setAA("")}}>Annulla</Btn></div></GCard>}

    {/* QUICK USCITA PANEL */}
    {uscId&&<GCard style={{marginBottom:14}} data-no-print>{(()=>{const lot=enr.find(l=>l.id===uscId);return lot?<><h3 style={{fontSize:14,color:C.r,margin:"0 0 10px",fontWeight:700}}>Uscita rapida — {lot.imballo} ({lot.d.toLocaleString()} kg disp.)</h3><div style={{display:"flex",gap:12,alignItems:"flex-end"}}><Inp label={"Quantita (max "+lot.d+")"} type="number" value={uscQta} onChange={setUscQta} style={{flex:1}}/><Btn small onClick={()=>setUscQta(String(lot.d))}>Tutto</Btn><Btn primary small onClick={doUscita}>Registra Uscita</Btn><Btn small onClick={()=>{setUscId(null);setUscQta("")}}>Annulla</Btn></div></>:null})()}</GCard>}

    {/* TABLE */}
    <Tbl cols={[
      {key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},
      {label:"Tipo",render:r=><Badge color={TC[r.desc1]||C.acc} bg={(TC[r.desc1]||C.acc)+"18"}>{r.desc1}</Badge>},
      {key:"desc2",label:"Lav."},
      {key:"desc3",label:"Cal."},
      {label:"Disp.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:C.acc}}>{r.d.toLocaleString()} kg</span>},
      {key:"magazzino",label:"Mag."},
      {label:"M.V.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{pct(r.mv)}</span>},
      {label:"M.O.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{pct(r.mo)}</span>},
      {label:"C.V.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{pct(r.cv)}</span>},
      {label:"C.O.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{pct(r.co)}</span>},
      {label:"C.E.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{pct(r.ce)}</span>},
      {label:"Qualita",render:r=><Badge color={BD[r.fascia].c} bg={BD[r.fascia].bg}>{r.qualita}</Badge>},
      {label:"Stato",render:r=>r.stato==="A"?<span style={{display:"flex",gap:4,alignItems:"center"}}><Badge color={C.b} bg={C.bD}>{r.contratto} {r.acquirente}</Badge>{isAdm&&<button onClick={e=>{e.stopPropagation();doUn(r.id)}} style={{background:"none",border:"none",color:C.r,cursor:"pointer",fontSize:12}}>x</button>}</span>:<Badge color={C.g} bg={C.gD}>Libero</Badge>},
      ...(isAdm?[{label:"",render:r=><div style={{display:"flex",gap:4}}>{r.stato==="L"&&<Btn small onClick={e=>{e.stopPropagation();setAId(r.id);setAC("");setAA("")}}>Assegna</Btn>}<Btn small danger onClick={e=>{e.stopPropagation();setUscId(r.id);setUscQta("")}}>Uscita</Btn></div>}]:[])
    ]} data={so}/>

    {/* TOTALS */}
    <div style={{marginTop:16,padding:"14px 20px",background:C.accL,borderRadius:10,border:"1px solid "+C.acc+"33",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontWeight:700,color:C.acc}}>TOTALE VISUALIZZATO</span>
      <span style={{fontSize:20,fontWeight:900,color:C.acc,fontFamily:"'DM Mono',monospace"}}>{totKg.toLocaleString()} kg</span>
      <span style={{fontSize:13,color:C.tD}}>{so.length} lotti</span>
    </div>
    <div className="print-total" style={{display:"none"}}>{so.length} lotti — {totKg.toLocaleString()} kg</div>
  </div>;
}

// === LOTTI ===
function LottiPage({lotti,reload,isAdm}){
  const[f,setF]=useState({d1:"",st:""});const[eId,setEId]=useState(null);const[dId,setDId]=useState(null);const[msg,setMsg]=useState(null);const[form,setForm]=useState({});
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};
  const openEdit=l=>{setEId(l.id);setForm({imballo:l.imballo,lotto:l.lotto,desc1:l.desc1,desc2:l.desc2,desc3:l.desc3,q_iniz:String(l.q_iniz),magazzino:l.magazzino,mv:String(((l.mv||0)*100).toFixed(2)),mo:String(((l.mo||0)*100).toFixed(2)),cv:String(((l.cv||0)*100).toFixed(2)),co:String(((l.co||0)*100).toFixed(2)),ce:String(((l.ce||0)*100).toFixed(2))})};
  const doSave=async()=>{try{await supabase.from("lotti").update({imballo:form.imballo,lotto:form.lotto,desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,q_iniz:Number(form.q_iniz),magazzino:form.magazzino,mv:(Number(form.mv)||0)/100,mo:(Number(form.mo)||0)/100,cv:(Number(form.cv)||0)/100,co:(Number(form.co)||0)/100,ce:(Number(form.ce)||0)/100}).eq("id",eId);setEId(null);flash("ok","Aggiornato");await reload()}catch(e){flash("err",e.message)}};
  const doDel=async id=>{try{await supabase.from("lotti").delete().eq("id",id);setDId(null);flash("ok","Eliminato");await reload()}catch(e){flash("err",e.message)}};
  const fl=lotti.filter(l=>{if(f.d1&&l.desc1!==f.d1)return false;if(f.st==="D"&&dsp(l)<=0)return false;if(f.st==="E"&&dsp(l)>0)return false;return true});
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><div><h1 style={{fontSize:28,fontWeight:900,color:C.t,margin:0,fontFamily:"'Playfair Display',serif"}}>Lotti</h1><p style={{color:C.tM,margin:"4px 0 0",fontSize:13}}>{fl.length} lotti</p></div><XBtn data={fl} cols={XC.lotti} name="lotti"/></div><Msg msg={msg}/>
    <div style={{display:"flex",gap:10,marginBottom:16}} data-no-print><Sel label="Tipo" value={f.d1} onChange={v=>setF({...f,d1:v})} options={[{value:"",label:"Tutti"},...TIPI.map(v=>({value:v,label:v}))]}/><Sel label="Stato" value={f.st} onChange={v=>setF({...f,st:v})} options={[{value:"",label:"Tutti"},{value:"D",label:"Disponibile"},{value:"E",label:"Esaurito"}]}/></div>
    {eId&&isAdm&&<GCard style={{marginBottom:20}} data-no-print><h3 style={{fontSize:16,fontWeight:800,color:C.acc,margin:"0 0 16px"}}>Modifica lotto</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12}}><Inp label="Imballo" value={form.imballo} onChange={v=>setForm({...form,imballo:v})}/><Inp label="Lotto" value={form.lotto} onChange={v=>setForm({...form,lotto:v})}/><Sel label="Tipo" value={form.desc1} onChange={v=>setForm({...form,desc1:v})} options={TIPI.map(v=>({value:v,label:v}))}/><Sel label="Lavoraz." value={form.desc2} onChange={v=>setForm({...form,desc2:v})} options={LAVS.map(v=>({value:v,label:v}))}/><Sel label="Cal." value={form.desc3} onChange={v=>setForm({...form,desc3:v})} options={CALS.map(v=>({value:v,label:v}))}/><Inp label="Qta (kg)" type="number" value={form.q_iniz} onChange={v=>setForm({...form,q_iniz:v})}/><Sel label="Mag." value={form.magazzino} onChange={v=>setForm({...form,magazzino:v})} options={MAGS.map(v=>({value:v,label:v}))}/><Inp label="M.V. %" value={form.mv} onChange={v=>setForm({...form,mv:v})}/><Inp label="M.O. %" value={form.mo} onChange={v=>setForm({...form,mo:v})}/><Inp label="C.V. %" value={form.cv} onChange={v=>setForm({...form,cv:v})}/><Inp label="C.O. %" value={form.co} onChange={v=>setForm({...form,co:v})}/><Inp label="C.E. %" value={form.ce} onChange={v=>setForm({...form,ce:v})}/></div><div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}><Btn onClick={()=>setEId(null)}>Annulla</Btn><Btn primary onClick={doSave}>Salva</Btn></div></GCard>}
    <Tbl cols={[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{label:"Tipo",render:r=><Badge color={TC[r.desc1]||C.acc} bg={(TC[r.desc1]||C.acc)+"18"}>{r.desc1}</Badge>},{key:"desc2",label:"Lav."},{key:"desc3",label:"Cal."},{label:"Q.Iniz",render:r=><span style={{fontFamily:"'DM Mono',monospace"}}>{r.q_iniz?.toLocaleString()}</span>},{label:"Mov.",render:r=><span style={{fontFamily:"'DM Mono',monospace",color:r.mov>0?C.r:C.tM}}>{r.mov?.toLocaleString()}</span>},{label:"Disp.",render:r=>{const d=dsp(r);return <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:d>0?C.g:C.r}}>{d.toLocaleString()}</span>}},{label:"Stato",render:r=>dsp(r)>0?<Badge color={C.g} bg={C.gD}>Disp.</Badge>:<Badge color={C.tM} bg={C.bd+"44"}>Esaurito</Badge>},{key:"magazzino",label:"Mag."},{key:"contratto",label:"Contr."},...(isAdm?[{label:"",render:r=><div style={{display:"flex",gap:6}}><button onClick={e=>{e.stopPropagation();openEdit(r)}} style={{background:"none",border:"none",color:C.acc,cursor:"pointer",fontSize:12,fontWeight:600}}>Mod</button>{dId===r.id?<span style={{display:"flex",gap:4}}><button onClick={e=>{e.stopPropagation();doDel(r.id)}} style={{background:C.r,border:"none",color:"#fff",cursor:"pointer",fontSize:11,padding:"3px 8px",borderRadius:6,fontWeight:700}}>Si</button><button onClick={e=>{e.stopPropagation();setDId(null)}} style={{background:C.sf,border:"1px solid "+C.bd,color:C.tD,cursor:"pointer",fontSize:11,padding:"3px 8px",borderRadius:6}}>No</button></span>:<button onClick={e=>{e.stopPropagation();setDId(r.id)}} style={{background:"none",border:"none",color:C.r,cursor:"pointer",fontSize:12,fontWeight:600,opacity:.7}}>Elim</button>}</div>}]:[])] } data={fl}/>
  </div>;
}

// === CONTRATTI (with filters, date format, click for exits) ===
function ContrattiPage({contratti,lotti,movimenti,reload,isAdm}){
  const[showF,setShowF]=useState(false);const[eId,setEId]=useState(null);const[dId,setDId]=useState(null);const[msg,setMsg]=useState(null);
  const[fCl,setFCl]=useState("");const[fTp,setFTp]=useState("");const[fSt,setFSt]=useState("");
  const[selContr,setSelContr]=useState(null);
  const ef={id:"",desc1:"CONVENZIONALI",desc2:"SGUSCIATE",desc3:"9/11",cliente:"",scadenza:"",qta_tot:"",qta_evasa:"0"};const[form,setForm]=useState(ef);
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};const openNew=()=>{setForm(ef);setEId(null);setShowF(true)};
  const openEdit=c=>{setForm({id:c.id,desc1:c.desc1,desc2:c.desc2,desc3:c.desc3,cliente:c.cliente,scadenza:c.scadenza||"",qta_tot:String(c.qta_tot),qta_evasa:String(c.qta_evasa)});setEId(c.id);setShowF(true)};
  const doSave=async()=>{if(!form.id||!form.cliente||!form.qta_tot){flash("err","Compila campi obbligatori");return}try{if(eId){await supabase.from("contratti").update({desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,cliente:form.cliente,scadenza:form.scadenza||null,qta_tot:Number(form.qta_tot),qta_evasa:Number(form.qta_evasa)}).eq("id",eId)}else{const{error}=await supabase.from("contratti").insert({id:form.id,desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,cliente:form.cliente,scadenza:form.scadenza||null,qta_tot:Number(form.qta_tot),qta_evasa:Number(form.qta_evasa||0)});if(error){flash("err",error.message);return}}flash("ok",eId?"Aggiornato":"Creato");setShowF(false);setEId(null);await reload()}catch(e){flash("err",e.message)}};
  const doDel=async id=>{await supabase.from("lotti").update({contratto:"",acquirente:""}).eq("contratto",id);await supabase.from("contratti").delete().eq("id",id);setDId(null);flash("ok","Eliminato");await reload()};
  const filtered=contratti.filter(c=>{if(fCl&&!c.cliente.toUpperCase().includes(fCl.toUpperCase()))return false;if(fTp&&c.desc1!==fTp)return false;if(fSt==="A"&&(c.qta_tot-c.qta_evasa)<=0)return false;if(fSt==="C"&&(c.qta_tot-c.qta_evasa)>0)return false;return true});
  const contrExits=selContr?movimenti.filter(m=>m.contratto_id===selContr):[];
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{fontSize:28,fontWeight:900,color:C.t,margin:0,fontFamily:"'Playfair Display',serif"}}>Contratti</h1><div style={{display:"flex",gap:10}}><XBtn data={filtered} cols={XC.contratti} name="contratti"/>{isAdm&&<Btn primary onClick={openNew}>+ Nuovo</Btn>}</div></div><Msg msg={msg}/>
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}} data-no-print><Inp label="Cerca cliente" value={fCl} onChange={setFCl} placeholder="ITALNUX..." style={{flex:"1 1 200px"}}/><Sel label="Tipo" value={fTp} onChange={setFTp} options={[{value:"",label:"Tutti"},...TIPI.map(v=>({value:v,label:v}))]}/><Sel label="Stato" value={fSt} onChange={setFSt} options={[{value:"",label:"Tutti"},{value:"A",label:"Aperti"},{value:"C",label:"Chiusi"}]}/></div>
    {showF&&isAdm&&<GCard style={{marginBottom:20}} data-no-print><h3 style={{fontSize:16,fontWeight:800,color:C.acc,margin:"0 0 16px"}}>{eId?"Modifica":"Nuovo"} Contratto</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}><Inp label="N. *" value={form.id} onChange={v=>setForm({...form,id:v})} disabled={!!eId}/><Inp label="Cliente *" value={form.cliente} onChange={v=>setForm({...form,cliente:v})}/><Sel label="Tipo" value={form.desc1} onChange={v=>setForm({...form,desc1:v})} options={TIPI.map(v=>({value:v,label:v}))}/><Sel label="Lavoraz." value={form.desc2} onChange={v=>setForm({...form,desc2:v})} options={LAVS.map(v=>({value:v,label:v}))}/><Sel label="Cal." value={form.desc3} onChange={v=>setForm({...form,desc3:v})} options={CALS.map(v=>({value:v,label:v}))}/><Inp label="Scadenza" type="date" value={form.scadenza} onChange={v=>setForm({...form,scadenza:v})}/><Inp label="Qta Tot *" type="number" value={form.qta_tot} onChange={v=>setForm({...form,qta_tot:v})}/>{eId&&<Inp label="Qta Evasa" type="number" value={form.qta_evasa} onChange={v=>setForm({...form,qta_evasa:v})}/>}</div><div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}><Btn onClick={()=>{setShowF(false);setEId(null)}}>Annulla</Btn><Btn primary onClick={doSave}>{eId?"Salva":"Crea"}</Btn></div></GCard>}
    <p style={{fontSize:12,color:C.tM,marginBottom:8}} data-no-print>Clicca su un contratto per vedere le uscite</p>
    <Tbl cols={[{key:"id",label:"N."},{key:"cliente",label:"Cliente"},{label:"Tipo",render:r=><Badge color={TC[r.desc1]||C.acc} bg={(TC[r.desc1]||C.acc)+"18"}>{r.desc1}</Badge>},{key:"desc3",label:"Cal."},{label:"Totale",render:r=><span style={{fontFamily:"'DM Mono',monospace"}}>{r.qta_tot?.toLocaleString()}</span>},{label:"Evasa",render:r=><span style={{fontFamily:"'DM Mono',monospace"}}>{r.qta_evasa?.toLocaleString()}</span>},{label:"Residuo",render:r=>{const res=r.qta_tot-r.qta_evasa;return <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:res>0?C.o:C.g}}>{res.toLocaleString()}</span>}},{label:"%",render:r=>{const p=Math.min(100,r.qta_evasa/r.qta_tot*100);return <div style={{display:"flex",alignItems:"center",gap:8,minWidth:90}}><div style={{flex:1,height:4,background:C.bd+"44",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:p+"%",background:p>=100?C.g:C.acc,borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:700,color:C.tD,fontFamily:"'DM Mono',monospace"}}>{p.toFixed(0)}%</span></div>}},{label:"Stato",render:r=>(r.qta_tot-r.qta_evasa)>0?<Badge color={C.o} bg={C.oD}>Aperto</Badge>:<Badge color={C.g} bg={C.gD}>Chiuso</Badge>},{label:"Scadenza",render:r=>fmtD(r.scadenza)},...(isAdm?[{label:"",render:r=><div style={{display:"flex",gap:6}}><button onClick={e=>{e.stopPropagation();openEdit(r)}} style={{background:"none",border:"none",color:C.acc,cursor:"pointer",fontSize:12,fontWeight:600}}>Mod</button>{dId===r.id?<span style={{display:"flex",gap:4}}><button onClick={e=>{e.stopPropagation();doDel(r.id)}} style={{background:C.r,border:"none",color:"#fff",cursor:"pointer",fontSize:11,padding:"3px 8px",borderRadius:6,fontWeight:700}}>Si</button><button onClick={e=>{e.stopPropagation();setDId(null)}} style={{background:C.sf,border:"1px solid "+C.bd,color:C.tD,cursor:"pointer",fontSize:11,padding:"3px 8px",borderRadius:6}}>No</button></span>:<button onClick={e=>{e.stopPropagation();setDId(r.id)}} style={{background:"none",border:"none",color:C.r,cursor:"pointer",fontSize:12,fontWeight:600,opacity:.7}}>Elim</button>}</div>}]:[])] } data={filtered} onRow={r=>setSelContr(selContr===r.id?null:r.id)}/>

    {/* EXIT DETAIL for selected contract */}
    {selContr&&<div style={{marginTop:16,animation:"fadeUp .3s both"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><h3 style={{fontSize:14,color:C.acc,fontWeight:700}}>Uscite contratto N.{selContr} ({contrExits.length} movimenti)</h3><Btn small onClick={()=>setSelContr(null)}>Chiudi</Btn></div>
    {contrExits.length>0?<Tbl cols={[{label:"Data",render:r=>fmtD(r.data)},{key:"imballo",label:"Imballo"},{key:"lotto",label:"Lotto"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Qta",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700}}>{r.qta?.toLocaleString()} kg</span>},{key:"magazzino",label:"Mag."}]} data={contrExits}/>:<p style={{color:C.tM,fontSize:13}}>Nessuna uscita registrata per questo contratto</p>}</div>}
  </div>;
}

// === RICERCA ===
function RicercaPage({lotti}){
  const[q,setQ]=useState("");const av=lotti.filter(l=>dsp(l)>0);
  const res=q.length<2?[]:av.filter(l=>[l.lotto,l.imballo,l.desc1,l.desc2,l.desc3,l.magazzino,l.acquirente,l.contratto].some(v=>v&&String(v).toUpperCase().includes(q.toUpperCase())));
  return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}><h1 style={{fontSize:28,fontWeight:900,color:C.t,margin:0,fontFamily:"'Playfair Display',serif"}}>Ricerca</h1>{res.length>0&&<XBtn data={res} cols={XC.giacenze} name="ricerca"/>}</div>
  <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca lotto, tipo, calibro, magazzino, acquirente..." style={{width:"100%",padding:"14px 20px",background:C.sf,border:"2px solid "+(q.length>=2?C.acc+"66":C.bd),borderRadius:10,color:C.t,fontSize:16,outline:"none",marginBottom:16,boxSizing:"border-box",transition:"border .3s"}} data-no-print/>
  {q.length>=2&&<><p style={{color:C.tM,fontSize:13,marginBottom:12}}>{res.length} risultati</p><Tbl cols={[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{label:"Tipo",render:r=><Badge color={TC[r.desc1]||C.acc} bg={(TC[r.desc1]||C.acc)+"18"}>{r.desc1}</Badge>},{key:"desc3",label:"Cal."},{label:"Disp.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:C.acc}}>{dsp(r).toLocaleString()} kg</span>},{key:"magazzino",label:"Mag."},{label:"Qualita",render:r=>{const q2=qi(r);return <Badge color={BD[bn(q2)].c} bg={BD[bn(q2)].bg}>{q2}</Badge>}},{key:"contratto",label:"Contr."},{key:"acquirente",label:"Acq."}]} data={res}/></>}</div>;
}

// === STORICO (sorted tipo>cal>lotto>imballo) ===
function StoricoPage(){
  const[dt,setDt]=useState(new Date().toISOString().split("T")[0]);const[ld,setLd]=useState(false);const[snap,setSnap]=useState(null);
  const xCols=[{key:"desc1",label:"Tipo"},{key:"desc3",label:"Calibro"},{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"ent",label:"Entrate"},{key:"usc",label:"Uscite"},{key:"disp",label:"Disponibile"},{key:"magazzino",label:"Magazzino"}];
  const calc=useCallback(async()=>{setLd(true);const{data:movs}=await supabase.from("movimenti").select("*").lte("data",dt).order("data").order("id");const mp={};(movs||[]).forEach(m=>{const k=m.lotto+"||"+m.imballo;if(m.tipo==="ENTRATA"){if(!mp[k])mp[k]={lotto:m.lotto,imballo:m.imballo,desc1:m.desc1,desc2:m.desc2,desc3:m.desc3,magazzino:m.magazzino,ent:0,usc:0};mp[k].ent+=m.qta;mp[k].magazzino=m.magazzino}else if(m.tipo==="USCITA"&&mp[k])mp[k].usc+=m.qta;else if(m.tipo==="TRASFERIMENTO"&&mp[k])mp[k].magazzino=m.magazzino});
  const ls=Object.values(mp).map(l=>({...l,disp:l.ent-l.usc})).filter(l=>l.ent>0);
  // Sort: tipo > calibro > lotto > imballo
  ls.sort((a,b)=>{if(a.desc1!==b.desc1)return a.desc1.localeCompare(b.desc1);if(a.desc3!==b.desc3)return a.desc3.localeCompare(b.desc3);if(a.lotto!==b.lotto)return a.lotto.localeCompare(b.lotto);return a.imballo.localeCompare(b.imballo)});
  const tot=ls.reduce((s,l)=>s+Math.max(0,l.disp),0);const av=ls.filter(l=>l.disp>0);const pt={};av.forEach(l=>{pt[l.desc1]=(pt[l.desc1]||0)+l.disp});const pm={};av.forEach(l=>{pm[l.magazzino]=(pm[l.magazzino]||0)+l.disp});setSnap({dt,ls,av,tot,pt,pm,nm:(movs||[]).length});setLd(false)},[dt]);
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}><div><h1 style={{fontSize:28,fontWeight:900,color:C.t,margin:0,fontFamily:"'Playfair Display',serif"}}>Storico</h1><p style={{color:C.tM,margin:"4px 0 0",fontSize:13}}>Giacenze disponibili a una data</p></div>{snap&&<XBtn data={snap.av} cols={xCols} name={"storico_"+snap.dt}/>}</div>
    <GCard style={{marginBottom:24,display:"flex",gap:16,alignItems:"flex-end"}} data-no-print><div style={{display:"flex",flexDirection:"column",gap:4}}><label style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>Data</label><input type="date" value={dt} onChange={e=>setDt(e.target.value)} style={{padding:"10px 14px",background:C.sf,border:"2px solid "+C.acc+"66",borderRadius:8,color:C.t,fontSize:16,outline:"none",fontFamily:"'DM Mono',monospace"}}/></div><Btn primary onClick={calc} disabled={ld}>{ld?"Calcolo...":"Visualizza al "+fmtD(dt)}</Btn></GCard>
    {snap&&<><div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:20}}><GCard><div style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:1.5,fontWeight:600}}>Giacenza al {fmtD(snap.dt)}</div><div style={{fontSize:26,fontWeight:900,color:C.acc,fontFamily:"'DM Mono',monospace",marginTop:6}}>{snap.tot.toLocaleString()} kg</div><div style={{fontSize:12,color:C.tM,marginTop:4}}>{snap.av.length} lotti</div></GCard><GCard><div style={{fontSize:10,color:C.tD,textTransform:"uppercase",letterSpacing:1.5,fontWeight:600}}>Movimenti</div><div style={{fontSize:26,fontWeight:900,color:C.b,fontFamily:"'DM Mono',monospace",marginTop:6}}>{snap.nm}</div></GCard></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
      <GCard><h3 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:2,margin:"0 0 14px",fontWeight:600}}>Per Tipo</h3>{Object.entries(snap.pt).sort((a,b)=>b[1]-a[1]).map(([t,kg])=>{const mx=Math.max(...Object.values(snap.pt),1);const color=TC[t]||C.acc;return <div key={t} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,display:"flex",alignItems:"center",gap:8}}><span style={{width:8,height:8,borderRadius:2,background:color,display:"inline-block"}}/>{t}</span><span style={{fontSize:13,color,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{kg.toLocaleString()} kg</span></div><div style={{height:4,background:C.bd+"44",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:(kg/mx*100)+"%",background:color,borderRadius:3,opacity:.7}}/></div></div>})}</GCard>
      <GCard><h3 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:2,margin:"0 0 14px",fontWeight:600}}>Per Magazzino</h3><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{Object.entries(snap.pm).map(([m,kg])=><div key={m} style={{background:C.zebra,border:"1px solid "+C.bd,borderRadius:10,padding:"12px 18px",textAlign:"center",flex:"1 1 100px"}}><div style={{fontSize:20,fontWeight:800,color:C.acc,fontFamily:"'DM Mono',monospace"}}>{kg.toLocaleString()}</div><div style={{fontSize:12,color:C.tM,marginTop:4}}>{m}</div></div>)}</div></GCard>
    </div>
    <Tbl cols={[{label:"Tipo",render:r=><Badge color={TC[r.desc1]||C.acc} bg={(TC[r.desc1]||C.acc)+"18"}>{r.desc1}</Badge>},{key:"desc3",label:"Cal."},{label:"Lotto",render:r=><strong>{r.lotto}</strong>},{key:"imballo",label:"Imballo"},{label:"Entrate",render:r=><span style={{fontFamily:"'DM Mono',monospace",color:C.g}}>{r.ent.toLocaleString()}</span>},{label:"Uscite",render:r=><span style={{fontFamily:"'DM Mono',monospace",color:r.usc>0?C.r:C.tM}}>{r.usc.toLocaleString()}</span>},{label:"Disp.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:r.disp>0?C.acc:C.r}}>{r.disp.toLocaleString()} kg</span>},{key:"magazzino",label:"Mag."}]} data={snap.ls}/>
    <div style={{marginTop:14,padding:"12px 20px",background:C.accL,borderRadius:8,display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700,color:C.acc}}>TOTALE</span><span style={{fontSize:18,fontWeight:900,color:C.acc,fontFamily:"'DM Mono',monospace"}}>{snap.tot.toLocaleString()} kg</span><span style={{fontSize:13,color:C.tD}}>{snap.av.length} lotti</span></div></>}
    {!snap&&!ld&&<div style={{textAlign:"center",padding:60,color:C.tM}}><p>Seleziona una data e clicca Visualizza</p></div>}
  </div>;
}

// === UTENTI ===
function UtentiPage(){
  const[users,setUsers]=useState([]);const[msg,setMsg]=useState(null);const[showN,setShowN]=useState(false);
  const[nE,setNE]=useState("");const[nP,setNP]=useState("");const[nN,setNN]=useState("");const[nR,setNR]=useState("operatore");
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};
  const load=useCallback(async()=>{const{data}=await supabase.from("user_profiles").select("*").order("created_at");setUsers(data||[])},[]);
  useEffect(()=>{load()},[load]);
  const create=async()=>{if(!nE||!nP){flash("err","Email e password obbligatori");return}const{data,error}=await supabase.auth.signUp({email:nE,password:nP});if(error){flash("err",error.message);return}if(data.user)await supabase.from("user_profiles").update({nome:nN,ruolo:nR}).eq("id",data.user.id);setShowN(false);setNE("");setNP("");setNN("");flash("ok","Utente creato");await load()};
  const toggle=async u=>{const nr=u.ruolo==="admin"?"operatore":"admin";await supabase.from("user_profiles").update({ruolo:nr}).eq("id",u.id);flash("ok","Ruolo aggiornato");await load()};
  return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h1 style={{fontSize:28,fontWeight:900,color:C.t,margin:0,fontFamily:"'Playfair Display',serif"}}>Utenti</h1><Btn primary onClick={()=>setShowN(true)}>+ Nuovo Utente</Btn></div><Msg msg={msg}/>
    {showN&&<GCard style={{marginBottom:20}}><h3 style={{fontSize:16,fontWeight:800,color:C.acc,margin:"0 0 16px"}}>Nuovo Utente</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}><Inp label="Email *" value={nE} onChange={setNE} placeholder="mario@assofrutti.it"/><Inp label="Password *" value={nP} onChange={setNP} type="password" placeholder="Min 6 caratteri"/><Inp label="Nome" value={nN} onChange={setNN}/><Sel label="Ruolo" value={nR} onChange={setNR} options={[{value:"operatore",label:"Operatore"},{value:"admin",label:"Admin"}]}/></div><div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}><Btn onClick={()=>setShowN(false)}>Annulla</Btn><Btn primary onClick={create}>Crea</Btn></div></GCard>}
    <Tbl cols={[{key:"email",label:"Email"},{key:"nome",label:"Nome"},{label:"Ruolo",render:r=><Badge color={r.ruolo==="admin"?C.acc:C.b} bg={r.ruolo==="admin"?C.accL:C.bD}>{r.ruolo}</Badge>},{label:"",render:r=><Btn small onClick={()=>toggle(r)}>{r.ruolo==="admin"?"Rendi Operatore":"Rendi Admin"}</Btn>}]} data={users}/>
  </div>;
}

// === MAIN APP ===
const NAV=[{id:"dashboard",icon:"\u25c6",label:"Dashboard"},{id:"movimenti",icon:"\u2195",label:"Movimenti"},{id:"giacenze",icon:"\u25a3",label:"Giacenze"},{id:"lotti",icon:"\u25a4",label:"Lotti"},{id:"contratti",icon:"\u25c8",label:"Contratti"},{id:"ricerca",icon:"\u2315",label:"Ricerca"},{id:"storico",icon:"\u23f0",label:"Storico"}];

export default function App(){
  const[session,setSession]=useState(null);const[profile,setProfile]=useState(null);const[authLd,setAuthLd]=useState(true);
  const[page,setPage]=useState("dashboard");const[lotti,setLotti]=useState([]);const[contratti,setContratti]=useState([]);const[movimenti,setMovimenti]=useState([]);const[sO,setSO]=useState(true);const[dbErr,setDbErr]=useState(null);
  const[dashFilter,setDashFilter]=useState(null);
  const[theme,setTheme]=useState(()=>{try{return localStorage.getItem("af_theme")||"light"}catch(e){return "light"}});

  // Apply theme globally
  C=theme==="dark"?DARK:LIGHT;

  const toggleTheme=t=>{setTheme(t);try{localStorage.setItem("af_theme",t)}catch(e){}};

  useEffect(()=>{supabase.auth.getSession().then(({data:{session:s}})=>{setSession(s);if(!s)setAuthLd(false)});const{data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>{setSession(s);if(!s){setProfile(null);setAuthLd(false)}});return()=>subscription.unsubscribe()},[]);
  useEffect(()=>{if(!session?.user)return;supabase.from("user_profiles").select("*").eq("id",session.user.id).single().then(({data})=>{setProfile(data);setAuthLd(false)})},[session]);
  const loadAll=useCallback(async()=>{try{const[lr,cr,mr]=await Promise.all([supabase.from("lotti").select("*").order("id"),supabase.from("contratti").select("*").order("id"),supabase.from("movimenti").select("*").order("id",{ascending:false}).limit(500)]);if(lr.error)throw lr.error;setLotti(lr.data||[]);setContratti(cr.data||[]);setMovimenti(mr.data||[]);setDbErr(null)}catch(e){setDbErr(e.message)}},[]);
  useEffect(()=>{if(session)loadAll()},[session,loadAll]);

  if(authLd)return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,color:C.acc,fontSize:18,fontFamily:"'DM Sans',sans-serif"}}><style>{CSS}</style>Caricamento...</div>;
  if(!session)return <LoginPage/>;
  if(dbErr)return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,flexDirection:"column",gap:16,fontFamily:"'DM Sans',sans-serif"}}><style>{CSS}</style><div style={{color:C.r,fontSize:18,fontWeight:700}}>Errore connessione</div><div style={{color:C.tM,fontSize:13,maxWidth:400,textAlign:"center"}}>{dbErr}</div><Btn primary onClick={loadAll}>Riprova</Btn></div>;

  const isAdm=profile?.ruolo==="admin";
  const navItems=[...NAV,...(isAdm?[{id:"utenti",icon:"\u2699",label:"Utenti"}]:[])];
  const logout=async()=>{await supabase.auth.signOut()};
  const goPage=(p,filter)=>{setPage(p);setDashFilter(filter||null)};

  const pg=()=>{switch(page){
    case"dashboard":return <DashboardPage lotti={lotti} contratti={contratti} goPage={goPage}/>;
    case"movimenti":return <MovimentiPage lotti={lotti} contratti={contratti} movimenti={movimenti} reload={loadAll} isAdm={isAdm}/>;
    case"giacenze":return <GiacenzePage lotti={lotti} contratti={contratti} reload={loadAll} isAdm={isAdm} dashFilter={dashFilter} clearFilter={()=>{setDashFilter(null);setPage("dashboard")}}/>;
    case"lotti":return <LottiPage lotti={lotti} reload={loadAll} isAdm={isAdm}/>;
    case"contratti":return <ContrattiPage contratti={contratti} lotti={lotti} movimenti={movimenti} reload={loadAll} isAdm={isAdm}/>;
    case"ricerca":return <RicercaPage lotti={lotti}/>;
    case"storico":return <StoricoPage/>;
    case"utenti":return isAdm?<UtentiPage/>:null;
    default:return null}};

  return <div style={{display:"flex",height:"100vh",background:C.bg,fontFamily:"'DM Sans','Segoe UI',sans-serif",color:C.t,overflow:"hidden"}}>
    <style>{CSS}</style>
    <div data-no-print style={{width:sO?220:60,background:C.sf,borderRight:"1px solid "+C.bd,display:"flex",flexDirection:"column",transition:"width .25s",flexShrink:0,overflow:"hidden",boxShadow:"1px 0 8px rgba(0,0,0,0.03)"}}>
      <div style={{padding:sO?"18px 16px":"18px 14px",borderBottom:"1px solid "+C.bd,display:"flex",alignItems:"center",gap:12,cursor:"pointer",minHeight:62}} onClick={()=>setSO(!sO)}>
        <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,"+C.acc+","+C.accD+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900,color:"#fff",flexShrink:0,boxShadow:"0 2px 8px "+C.acc+"33"}}>A</div>
        {sO&&<div><div style={{fontSize:14,fontWeight:800,color:C.acc,letterSpacing:1,lineHeight:1.1}}>ASSOFRUTTI</div><div style={{fontSize:9,color:C.tM,letterSpacing:2,marginTop:2}}>MAGAZZINO</div></div>}
      </div>
      <nav style={{flex:1,padding:"10px 8px"}}>{navItems.map((item,i)=>
        <div key={item.id} onClick={()=>goPage(item.id)} style={{display:"flex",alignItems:"center",gap:12,padding:sO?"9px 12px":"9px 14px",borderRadius:8,marginBottom:2,cursor:"pointer",background:page===item.id?C.accL:"transparent",borderLeft:page===item.id?"3px solid "+C.acc:"3px solid transparent",transition:"all .15s"}}
          onMouseEnter={e=>{if(page!==item.id)e.currentTarget.style.background=C.sfH}} onMouseLeave={e=>{if(page!==item.id)e.currentTarget.style.background="transparent"}}>
          <span style={{fontSize:15,opacity:page===item.id?1:.4,flexShrink:0}}>{item.icon}</span>
          {sO&&<span style={{fontSize:13,fontWeight:page===item.id?700:400,color:page===item.id?C.acc:C.tD,whiteSpace:"nowrap"}}>{item.label}</span>}
        </div>
      )}</nav>
      {sO&&<div style={{padding:"14px 16px",borderTop:"1px solid "+C.bd}}>
        {/* THEME TOGGLE */}
        <div style={{display:"flex",gap:4,marginBottom:12}}>
          <button onClick={()=>toggleTheme("light")} title="Tema chiaro" style={{flex:1,padding:"6px",borderRadius:6,border:"1px solid "+(theme==="light"?C.acc:C.bd),background:theme==="light"?C.accL:"transparent",cursor:"pointer",fontSize:16,transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
            <span>&#9788;</span>{sO&&<span style={{fontSize:10,color:theme==="light"?C.acc:C.tM,fontWeight:600}}>Chiaro</span>}
          </button>
          <button onClick={()=>toggleTheme("dark")} title="Tema scuro" style={{flex:1,padding:"6px",borderRadius:6,border:"1px solid "+(theme==="dark"?C.acc:C.bd),background:theme==="dark"?C.accL:"transparent",cursor:"pointer",fontSize:16,transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
            <span>&#9790;</span>{sO&&<span style={{fontSize:10,color:theme==="dark"?C.acc:C.tM,fontWeight:600}}>Scuro</span>}
          </button>
        </div>
        <div style={{fontSize:12,color:C.tD,marginBottom:6,fontWeight:500}}>{profile?.nome||session?.user?.email}</div>
        <Badge color={isAdm?C.acc:C.b} bg={isAdm?C.accL:C.bD}>{profile?.ruolo||"..."}</Badge>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <Btn small onClick={loadAll} style={{flex:1,fontSize:11}}>Aggiorna</Btn>
          <Btn small onClick={logout} style={{flex:1,fontSize:11}}>Esci</Btn>
        </div>
      </div>}
    </div>
    <div style={{flex:1,overflow:"auto",padding:"24px 28px",background:C.bg}}>{pg()}</div>
  </div>;
}
