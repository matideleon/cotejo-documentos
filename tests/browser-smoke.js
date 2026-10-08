// Execute with gstack browse eval after opening either HTML on a local server.
// Synthetic images and intercepted responses only: never calls an AI provider.
return (async()=>{
 const simple=typeof S!=='undefined';
 const c=document.createElement('canvas');c.width=1200;c.height=900;let x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1200,900);
 x.fillStyle='#aaa';x.fillRect(100,100,900,550);x.fillStyle='black';x.font='24px sans-serif';x.fillText('DOCUMENTO DE PRUEBA',150,170);const docURL=c.toDataURL('image/jpeg',.94);
 x.fillStyle='white';x.fillRect(0,0,1200,900);x.strokeStyle='black';x.lineWidth=3;
 for(let y=100;y<=660;y+=70){x.beginPath();x.moveTo(100,y);x.lineTo(1100,y);x.stroke();}
 for(let xx=100;xx<=1100;xx+=100){x.beginPath();x.moveTo(xx,100);x.lineTo(xx,660);x.stroke();}
 const planURL=c.toDataURL('image/jpeg',.94),originalFetch=window.fetch;
 let calls=0,headerUsed=false;
 const d={cedula:'12345672',nombre:'ANA MARIA',apellido:'PEREZ GOMEZ',sexo:'F',fnac:'1980-04-05',vencimiento:'2030-01-01',pais_documento:'Uruguay'};
 window.fetch=async(url,options)=>{
  if(!String(url).includes('/.netlify/functions/analizar'))return originalFetch(url,options);
  calls++;const input=JSON.parse(options.body);let rows=[],encabezados=0;
  if(input.tipo==='documento')rows=[d];
  else {
   const cells=Number(input.descripcion.match(/contiene (\d+) celdas/)?.[1]);
   encabezados=headerUsed?0:1;headerUsed=true;
   for(let i=0;i<cells-encabezados;i++)rows.push({cedula:d.cedula,nombre:'Ana',apellido:'Perez',sexo:'F',fnac:d.fnac,fecha:'2026-10-04',hora:'12:00:00'});
  }
  return new Response(JSON.stringify({registros:rows,lectura_completa:true,advertencias:[],encabezados}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  if(simple){document.getElementById('cKey').value='';S.doc=[docURL];S.plan=[planURL];pintarZonas();}
  else{abrirCotejo();ses.docUrls=[docURL];ses.planUrls=[planURL];}
  analizar();
  await new Promise((resolve,reject)=>{let n=0;let timer=setInterval(()=>{if(simple?!S.trabajando:ses.paso===3){clearInterval(timer);resolve();}else if(++n>400){clearInterval(timer);reject(new Error('timeout UI'));}},50);});
  const rows=simple?S.filas:ses.resultados;
  if(rows.length!==7||rows.some(r=>r.estado!=='ok'))throw new Error('Resultado UI incorrecto: '+JSON.stringify(rows.map(r=>({e:r.estado,o:r.obs}))));
  if(simple){const before=S.docs[0].cedula;corregir(0,'cedula','99999999');if(S.docs[0].cedula!==before)throw new Error('La edición alteró el documento');if(!tablaCSV().includes('Ana'))throw new Error('CSV incompleto');}
  else{updR(0,'nombre','Lucía');if(ses.resultados[0].estado!=='warn')throw new Error('Edición sin revisión');importarSel();if(recs.length!==7)throw new Error('Importación incompleta');}
  const prepared=await LecturaImagenes.preparar(planURL,'planilla');
  if(prepared.partes.some(p=>p.contexto))throw new Error('La planilla volvió a incluir filas ajenas como contexto');
  for(const extra of [-1,1]){
   const partial=await LecturaImagenes.leer(planURL,'planilla',async(url,tipo,parte)=>({registros:Array(Math.max(0,parte.celdas+extra)).fill(d),encabezados:0,lectura_completa:true,advertencias:[]}));
   if(partial.regs.length||partial.lectura_completa||!partial.advertencias.length)throw new Error('Se aceptaron filas de una respuesta con cantidad incorrecta');
  }
  return {interfaz:simple?'simple':'completa',filas:7,llamadasSimuladas:calls,edicionVerificada:true,cantidadesIncorrectasRechazadas:true,contextoSinFilasAjenas:true};
 }finally{window.fetch=originalFetch;}
})()
