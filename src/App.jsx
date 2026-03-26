import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";

// === HELPERS ===
const qi=l=>Number((((l.mv||0)*100*5+(l.mo||0)*100*7+(l.co||0)*100*3)/15).toFixed(2));
const bn=i=>i<=2.5?1:i<=3?2:i<=4.5?3:i<=6?4:5;
const pct=v=>((v||0)*100).toFixed(1)+"%";
const dsp=l=>(l.q_iniz||0)-(l.mov||0);
const xls=(data,cols,name)=>{const rows=data.map(r=>{const o={};cols.forEach(c=>{o[c.label]=c.gv?c.gv(r):r[c.key]??""});return o});const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Dati");XLSX.writeFile(wb,name+".xlsx")};

const C={bg:"#0f1419",sf:"#1a2029",sfH:"#222c38",card:"#1e2836",bd:"#2a3a4a",acc:"#d4a855",accD:"#a3833e",g:"#4ade80",gD:"#166534",r:"#f87171",rD:"#7f1d1d",o:"#fb923c",oD:"#9a3412",b:"#60a5fa",bD:"#1e3a5f",t:"#e8e0d4",tD:"#8899aa",tM:"#5a6a7a",pk:"#152030",pkS:"#1e3a55"};
const BD={1:{l:"Eccellente",c:C.g,b:C.gD},2:{l:"Buona",c:"#a3e635",b:"#365314"},3:{l:"Media",c:C.o,b:C.oD},4:{l:"Bassa",c:C.r,b:C.rD},5:{l:"Critica",c:"#ef4444",b:"#450a0a"}};
const TIPI=["CONVENZIONALI","BIOLOGICHE","GIFFONI","FAIR FOR LIFE","BIOSUISSE"];
const LAVS=["SGUSCIATE","IN GUSCIO","ROTTAME","GRANELLA","PASTA"];
const CALS=["9/11","11/13","13/15"];
const MAGS=["Fabrica","Soriano","Caprarola"];
const XC={
  giacenze:[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Calibro"},{label:"Disponibile",gv:r=>dsp(r)},{key:"magazzino",label:"Magazzino"},{label:"Indice Qualita",gv:r=>qi(r)},{key:"contratto",label:"Contratto"},{key:"acquirente",label:"Acquirente"}],
  lotti:[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Calibro"},{key:"q_iniz",label:"Q.Iniziale"},{key:"mov",label:"Movimentato"},{label:"Disponibile",gv:r=>dsp(r)},{label:"Stato",gv:r=>dsp(r)>0?"DISPONIBILE":"ESAURITO"},{key:"magazzino",label:"Magazzino"},{key:"contratto",label:"Contratto"}],
  contratti:[{key:"id",label:"N.Contratto"},{key:"cliente",label:"Cliente"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Calibro"},{key:"qta_tot",label:"Q.Totale"},{key:"qta_evasa",label:"Q.Evasa"},{label:"Residuo",gv:r=>(r.qta_tot||0)-(r.qta_evasa||0)},{key:"scadenza",label:"Scadenza"}],
  movimenti:[{key:"tipo",label:"Tipo"},{key:"data",label:"Data"},{key:"imballo",label:"Imballo"},{key:"lotto",label:"Lotto"},{key:"desc1",label:"Tipo Prodotto"},{key:"desc3",label:"Calibro"},{key:"qta",label:"Quantita"},{key:"magazzino",label:"Magazzino"},{key:"contratto_id",label:"Contratto"}],
};

// === UI ===
const Badge=({children,color,bg})=><span style={{display:"inline-block",padding:"2px 10px",borderRadius:4,fontSize:11,fontWeight:700,letterSpacing:.5,color,background:bg,textTransform:"uppercase"}}>{children}</span>;
const Kpi=({label,value,sub,color})=><div style={{background:C.card,border:"1px solid "+C.bd,borderRadius:10,padding:"18px 20px",flex:"1 1 170px",minWidth:160}}><div style={{fontSize:12,color:C.tD,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>{label}</div><div style={{fontSize:26,fontWeight:800,color:color||C.t,fontFamily:"'DM Mono',monospace"}}>{value}</div>{sub&&<div style={{fontSize:12,color:C.tM,marginTop:4}}>{sub}</div>}</div>;
const Msg=({msg})=>msg?<div style={{padding:"10px 16px",borderRadius:8,marginBottom:16,background:msg.t==="ok"?C.gD:C.rD,color:msg.t==="ok"?C.g:C.r,border:"1px solid "+(msg.t==="ok"?C.g:C.r),fontSize:13}}>{msg.x}</div>:null;
const Tbl=({cols,data,onRow})=><div style={{overflowX:"auto",borderRadius:8,border:"1px solid "+C.bd}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{cols.map((c,i)=><th key={i} style={{padding:"10px 12px",textAlign:"left",background:C.sf,color:C.tD,fontSize:11,textTransform:"uppercase",letterSpacing:.8,borderBottom:"2px solid "+C.acc,whiteSpace:"nowrap",position:"sticky",top:0,zIndex:1}}>{c.label}</th>)}</tr></thead><tbody>{data.length===0?<tr><td colSpan={cols.length} style={{padding:30,textAlign:"center",color:C.tM}}>Nessun dato</td></tr>:data.map((row,ri)=><tr key={row.id||ri} onClick={()=>onRow&&onRow(row)} style={{cursor:onRow?"pointer":"default",background:ri%2===0?"transparent":C.sf}} onMouseEnter={e=>{if(onRow)e.currentTarget.style.background=C.sfH}} onMouseLeave={e=>{e.currentTarget.style.background=ri%2===0?"transparent":C.sf}}>{cols.map((c,ci)=><td key={ci} style={{padding:"9px 12px",borderBottom:"1px solid "+C.bd,whiteSpace:"nowrap",color:C.t}}>{c.render?c.render(row):row[c.key]}</td>)}</tr>)}</tbody></table></div>;
const Sel=({label,value,onChange,options,style})=><div style={{display:"flex",flexDirection:"column",gap:4,...style}}>{label&&<label style={{fontSize:11,color:C.tD,textTransform:"uppercase",letterSpacing:.8}}>{label}</label>}<select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"8px 12px",background:C.sf,border:"1px solid "+C.bd,borderRadius:6,color:C.t,fontSize:13,outline:"none"}}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
const Inp=({label,value,onChange,type,placeholder,style,disabled})=><div style={{display:"flex",flexDirection:"column",gap:4,...style}}>{label&&<label style={{fontSize:11,color:C.tD,textTransform:"uppercase",letterSpacing:.8}}>{label}</label>}<input type={type||"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{padding:"8px 12px",background:disabled?C.bg:C.sf,border:"1px solid "+C.bd,borderRadius:6,color:disabled?C.tD:C.t,fontSize:13,outline:"none",opacity:disabled?.7:1}}/></div>;
const Btn=({children,onClick,primary,small,disabled,style})=><button onClick={onClick} disabled={disabled} style={{padding:small?"6px 14px":"10px 20px",borderRadius:6,border:"1px solid "+(primary?C.acc:C.bd),cursor:disabled?"not-allowed":"pointer",fontWeight:700,fontSize:small?12:13,background:primary?C.acc:C.sf,color:primary?C.bg:C.t,opacity:disabled?.5:1,...style}}>{children}</button>;
const XBtn=({data,cols,name})=>data&&data.length>0?<div data-no-print style={{display:"flex",gap:6}}><Btn small onClick={()=>xls(data,cols,name||"export")}>Excel</Btn><Btn small onClick={()=>window.print()}>Stampa</Btn></div>:null;

// === LOT PICKER ===
function LotPicker({lotti,onSelect,onCancel}){
  const[s,setS]=useState("");const[fT,setFT]=useState("");const[fC,setFC]=useState("");const[fM,setFM]=useState("");
  const av=useMemo(()=>lotti.filter(l=>dsp(l)>0).map(l=>({...l,d:dsp(l),qi:qi(l),bd:bn(qi(l))})),[lotti]);
  const fl=useMemo(()=>av.filter(l=>{if(fT&&l.desc1!==fT)return false;if(fC&&l.desc3!==fC)return false;if(fM&&l.magazzino!==fM)return false;if(s.length>=2){const q=s.toUpperCase();return[l.lotto,l.imballo,l.desc1,l.desc3,l.magazzino,l.acquirente].some(v=>v&&String(v).toUpperCase().includes(q))}return true}),[av,fT,fC,fM,s]);
  return <div style={{background:C.pk,border:"2px solid "+C.acc,borderRadius:12,padding:20,marginBottom:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{fontSize:16,fontWeight:800,color:C.acc,margin:0}}>Seleziona lotto</h3><Btn small onClick={onCancel}>Chiudi</Btn></div>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end"}}><div style={{flex:"1 1 200px"}}><input value={s} onChange={e=>setS(e.target.value)} placeholder="Cerca..." style={{width:"100%",padding:"9px 14px",background:C.sf,border:"1px solid "+(s?C.acc:C.bd),borderRadius:6,color:C.t,fontSize:13,outline:"none",boxSizing:"border-box"}}/></div><Sel value={fT} onChange={setFT} options={[{value:"",label:"Tutti tipi"},...TIPI.map(v=>({value:v,label:v}))]}/><Sel value={fC} onChange={setFC} options={[{value:"",label:"Calibri"},...CALS.map(v=>({value:v,label:v}))]}/><Sel value={fM} onChange={setFM} options={[{value:"",label:"Magazzini"},...MAGS.map(v=>({value:v,label:v}))]}/></div>
    <div style={{maxHeight:300,overflowY:"auto"}}><Tbl cols={[{label:"Lotto",render:r=><strong style={{color:C.acc}}>{r.lotto}</strong>},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Disp.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:800,color:C.acc}}>{r.d.toLocaleString()} kg</span>},{key:"magazzino",label:"Mag."},{label:"Qualita",render:r=><Badge color={BD[r.bd].c} bg={BD[r.bd].b}>{r.qi}</Badge>},{label:"Contr.",render:r=>r.contratto?<Badge color={C.b} bg={C.bD}>{r.contratto}</Badge>:<span style={{color:C.tM}}>-</span>}]} data={fl} onRow={onSelect}/></div>
  </div>;
}

// === LOGIN ===
function LoginPage(){
  const[em,setEm]=useState("");const[pw,setPw]=useState("");const[ld,setLd]=useState(false);const[er,setEr]=useState("");
  const go=async()=>{setLd(true);setEr("");const{error}=await supabase.auth.signInWithPassword({email:em,password:pw});if(error)setEr("Email o password errati");setLd(false)};
  return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg}}>
    <div style={{width:380,background:C.card,border:"1px solid "+C.bd,borderRadius:16,padding:40}}>
      <div style={{textAlign:"center",marginBottom:32}}><div style={{width:50,height:50,borderRadius:12,background:"linear-gradient(135deg,"+C.acc+","+C.accD+")",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,color:C.bg,marginBottom:12}}>A</div><h1 style={{fontSize:22,fontWeight:800,color:C.acc,margin:"8px 0 4px"}}>ASSOFRUTTI</h1><p style={{fontSize:13,color:C.tD,margin:0}}>Magazzino Nocciole</p></div>
      {er&&<div style={{padding:"8px 14px",borderRadius:6,background:C.rD,color:C.r,fontSize:12,marginBottom:16,border:"1px solid "+C.r}}>{er}</div>}
      <Inp label="Email" value={em} onChange={setEm} placeholder="mario@assofrutti.it" type="email"/><div style={{height:12}}/><Inp label="Password" value={pw} onChange={setPw} placeholder="........" type="password"/><div style={{height:20}}/>
      <Btn primary onClick={go} disabled={ld||!em||!pw} style={{width:"100%"}}>{ld?"Accesso...":"Accedi"}</Btn>
    </div></div>;
}

// === DASHBOARD ===
function DashboardPage({lotti,contratti}){
  const av=lotti.filter(l=>dsp(l)>0);const tot=av.reduce((s,l)=>s+dsp(l),0);const ca=contratti.filter(c=>(c.qta_tot-c.qta_evasa)>0).length;const la=av.filter(l=>l.contratto||l.acquirente).length;
  const pt={};av.forEach(l=>{pt[l.desc1]=(pt[l.desc1]||0)+dsp(l)});const mx=Math.max(...Object.values(pt),1);
  const qd={1:0,2:0,3:0,4:0,5:0};av.forEach(l=>{qd[bn(qi(l))]++});
  const pm={};av.forEach(l=>{pm[l.magazzino]=(pm[l.magazzino]||0)+dsp(l)});
  return <div>
    <div style={{marginBottom:28}}><h2 style={{fontSize:22,fontWeight:800,color:C.t,margin:0}}>Dashboard</h2><p style={{color:C.tD,margin:"4px 0 0",fontSize:13}}>Assofrutti S.r.l.</p></div>
    <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:28}}><Kpi label="Giacenza" value={tot.toLocaleString()+" kg"} color={C.acc} sub={av.length+" lotti"}/><Kpi label="Liberi" value={av.length-la} color={C.g}/><Kpi label="Assegnati" value={la} color={C.b}/><Kpi label="Contratti Aperti" value={ca} color={C.o}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div style={{background:C.card,border:"1px solid "+C.bd,borderRadius:10,padding:20}}><h3 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:1,margin:"0 0 16px"}}>Per Tipo</h3>{Object.entries(pt).sort((a,b)=>b[1]-a[1]).map(([t,kg])=><div key={t} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13}}>{t}</span><span style={{fontSize:13,color:C.acc,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{kg.toLocaleString()} kg</span></div><div style={{height:8,background:C.sf,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:(kg/mx*100)+"%",background:"linear-gradient(90deg,"+C.accD+","+C.acc+")",borderRadius:4}}/></div></div>)}</div>
      <div style={{background:C.card,border:"1px solid "+C.bd,borderRadius:10,padding:20}}><h3 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:1,margin:"0 0 16px"}}>Qualita</h3><div style={{display:"flex",gap:10,alignItems:"flex-end",height:110,marginBottom:16}}>{[1,2,3,4,5].map(b=>{const mq=Math.max(...Object.values(qd),1);const h=qd[b]>0?Math.max(20,qd[b]/mq*100):4;return <div key={b} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><span style={{fontSize:12,fontWeight:700,color:BD[b].c,fontFamily:"'DM Mono',monospace"}}>{qd[b]}</span><div style={{width:"100%",height:h+"%",background:BD[b].b,border:"1px solid "+BD[b].c,borderRadius:4}}/><span style={{fontSize:10,color:C.tD}}>{BD[b].l}</span></div>})}</div>
      <h3 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:1,margin:"12px 0 10px"}}>Per Magazzino</h3><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{Object.entries(pm).map(([m,kg])=><div key={m} style={{background:C.sf,border:"1px solid "+C.bd,borderRadius:8,padding:"10px 16px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:C.acc,fontFamily:"'DM Mono',monospace"}}>{kg.toLocaleString()}</div><div style={{fontSize:11,color:C.tD,marginTop:2}}>{m}</div></div>)}</div></div>
    </div></div>;
}

// === MOVIMENTI ===
function MovimentiPage({lotti,contratti,movimenti,reload,isAdm}){
  const[tipo,setTipo]=useState("ENTRATA");const[showPk,setShowPk]=useState(false);const[sel,setSel]=useState(null);const[msg,setMsg]=useState(null);const[undoId,setUndoId]=useState(null);
  const ef={data:new Date().toISOString().split("T")[0],sett:"",anno:"2025",imballo:"",lotto:"",desc1:"CONVENZIONALI",desc2:"SGUSCIATE",desc3:"9/11",qta:"",magazzino:"Fabrica",mv:"",mo:"",cv:"",co:"",ce:"",newMag:"Soriano"};
  const[form,setForm]=useState(ef);
  const reset=()=>{setForm(ef);setSel(null);setShowPk(false)};
  const chTipo=v=>{setTipo(v);reset();if(v!=="ENTRATA")setShowPk(true)};
  const pickLot=lot=>{setSel(lot);setShowPk(false);setForm(f=>({...f,imballo:lot.imballo,lotto:lot.lotto,desc1:lot.desc1,desc2:lot.desc2,desc3:lot.desc3,magazzino:lot.magazzino}))};
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};
  const fc=lot=>contratti.find(c=>c.id===lot.contratto&&(c.qta_tot-c.qta_evasa)>0);
  const mc=sel?fc(sel):null;

  const handleSubmit=async()=>{
    if(!form.qta||Number(form.qta)<=0){flash("err","Quantita non valida");return}
    if(tipo==="ENTRATA"&&(!form.imballo||!form.lotto)){flash("err","Compila imballo e lotto");return}
    if(tipo!=="ENTRATA"&&!sel){flash("err","Seleziona un lotto");return}
    if(tipo==="USCITA"&&sel&&Number(form.qta)>sel.d){flash("err","Max: "+sel.d+" kg");return}
    const q=Number(form.qta);
    try{
      await supabase.from("movimenti").insert({tipo,data:form.data,imballo:form.imballo,lotto:form.lotto,desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,qta:q,magazzino:form.magazzino,contratto_id:sel?.contratto||""});
      if(tipo==="ENTRATA"){
        await supabase.from("lotti").insert({sett_prod:Number(form.sett)||0,anno:Number(form.anno),imballo:form.imballo,lotto:form.lotto,desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,q_iniz:q,mov:0,magazzino:form.magazzino,mv:Number(form.mv)||0,mo:Number(form.mo)||0,cv:Number(form.cv)||0,co:Number(form.co)||0,ce:Number(form.ce)||0});
        flash("ok","Entrata: "+q+" kg "+form.desc1+" "+form.desc3);
      } else if(tipo==="USCITA"){
        await supabase.from("lotti").update({mov:sel.mov+q}).eq("id",sel.id);
        if(mc){await supabase.from("contratti").update({qta_evasa:mc.qta_evasa+q}).eq("id",mc.id);flash("ok","Uscita: "+q+" kg - Contratto "+mc.id+" aggiornato")}
        else flash("ok","Uscita: "+q+" kg da "+sel.imballo);
      } else {
        await supabase.from("lotti").update({magazzino:form.newMag}).eq("id",sel.id);
        flash("ok","Trasferito a "+form.newMag);
      }
      reset();await reload();
    }catch(e){flash("err",e.message)}
  };

  const handleUndo=async r=>{
    try{
      if(r.tipo==="ENTRATA") await supabase.from("lotti").delete().match({imballo:r.imballo,lotto:r.lotto,q_iniz:r.qta,mov:0});
      else if(r.tipo==="USCITA"){
        const{data:lot}=await supabase.from("lotti").select("*").match({imballo:r.imballo,lotto:r.lotto}).limit(1).single();
        if(lot) await supabase.from("lotti").update({mov:Math.max(0,lot.mov-r.qta)}).eq("id",lot.id);
        if(r.contratto_id){const{data:ct}=await supabase.from("contratti").select("*").eq("id",r.contratto_id).single();if(ct) await supabase.from("contratti").update({qta_evasa:Math.max(0,ct.qta_evasa-r.qta)}).eq("id",ct.id)}
      } else await supabase.from("lotti").update({magazzino:r.magazzino}).match({imballo:r.imballo,lotto:r.lotto});
      await supabase.from("movimenti").delete().eq("id",r.id);
      setUndoId(null);flash("ok","Movimento annullato");await reload();
    }catch(e){flash("err",e.message)}
  };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}><h2 style={{fontSize:22,fontWeight:800,color:C.t,margin:0}}>Movimenti</h2><XBtn data={movimenti} cols={XC.movimenti} name="movimenti"/></div><Msg msg={msg}/>
    <div style={{display:"flex",gap:0,marginBottom:20,background:C.sf,borderRadius:10,border:"1px solid "+C.bd,overflow:"hidden"}} data-no-print>
      {[{v:"ENTRATA",icon:"\u2193",color:C.g,sub:"Nuovo lotto"},{v:"USCITA",icon:"\u2191",color:C.r,sub:"Seleziona e preleva"},{v:"TRASFERIMENTO",icon:"\u21C4",color:C.b,sub:"Sposta tra magazzini"}].map(t=><div key={t.v} onClick={()=>chTipo(t.v)} style={{flex:1,padding:"16px 20px",cursor:"pointer",textAlign:"center",background:tipo===t.v?C.card:"transparent",borderBottom:tipo===t.v?"3px solid "+t.color:"3px solid transparent"}}><div style={{fontSize:22,marginBottom:4}}>{t.icon}</div><div style={{fontSize:14,fontWeight:700,color:tipo===t.v?t.color:C.tD}}>{t.v}</div><div style={{fontSize:11,color:C.tM,marginTop:2}}>{t.sub}</div></div>)}
    </div>

    {showPk&&tipo!=="ENTRATA"&&<LotPicker lotti={lotti} onSelect={pickLot} onCancel={()=>{setShowPk(false);setSel(null)}}/>}
    {sel&&tipo!=="ENTRATA"&&<div style={{background:C.pkS,border:"2px solid "+C.acc,borderRadius:10,padding:16,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}} data-no-print><div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:11,color:C.tD}}>LOTTO</div><div style={{fontSize:16,fontWeight:800,color:C.acc}}>{sel.lotto} - {sel.imballo}</div></div><div><div style={{fontSize:11,color:C.tD}}>Disp.</div><div style={{fontSize:18,fontWeight:800,color:C.g,fontFamily:"'DM Mono',monospace"}}>{sel.d.toLocaleString()} kg</div></div>{mc&&<div><div style={{fontSize:11,color:C.tD}}>Contratto</div><div style={{color:C.b,fontWeight:700}}>{mc.id} - {mc.cliente}</div></div>}</div><Btn small onClick={()=>{setShowPk(true);setSel(null)}}>Cambia</Btn></div>}

    <div style={{background:C.card,border:"1px solid "+C.bd,borderRadius:10,padding:20,marginBottom:24}} data-no-print>
      {tipo==="ENTRATA"?<><h3 style={{fontSize:14,color:C.g,margin:"0 0 16px",fontWeight:700}}>Nuovo lotto in entrata</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12}}><Inp label="Data" type="date" value={form.data} onChange={v=>setForm({...form,data:v})}/><Inp label="Sett." value={form.sett} onChange={v=>setForm({...form,sett:v})}/><Inp label="Anno" value={form.anno} onChange={v=>setForm({...form,anno:v})}/><Inp label="Imballo *" value={form.imballo} onChange={v=>setForm({...form,imballo:v})} placeholder="BIG BAG N..."/><Inp label="Lotto *" value={form.lotto} onChange={v=>setForm({...form,lotto:v})} placeholder="SO112024"/><Sel label="Tipo" value={form.desc1} onChange={v=>setForm({...form,desc1:v})} options={TIPI.map(v=>({value:v,label:v}))}/><Sel label="Lavoraz." value={form.desc2} onChange={v=>setForm({...form,desc2:v})} options={LAVS.map(v=>({value:v,label:v}))}/><Sel label="Calibro" value={form.desc3} onChange={v=>setForm({...form,desc3:v})} options={CALS.map(v=>({value:v,label:v}))}/><Inp label="Qta (kg) *" type="number" value={form.qta} onChange={v=>setForm({...form,qta:v})} placeholder="1000"/><Sel label="Magazzino" value={form.magazzino} onChange={v=>setForm({...form,magazzino:v})} options={MAGS.map(v=>({value:v,label:v}))}/><Inp label="M.V." value={form.mv} onChange={v=>setForm({...form,mv:v})}/><Inp label="M.O." value={form.mo} onChange={v=>setForm({...form,mo:v})}/><Inp label="C.V." value={form.cv} onChange={v=>setForm({...form,cv:v})}/><Inp label="C.O." value={form.co} onChange={v=>setForm({...form,co:v})}/><Inp label="C.E." value={form.ce} onChange={v=>setForm({...form,ce:v})}/></div></>
      :tipo==="USCITA"?<>{sel?<><h3 style={{fontSize:14,color:C.r,margin:"0 0 16px",fontWeight:700}}>Quantita da prelevare</h3><div style={{display:"flex",gap:12,alignItems:"flex-end"}}><Inp label="Data" type="date" value={form.data} onChange={v=>setForm({...form,data:v})}/><Inp label={"Qta (max "+sel.d+") *"} type="number" value={form.qta} onChange={v=>setForm({...form,qta:v})} style={{flex:1}}/><Btn small onClick={()=>setForm(f=>({...f,qta:String(sel.d)}))}>Tutto</Btn></div></>:!showPk&&<div style={{textAlign:"center",padding:20}}><Btn primary onClick={()=>setShowPk(true)}>Seleziona lotto</Btn></div>}</>
      :<>{sel?<><h3 style={{fontSize:14,color:C.b,margin:"0 0 16px",fontWeight:700}}>Destinazione</h3><div style={{display:"flex",gap:12,alignItems:"flex-end"}}><Inp label="Data" type="date" value={form.data} onChange={v=>setForm({...form,data:v})}/><div><div style={{fontSize:11,color:C.tD,marginBottom:4}}>DA</div><div style={{padding:"8px 12px",background:C.bg,border:"1px solid "+C.bd,borderRadius:6,color:C.tD,fontSize:13}}>{sel.magazzino}</div></div><Sel label="A" value={form.newMag} onChange={v=>setForm({...form,newMag:v})} options={MAGS.filter(v=>v!==sel.magazzino).map(v=>({value:v,label:v}))}/><Inp label="Qta" type="number" value={form.qta} onChange={v=>setForm({...form,qta:v})}/></div></>:!showPk&&<div style={{textAlign:"center",padding:20}}><Btn primary onClick={()=>setShowPk(true)}>Seleziona lotto</Btn></div>}</>}
      {(tipo==="ENTRATA"||sel)&&<div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}><Btn onClick={reset}>Annulla</Btn><Btn primary onClick={handleSubmit}>{tipo==="ENTRATA"?"Registra Entrata":tipo==="USCITA"?"Registra Uscita":"Trasferisci"}</Btn></div>}
    </div>

    <h3 style={{fontSize:14,color:C.tD,margin:"0 0 12px",textTransform:"uppercase",letterSpacing:1}}>Storico movimenti</h3>
    <Tbl cols={[
      {label:"Tipo",render:r=><span style={{color:r.tipo==="ENTRATA"?C.g:r.tipo==="USCITA"?C.r:C.b,fontWeight:700}}>{r.tipo}</span>},
      {key:"data",label:"Data"},{key:"imballo",label:"Imballo"},{key:"lotto",label:"Lotto"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},
      {label:"Qta",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700}}>{r.qta?.toLocaleString()}</span>},
      {key:"magazzino",label:"Mag."},
      {label:"Contr.",render:r=>r.contratto_id?<Badge color={C.b} bg={C.bD}>{r.contratto_id}</Badge>:<span style={{color:C.tM}}>-</span>},
      ...(isAdm?[{label:"",render:r=>undoId===r.id?
        <div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:11,color:C.o}}>Sicuro?</span>
          <button onClick={e=>{e.stopPropagation();handleUndo(r)}} style={{background:C.r,border:"none",color:"#fff",cursor:"pointer",fontSize:11,padding:"3px 10px",borderRadius:4,fontWeight:700}}>Si</button>
          <button onClick={e=>{e.stopPropagation();setUndoId(null)}} style={{background:C.sf,border:"1px solid "+C.bd,color:C.tD,cursor:"pointer",fontSize:11,padding:"3px 8px",borderRadius:4}}>No</button>
        </div>:<button onClick={e=>{e.stopPropagation();setUndoId(r.id)}} style={{background:"none",border:"none",color:C.r,cursor:"pointer",fontSize:12}}>Annulla</button>
      }]:[])
    ]} data={movimenti}/>
  </div>;
}

// === GIACENZE ===
function GiacenzePage({lotti,contratti,reload,isAdm}){
  const[f,setF]=useState({d1:"",d3:"",fb:"",m:"",st:""});const[sort,setSort]=useState({k:"qualita",d:"asc"});const[aId,setAId]=useState(null);const[aC,setAC]=useState("");const[aA,setAA]=useState("");const[msg,setMsg]=useState(null);
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};
  const enr=useMemo(()=>lotti.filter(l=>dsp(l)>0).map(l=>{const q=qi(l);return{...l,d:dsp(l),qualita:q,fascia:bn(q),stato:(l.contratto||l.acquirente)?"ASSEGNATO":"DISPONIBILE"}}),[lotti]);
  const fl=enr.filter(l=>{if(f.d1&&l.desc1!==f.d1)return false;if(f.d3&&l.desc3!==f.d3)return false;if(f.fb&&l.fascia!==Number(f.fb))return false;if(f.m&&l.magazzino!==f.m)return false;if(f.st&&l.stato!==f.st)return false;return true});
  const so=[...fl].sort((a,b)=>sort.d==="asc"?a[sort.k]-b[sort.k]:b[sort.k]-a[sort.k]);
  const oc=contratti.filter(c=>(c.qta_tot-c.qta_evasa)>0);
  const doAssign=async id=>{if(!aC&&!aA){flash("err","Seleziona contratto o acquirente");return}const ct=contratti.find(c=>c.id===aC);await supabase.from("lotti").update({contratto:aC,acquirente:aC?ct?.cliente||aA:aA}).eq("id",id);setAId(null);setAC("");setAA("");flash("ok","Assegnato");await reload()};
  const doUn=async id=>{await supabase.from("lotti").update({contratto:"",acquirente:""}).eq("id",id);flash("ok","Rimosso");await reload()};
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><div><h2 style={{fontSize:22,fontWeight:800,color:C.t,margin:0}}>Giacenze</h2><p style={{color:C.tD,margin:"4px 0 0",fontSize:13}}>{so.length} lotti - {so.reduce((s,l)=>s+l.d,0).toLocaleString()} kg</p></div><XBtn data={so} cols={XC.giacenze} name="giacenze"/></div><Msg msg={msg}/>
    <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}} data-no-print><Sel label="Tipo" value={f.d1} onChange={v=>setF({...f,d1:v})} options={[{value:"",label:"Tutti"},...TIPI.map(v=>({value:v,label:v}))]}/><Sel label="Cal." value={f.d3} onChange={v=>setF({...f,d3:v})} options={[{value:"",label:"Tutti"},...CALS.map(v=>({value:v,label:v}))]}/><Sel label="Fascia" value={f.fb} onChange={v=>setF({...f,fb:v})} options={[{value:"",label:"Tutte"},...[1,2,3,4,5].map(v=>({value:String(v),label:BD[v].l}))]}/><Sel label="Mag." value={f.m} onChange={v=>setF({...f,m:v})} options={[{value:"",label:"Tutti"},...MAGS.map(v=>({value:v,label:v}))]}/><Sel label="Stato" value={f.st} onChange={v=>setF({...f,st:v})} options={[{value:"",label:"Tutti"},{value:"DISPONIBILE",label:"Liberi"},{value:"ASSEGNATO",label:"Assegnati"}]}/><Sel label="Ordina" value={sort.k} onChange={v=>setSort({...sort,k:v})} options={[{value:"qualita",label:"Qualita"},{value:"d",label:"Quantita"}]}/></div>
    {aId&&isAdm&&<div style={{background:C.pk,border:"2px solid "+C.acc,borderRadius:10,padding:16,marginBottom:16}} data-no-print><h3 style={{fontSize:14,color:C.acc,margin:"0 0 12px",fontWeight:700}}>Assegna lotto</h3><div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}><Sel label="Contratto" value={aC} onChange={v=>{setAC(v);if(v){const c=contratti.find(x=>x.id===v);if(c)setAA(c.cliente)}}} options={[{value:"",label:"- Nessuno -"},...oc.map(c=>({value:c.id,label:c.id+" - "+c.cliente+" "+(c.qta_tot-c.qta_evasa).toLocaleString()+" kg"}))]} style={{flex:"1 1 300px"}}/><Inp label="Oppure acquirente" value={aA} onChange={setAA} disabled={!!aC}/><Btn primary small onClick={()=>doAssign(aId)}>Assegna</Btn><Btn small onClick={()=>{setAId(null);setAC("");setAA("")}}>Annulla</Btn></div></div>}
    <Tbl cols={[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Disp.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:C.acc}}>{r.d.toLocaleString()} kg</span>},{key:"magazzino",label:"Mag."},{label:"M.V.",render:r=>pct(r.mv)},{label:"M.O.",render:r=>pct(r.mo)},{label:"C.O.",render:r=>pct(r.co)},{label:"Qualita",render:r=><Badge color={BD[r.fascia].c} bg={BD[r.fascia].b}>{r.qualita} - {BD[r.fascia].l}</Badge>},{label:"Stato",render:r=>r.stato==="ASSEGNATO"?<span style={{display:"flex",gap:6,alignItems:"center"}}><Badge color={C.b} bg={C.bD}>{r.contratto||"Acq."} {r.acquirente}</Badge>{isAdm&&<button onClick={e=>{e.stopPropagation();doUn(r.id)}} style={{background:"none",border:"none",color:C.r,cursor:"pointer",fontSize:14,padding:0}}>x</button>}</span>:<Badge color={C.g} bg={C.gD}>Libero</Badge>},...(isAdm?[{label:"",render:r=>r.stato==="DISPONIBILE"?<Btn small primary onClick={e=>{e.stopPropagation();setAId(r.id);setAC("");setAA("")}}>Assegna</Btn>:null}]:[])]
    } data={so}/>
  </div>;
}

// === LOTTI ===
function LottiPage({lotti,reload,isAdm}){
  const[f,setF]=useState({d1:"",st:""});const[eId,setEId]=useState(null);const[dId,setDId]=useState(null);const[msg,setMsg]=useState(null);const[form,setForm]=useState({});
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};
  const openEdit=l=>{setEId(l.id);setForm({imballo:l.imballo,lotto:l.lotto,desc1:l.desc1,desc2:l.desc2,desc3:l.desc3,q_iniz:String(l.q_iniz),magazzino:l.magazzino,mv:String(l.mv),mo:String(l.mo),cv:String(l.cv),co:String(l.co),ce:String(l.ce)})};
  const doSave=async()=>{try{await supabase.from("lotti").update({imballo:form.imballo,lotto:form.lotto,desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,q_iniz:Number(form.q_iniz),magazzino:form.magazzino,mv:Number(form.mv)||0,mo:Number(form.mo)||0,cv:Number(form.cv)||0,co:Number(form.co)||0,ce:Number(form.ce)||0}).eq("id",eId);setEId(null);flash("ok","Aggiornato");await reload()}catch(e){flash("err",e.message)}};
  const doDel=async id=>{try{await supabase.from("lotti").delete().eq("id",id);setDId(null);flash("ok","Eliminato");await reload()}catch(e){flash("err",e.message)}};
  const fl=lotti.filter(l=>{if(f.d1&&l.desc1!==f.d1)return false;if(f.st==="D"&&dsp(l)<=0)return false;if(f.st==="E"&&dsp(l)>0)return false;return true});
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><div><h2 style={{fontSize:22,fontWeight:800,color:C.t,margin:0}}>Registro Lotti</h2><p style={{color:C.tD,margin:"4px 0 0",fontSize:13}}>{fl.length} lotti</p></div><XBtn data={fl} cols={XC.lotti} name="lotti"/></div><Msg msg={msg}/>
    <div style={{display:"flex",gap:12,marginBottom:16}} data-no-print><Sel label="Tipo" value={f.d1} onChange={v=>setF({...f,d1:v})} options={[{value:"",label:"Tutti"},...TIPI.map(v=>({value:v,label:v}))]}/><Sel label="Stato" value={f.st} onChange={v=>setF({...f,st:v})} options={[{value:"",label:"Tutti"},{value:"D",label:"Disponibile"},{value:"E",label:"Esaurito"}]}/></div>
    {eId&&isAdm&&<div style={{background:C.pk,border:"2px solid "+C.acc,borderRadius:12,padding:20,marginBottom:20}} data-no-print><h3 style={{fontSize:16,fontWeight:800,color:C.acc,margin:"0 0 16px"}}>Modifica lotto</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12}}><Inp label="Imballo" value={form.imballo} onChange={v=>setForm({...form,imballo:v})}/><Inp label="Lotto" value={form.lotto} onChange={v=>setForm({...form,lotto:v})}/><Sel label="Tipo" value={form.desc1} onChange={v=>setForm({...form,desc1:v})} options={TIPI.map(v=>({value:v,label:v}))}/><Sel label="Lavoraz." value={form.desc2} onChange={v=>setForm({...form,desc2:v})} options={LAVS.map(v=>({value:v,label:v}))}/><Sel label="Cal." value={form.desc3} onChange={v=>setForm({...form,desc3:v})} options={CALS.map(v=>({value:v,label:v}))}/><Inp label="Qta (kg)" type="number" value={form.q_iniz} onChange={v=>setForm({...form,q_iniz:v})}/><Sel label="Mag." value={form.magazzino} onChange={v=>setForm({...form,magazzino:v})} options={MAGS.map(v=>({value:v,label:v}))}/><Inp label="M.V." value={form.mv} onChange={v=>setForm({...form,mv:v})}/><Inp label="M.O." value={form.mo} onChange={v=>setForm({...form,mo:v})}/><Inp label="C.V." value={form.cv} onChange={v=>setForm({...form,cv:v})}/><Inp label="C.O." value={form.co} onChange={v=>setForm({...form,co:v})}/><Inp label="C.E." value={form.ce} onChange={v=>setForm({...form,ce:v})}/></div><div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}><Btn onClick={()=>setEId(null)}>Annulla</Btn><Btn primary onClick={doSave}>Salva</Btn></div></div>}
    <Tbl cols={[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Q.Iniz",render:r=><span style={{fontFamily:"'DM Mono',monospace"}}>{r.q_iniz?.toLocaleString()}</span>},{label:"Mov.",render:r=><span style={{fontFamily:"'DM Mono',monospace",color:r.mov>0?C.r:C.tM}}>{r.mov?.toLocaleString()}</span>},{label:"Disp.",render:r=>{const d=dsp(r);return <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:d>0?C.g:C.r}}>{d.toLocaleString()}</span>}},{label:"Stato",render:r=>dsp(r)>0?<Badge color={C.g} bg={C.gD}>Disp.</Badge>:<Badge color={C.tD} bg={C.sf}>Esaurito</Badge>},{key:"magazzino",label:"Mag."},{key:"contratto",label:"Contr."},{key:"acquirente",label:"Acq."},...(isAdm?[{label:"",render:r=><div style={{display:"flex",gap:6}}><button onClick={e=>{e.stopPropagation();openEdit(r)}} style={{background:"none",border:"none",color:C.acc,cursor:"pointer",fontSize:13}}>Mod</button>{dId===r.id?<span style={{display:"flex",gap:4,alignItems:"center"}}><button onClick={e=>{e.stopPropagation();doDel(r.id)}} style={{background:C.r,border:"none",color:"#fff",cursor:"pointer",fontSize:11,padding:"2px 8px",borderRadius:4,fontWeight:700}}>Si</button><button onClick={e=>{e.stopPropagation();setDId(null)}} style={{background:C.sf,border:"1px solid "+C.bd,color:C.tD,cursor:"pointer",fontSize:11,padding:"2px 6px",borderRadius:4}}>No</button></span>:<button onClick={e=>{e.stopPropagation();setDId(r.id)}} style={{background:"none",border:"none",color:C.r,cursor:"pointer",fontSize:13}}>Elim</button>}</div>}]:[])]
    } data={fl}/>
  </div>;
}

// === CONTRATTI ===
function ContrattiPage({contratti,lotti,reload,isAdm}){
  const[showF,setShowF]=useState(false);const[eId,setEId]=useState(null);const[dId,setDId]=useState(null);const[msg,setMsg]=useState(null);
  const ef={id:"",desc1:"CONVENZIONALI",desc2:"SGUSCIATE",desc3:"9/11",cliente:"",scadenza:"",qta_tot:"",qta_evasa:"0"};const[form,setForm]=useState(ef);
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};
  const openNew=()=>{setForm(ef);setEId(null);setShowF(true)};
  const openEdit=c=>{setForm({id:c.id,desc1:c.desc1,desc2:c.desc2,desc3:c.desc3,cliente:c.cliente,scadenza:c.scadenza||"",qta_tot:String(c.qta_tot),qta_evasa:String(c.qta_evasa)});setEId(c.id);setShowF(true)};
  const doSave=async()=>{if(!form.id||!form.cliente||!form.qta_tot){flash("err","Compila campi obbligatori");return}try{if(eId){await supabase.from("contratti").update({desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,cliente:form.cliente,scadenza:form.scadenza||null,qta_tot:Number(form.qta_tot),qta_evasa:Number(form.qta_evasa)}).eq("id",eId);flash("ok","Aggiornato")}else{const{error}=await supabase.from("contratti").insert({id:form.id,desc1:form.desc1,desc2:form.desc2,desc3:form.desc3,cliente:form.cliente,scadenza:form.scadenza||null,qta_tot:Number(form.qta_tot),qta_evasa:Number(form.qta_evasa||0)});if(error){flash("err",error.message);return}flash("ok","Creato")}setShowF(false);setEId(null);await reload()}catch(e){flash("err",e.message)}};
  const doDel=async id=>{await supabase.from("lotti").update({contratto:"",acquirente:""}).eq("contratto",id);await supabase.from("contratti").delete().eq("id",id);setDId(null);flash("ok","Eliminato");await reload()};
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{fontSize:22,fontWeight:800,color:C.t,margin:0}}>Contratti</h2><div style={{display:"flex",gap:10}}><XBtn data={contratti} cols={XC.contratti} name="contratti"/>{isAdm&&<Btn primary onClick={openNew}>+ Nuovo</Btn>}</div></div><Msg msg={msg}/>
    {showF&&isAdm&&<div style={{background:C.pk,border:"2px solid "+C.acc,borderRadius:12,padding:20,marginBottom:20}} data-no-print><h3 style={{fontSize:16,fontWeight:800,color:C.acc,margin:"0 0 16px"}}>{eId?"Modifica":"Nuovo"} Contratto</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}><Inp label="N. *" value={form.id} onChange={v=>setForm({...form,id:v})} disabled={!!eId}/><Inp label="Cliente *" value={form.cliente} onChange={v=>setForm({...form,cliente:v})}/><Sel label="Tipo" value={form.desc1} onChange={v=>setForm({...form,desc1:v})} options={TIPI.map(v=>({value:v,label:v}))}/><Sel label="Lavoraz." value={form.desc2} onChange={v=>setForm({...form,desc2:v})} options={LAVS.map(v=>({value:v,label:v}))}/><Sel label="Cal." value={form.desc3} onChange={v=>setForm({...form,desc3:v})} options={CALS.map(v=>({value:v,label:v}))}/><Inp label="Scadenza" type="date" value={form.scadenza} onChange={v=>setForm({...form,scadenza:v})}/><Inp label="Qta Tot *" type="number" value={form.qta_tot} onChange={v=>setForm({...form,qta_tot:v})}/>{eId&&<Inp label="Qta Evasa" type="number" value={form.qta_evasa} onChange={v=>setForm({...form,qta_evasa:v})}/>}</div><div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}><Btn onClick={()=>{setShowF(false);setEId(null)}}>Annulla</Btn><Btn primary onClick={doSave}>{eId?"Salva":"Crea"}</Btn></div></div>}
    <Tbl cols={[{key:"id",label:"N."},{key:"cliente",label:"Cliente"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Totale",render:r=><span style={{fontFamily:"'DM Mono',monospace"}}>{r.qta_tot?.toLocaleString()}</span>},{label:"Evasa",render:r=><span style={{fontFamily:"'DM Mono',monospace"}}>{r.qta_evasa?.toLocaleString()}</span>},{label:"Residuo",render:r=>{const res=r.qta_tot-r.qta_evasa;return <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:res>0?C.o:C.g}}>{res.toLocaleString()}</span>}},{label:"%",render:r=>{const p=Math.min(100,(r.qta_evasa/r.qta_tot)*100);return <div style={{display:"flex",alignItems:"center",gap:8,minWidth:100}}><div style={{flex:1,height:8,background:C.sf,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:p+"%",background:p>=100?C.g:C.acc,borderRadius:4}}/></div><span style={{fontSize:11,fontWeight:700,color:C.tD,fontFamily:"'DM Mono',monospace"}}>{p.toFixed(0)}%</span></div>}},{label:"Stato",render:r=>(r.qta_tot-r.qta_evasa)>0?<Badge color={C.o} bg={C.oD}>Aperto</Badge>:<Badge color={C.g} bg={C.gD}>Chiuso</Badge>},{key:"scadenza",label:"Scad."},...(isAdm?[{label:"",render:r=><div style={{display:"flex",gap:6}}><button onClick={e=>{e.stopPropagation();openEdit(r)}} style={{background:"none",border:"none",color:C.acc,cursor:"pointer",fontSize:13}}>Mod</button>{dId===r.id?<span style={{display:"flex",gap:4,alignItems:"center"}}><button onClick={e=>{e.stopPropagation();doDel(r.id)}} style={{background:C.r,border:"none",color:"#fff",cursor:"pointer",fontSize:11,padding:"2px 8px",borderRadius:4,fontWeight:700}}>Si</button><button onClick={e=>{e.stopPropagation();setDId(null)}} style={{background:C.sf,border:"1px solid "+C.bd,color:C.tD,cursor:"pointer",fontSize:11,padding:"2px 6px",borderRadius:4}}>No</button></span>:<button onClick={e=>{e.stopPropagation();setDId(r.id)}} style={{background:"none",border:"none",color:C.r,cursor:"pointer",fontSize:13}}>Elim</button>}</div>}]:[])]
    } data={contratti}/>
  </div>;
}

// === RICERCA ===
function RicercaPage({lotti}){
  const[q,setQ]=useState("");const av=lotti.filter(l=>dsp(l)>0);
  const res=q.length<2?[]:av.filter(l=>[l.lotto,l.imballo,l.desc1,l.desc2,l.desc3,l.magazzino,l.acquirente,l.contratto].some(v=>v&&String(v).toUpperCase().includes(q.toUpperCase())));
  return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}><h2 style={{fontSize:22,fontWeight:800,color:C.t,margin:0}}>Ricerca</h2>{res.length>0&&<XBtn data={res} cols={XC.giacenze} name="ricerca"/>}</div><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca lotto, tipo, calibro, magazzino, acquirente..." style={{width:"100%",padding:"14px 20px",background:C.card,border:"2px solid "+(q.length>=2?C.acc:C.bd),borderRadius:10,color:C.t,fontSize:16,outline:"none",marginBottom:16,boxSizing:"border-box"}} data-no-print/>{q.length>=2&&<><p style={{color:C.tD,fontSize:13,marginBottom:12}}>{res.length} risultati</p><Tbl cols={[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Disp.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:C.acc}}>{dsp(r).toLocaleString()} kg</span>},{key:"magazzino",label:"Mag."},{label:"Qualita",render:r=>{const q2=qi(r);return <Badge color={BD[bn(q2)].c} bg={BD[bn(q2)].b}>{q2}</Badge>}},{key:"contratto",label:"Contr."},{key:"acquirente",label:"Acq."}]} data={res}/></>}</div>;
}

// === STORICO (vista a una data) ===
function StoricoPage(){
  const[dt,setDt]=useState(new Date().toISOString().split("T")[0]);const[ld,setLd]=useState(false);const[snap,setSnap]=useState(null);
  const calc=useCallback(async()=>{
    setLd(true);
    const{data:movs}=await supabase.from("movimenti").select("*").lte("data",dt).order("data").order("id");
    const mp={};(movs||[]).forEach(m=>{const k=m.lotto+"||"+m.imballo;if(m.tipo==="ENTRATA"){if(!mp[k])mp[k]={lotto:m.lotto,imballo:m.imballo,desc1:m.desc1,desc2:m.desc2,desc3:m.desc3,magazzino:m.magazzino,ent:0,usc:0};mp[k].ent+=m.qta;mp[k].magazzino=m.magazzino}else if(m.tipo==="USCITA"&&mp[k])mp[k].usc+=m.qta;else if(m.tipo==="TRASFERIMENTO"&&mp[k])mp[k].magazzino=m.magazzino});
    const ls=Object.values(mp).map(l=>({...l,disp:l.ent-l.usc})).filter(l=>l.ent>0);
    const tot=ls.reduce((s,l)=>s+Math.max(0,l.disp),0);const av=ls.filter(l=>l.disp>0);
    const pt={};av.forEach(l=>{pt[l.desc1]=(pt[l.desc1]||0)+l.disp});
    const pm={};av.forEach(l=>{pm[l.magazzino]=(pm[l.magazzino]||0)+l.disp});
    setSnap({dt,ls,av,tot,pt,pm,nm:(movs||[]).length});setLd(false);
  },[dt]);
  const xCols=[{key:"lotto",label:"Lotto"},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Calibro"},{key:"ent",label:"Entrate"},{key:"usc",label:"Uscite"},{key:"disp",label:"Disponibile"},{key:"magazzino",label:"Magazzino"}];
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}><div><h2 style={{fontSize:22,fontWeight:800,color:C.t,margin:0}}>Storico</h2><p style={{color:C.tD,margin:"4px 0 0",fontSize:13}}>Stato del magazzino a una data specifica</p></div>{snap&&<XBtn data={snap.av} cols={xCols} name={"storico_"+snap.dt}/>}</div>
    <div style={{background:C.card,border:"1px solid "+C.bd,borderRadius:10,padding:20,marginBottom:24,display:"flex",gap:16,alignItems:"flex-end"}} data-no-print><div style={{display:"flex",flexDirection:"column",gap:4}}><label style={{fontSize:11,color:C.tD,textTransform:"uppercase"}}>Data</label><input type="date" value={dt} onChange={e=>setDt(e.target.value)} style={{padding:"10px 14px",background:C.sf,border:"2px solid "+C.acc,borderRadius:8,color:C.t,fontSize:16,outline:"none",fontFamily:"'DM Mono',monospace"}}/></div><Btn primary onClick={calc} disabled={ld}>{ld?"Calcolo...":"Visualizza"}</Btn></div>
    {snap&&<><div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:24}}><Kpi label={"Giacenza al "+snap.dt} value={snap.tot.toLocaleString()+" kg"} color={C.acc} sub={snap.av.length+" lotti"}/><Kpi label="Movimenti" value={snap.nm} color={C.b}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
      <div style={{background:C.card,border:"1px solid "+C.bd,borderRadius:10,padding:20}}><h3 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:1,margin:"0 0 16px"}}>Per Tipo</h3>{Object.entries(snap.pt).sort((a,b)=>b[1]-a[1]).map(([t,kg])=>{const mx=Math.max(...Object.values(snap.pt),1);return <div key={t} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13}}>{t}</span><span style={{fontSize:13,color:C.acc,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{kg.toLocaleString()} kg</span></div><div style={{height:8,background:C.sf,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:(kg/mx*100)+"%",background:"linear-gradient(90deg,"+C.accD+","+C.acc+")",borderRadius:4}}/></div></div>})}</div>
      <div style={{background:C.card,border:"1px solid "+C.bd,borderRadius:10,padding:20}}><h3 style={{fontSize:13,color:C.tD,textTransform:"uppercase",letterSpacing:1,margin:"0 0 16px"}}>Per Magazzino</h3><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{Object.entries(snap.pm).map(([m,kg])=><div key={m} style={{background:C.sf,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 20px",textAlign:"center",flex:"1 1 120px"}}><div style={{fontSize:22,fontWeight:800,color:C.acc,fontFamily:"'DM Mono',monospace"}}>{kg.toLocaleString()}</div><div style={{fontSize:12,color:C.tD,marginTop:4}}>{m}</div></div>)}</div></div>
    </div>
    <Tbl cols={[{label:"Lotto",render:r=><strong>{r.lotto}</strong>},{key:"imballo",label:"Imballo"},{key:"desc1",label:"Tipo"},{key:"desc3",label:"Cal."},{label:"Entrate",render:r=><span style={{fontFamily:"'DM Mono',monospace",color:C.g}}>{r.ent.toLocaleString()}</span>},{label:"Uscite",render:r=><span style={{fontFamily:"'DM Mono',monospace",color:r.usc>0?C.r:C.tM}}>{r.usc.toLocaleString()}</span>},{label:"Disp.",render:r=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:r.disp>0?C.acc:C.r}}>{r.disp.toLocaleString()} kg</span>},{key:"magazzino",label:"Mag."},{label:"Stato",render:r=>r.disp>0?<Badge color={C.g} bg={C.gD}>Disp.</Badge>:<Badge color={C.tD} bg={C.sf}>Esaurito</Badge>}]} data={snap.ls.sort((a,b)=>b.disp-a.disp)}/></>}
    {!snap&&!ld&&<div style={{textAlign:"center",padding:60,color:C.tM}}><p>Seleziona una data e clicca Visualizza</p></div>}
  </div>;
}

// === UTENTI (solo admin) ===
function UtentiPage(){
  const[users,setUsers]=useState([]);const[msg,setMsg]=useState(null);const[showN,setShowN]=useState(false);
  const[nE,setNE]=useState("");const[nP,setNP]=useState("");const[nN,setNN]=useState("");const[nR,setNR]=useState("operatore");
  const flash=(t,x)=>{setMsg({t,x});setTimeout(()=>setMsg(null),4000)};
  const load=useCallback(async()=>{const{data}=await supabase.from("user_profiles").select("*").order("created_at");setUsers(data||[])},[]);
  useEffect(()=>{load()},[load]);
  const create=async()=>{if(!nE||!nP){flash("err","Email e password obbligatori");return}const{data,error}=await supabase.auth.signUp({email:nE,password:nP});if(error){flash("err",error.message);return}if(data.user)await supabase.from("user_profiles").update({nome:nN,ruolo:nR}).eq("id",data.user.id);setShowN(false);setNE("");setNP("");setNN("");flash("ok","Utente creato");await load()};
  const toggle=async u=>{const nr=u.ruolo==="admin"?"operatore":"admin";await supabase.from("user_profiles").update({ruolo:nr}).eq("id",u.id);flash("ok","Ruolo aggiornato");await load()};
  return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h2 style={{fontSize:22,fontWeight:800,color:C.t,margin:0}}>Utenti</h2><Btn primary onClick={()=>setShowN(true)}>+ Nuovo Utente</Btn></div><Msg msg={msg}/>
    {showN&&<div style={{background:C.pk,border:"2px solid "+C.acc,borderRadius:12,padding:20,marginBottom:20}}><h3 style={{fontSize:16,fontWeight:800,color:C.acc,margin:"0 0 16px"}}>Nuovo Utente</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}><Inp label="Email *" value={nE} onChange={setNE} placeholder="mario@assofrutti.it"/><Inp label="Password *" value={nP} onChange={setNP} type="password" placeholder="Min 6 caratteri"/><Inp label="Nome" value={nN} onChange={setNN}/><Sel label="Ruolo" value={nR} onChange={setNR} options={[{value:"operatore",label:"Operatore"},{value:"admin",label:"Admin"}]}/></div><div style={{marginTop:16,display:"flex",justifyContent:"flex-end",gap:10}}><Btn onClick={()=>setShowN(false)}>Annulla</Btn><Btn primary onClick={create}>Crea</Btn></div></div>}
    <Tbl cols={[{key:"email",label:"Email"},{key:"nome",label:"Nome"},{label:"Ruolo",render:r=><Badge color={r.ruolo==="admin"?C.acc:C.b} bg={r.ruolo==="admin"?C.accD:C.bD}>{r.ruolo}</Badge>},{label:"",render:r=><Btn small onClick={()=>toggle(r)}>{r.ruolo==="admin"?"Rendi Operatore":"Rendi Admin"}</Btn>}]} data={users}/>
    <div style={{marginTop:20,padding:16,background:C.card,borderRadius:10,border:"1px solid "+C.bd,fontSize:13,color:C.tD}}><strong style={{color:C.acc}}>Admin:</strong> Tutto + contratti, modifica lotti, annulla movimenti, gestisci utenti<br/><strong style={{color:C.b}}>Operatore:</strong> Inserisce movimenti, vede dashboard/giacenze/lotti/ricerca/storico</div>
  </div>;
}

// === MAIN APP ===
const NAV=[{id:"dashboard",icon:"\u25c6",label:"Dashboard"},{id:"movimenti",icon:"\u2195",label:"Movimenti"},{id:"lotti",icon:"\u25a4",label:"Lotti"},{id:"giacenze",icon:"\u25a3",label:"Giacenze"},{id:"contratti",icon:"\u25c8",label:"Contratti"},{id:"ricerca",icon:"\u2315",label:"Ricerca"},{id:"storico",icon:"\u23f0",label:"Storico"}];

export default function App(){
  const[session,setSession]=useState(null);const[profile,setProfile]=useState(null);const[authLd,setAuthLd]=useState(true);
  const[page,setPage]=useState("dashboard");const[lotti,setLotti]=useState([]);const[contratti,setContratti]=useState([]);const[movimenti,setMovimenti]=useState([]);const[sO,setSO]=useState(true);const[dbErr,setDbErr]=useState(null);

  useEffect(()=>{supabase.auth.getSession().then(({data:{session:s}})=>{setSession(s);if(!s)setAuthLd(false)});const{data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>{setSession(s);if(!s){setProfile(null);setAuthLd(false)}});return()=>subscription.unsubscribe()},[]);
  useEffect(()=>{if(!session?.user)return;supabase.from("user_profiles").select("*").eq("id",session.user.id).single().then(({data})=>{setProfile(data);setAuthLd(false)})},[session]);

  const loadAll=useCallback(async()=>{try{const[lr,cr,mr]=await Promise.all([supabase.from("lotti").select("*").order("id"),supabase.from("contratti").select("*").order("id"),supabase.from("movimenti").select("*").order("id",{ascending:false}).limit(500)]);if(lr.error)throw lr.error;setLotti(lr.data||[]);setContratti(cr.data||[]);setMovimenti(mr.data||[]);setDbErr(null)}catch(e){setDbErr(e.message)}},[]);
  useEffect(()=>{if(session)loadAll()},[session,loadAll]);

  if(authLd) return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,color:C.acc,fontSize:18}}>Caricamento...</div>;
  if(!session) return <LoginPage/>;
  if(dbErr) return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,flexDirection:"column",gap:12}}><div style={{color:C.r,fontSize:18}}>Errore connessione</div><div style={{color:C.tD,fontSize:13,maxWidth:400,textAlign:"center"}}>{dbErr}</div><Btn primary onClick={loadAll}>Riprova</Btn></div>;

  const isAdm=profile?.ruolo==="admin";
  const navItems=[...NAV,...(isAdm?[{id:"utenti",icon:"\u2699",label:"Utenti"}]:[])];
  const logout=async()=>{await supabase.auth.signOut()};

  const pg=()=>{switch(page){
    case"dashboard":return <DashboardPage lotti={lotti} contratti={contratti}/>;
    case"movimenti":return <MovimentiPage lotti={lotti} contratti={contratti} movimenti={movimenti} reload={loadAll} isAdm={isAdm}/>;
    case"lotti":return <LottiPage lotti={lotti} reload={loadAll} isAdm={isAdm}/>;
    case"giacenze":return <GiacenzePage lotti={lotti} contratti={contratti} reload={loadAll} isAdm={isAdm}/>;
    case"contratti":return <ContrattiPage contratti={contratti} lotti={lotti} reload={loadAll} isAdm={isAdm}/>;
    case"ricerca":return <RicercaPage lotti={lotti}/>;
    case"storico":return <StoricoPage/>;
    case"utenti":return isAdm?<UtentiPage/>:null;
    default:return null}};

  return <div style={{display:"flex",height:"100vh",background:C.bg,fontFamily:"'DM Sans','Segoe UI',sans-serif",color:C.t,overflow:"hidden"}}>
    <div data-no-print style={{width:sO?210:56,background:C.sf,borderRight:"1px solid "+C.bd,display:"flex",flexDirection:"column",transition:"width .25s",flexShrink:0,overflow:"hidden"}}>
      <div style={{padding:sO?"18px 16px":"18px 12px",borderBottom:"1px solid "+C.bd,display:"flex",alignItems:"center",gap:10,cursor:"pointer",minHeight:60}} onClick={()=>setSO(!sO)}>
        <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,"+C.acc+","+C.accD+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:C.bg,flexShrink:0}}>A</div>
        {sO&&<div><div style={{fontSize:13,fontWeight:800,color:C.acc,lineHeight:1.1}}>ASSOFRUTTI</div><div style={{fontSize:10,color:C.tD,letterSpacing:1}}>MAGAZZINO</div></div>}
      </div>
      <nav style={{flex:1,padding:"10px 6px"}}>{navItems.map(item=>
        <div key={item.id} onClick={()=>setPage(item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:sO?"9px 10px":"9px 14px",borderRadius:8,marginBottom:2,cursor:"pointer",background:page===item.id?C.card:"transparent",borderLeft:page===item.id?"3px solid "+C.acc:"3px solid transparent"}}
          onMouseEnter={e=>{if(page!==item.id)e.currentTarget.style.background=C.sfH}} onMouseLeave={e=>{if(page!==item.id)e.currentTarget.style.background="transparent"}}>
          <span style={{fontSize:16,opacity:page===item.id?1:.5,flexShrink:0}}>{item.icon}</span>
          {sO&&<span style={{fontSize:13,fontWeight:page===item.id?700:400,color:page===item.id?C.t:C.tD,whiteSpace:"nowrap"}}>{item.label}</span>}
        </div>
      )}</nav>
      {sO&&<div style={{padding:"12px 14px",borderTop:"1px solid "+C.bd}}>
        <div style={{fontSize:12,color:C.tD,marginBottom:4}}>{profile?.nome||session?.user?.email}</div>
        <Badge color={isAdm?C.acc:C.b} bg={isAdm?C.accD:C.bD}>{profile?.ruolo||"..."}</Badge>
        <div style={{display:"flex",gap:6,marginTop:10}}><Btn small onClick={loadAll} style={{flex:1,fontSize:11}}>Aggiorna</Btn><Btn small onClick={logout} style={{flex:1,fontSize:11}}>Esci</Btn></div>
      </div>}
    </div>
    <div style={{flex:1,overflow:"auto",padding:"24px 28px"}}>{pg()}</div>
  </div>;
}
