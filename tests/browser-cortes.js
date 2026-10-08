// Red de seguridad cuando una parte no se puede leer de una vez: el limite de
// diez segundos de la Function, una respuesta truncada o una cantidad de filas
// que no cuadra con la cuadricula. Imagenes sinteticas y un llamar() simulado:
// nunca llama a un proveedor. Ejecutar con gstack browse eval sobre cualquiera
// de las dos interfaces servidas localmente.
return (async()=>{
 const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,w,h);return [c,x];};
 const cuadricula=filas=>{const [c,x]=canvas(1200,900);x.strokeStyle='black';x.lineWidth=3;
  const paso=560/filas;for(let i=0;i<=filas;i++){const y=100+Math.round(i*paso);x.beginPath();x.moveTo(100,y);x.lineTo(1100,y);x.stroke();}
  for(let xx=100;xx<=1100;xx+=100){x.beginPath();x.moveTo(xx,100);x.lineTo(xx,100+Math.round(filas*paso));x.stroke();}
  return c.toDataURL('image/jpeg',.94);};
 const fila=(cedula,hora)=>({cedula,hora,nombre:'ANA',apellido:'PEREZ',sexo:'F',fnac:'1980-04-05',fecha:'2026-10-07'});
 const ok=(registros,encabezados)=>({registros,lectura_completa:true,advertencias:[],encabezados:encabezados||0});
 const porTiempo=()=>{throw new Error('tardo demasiado y se corto la conexion (HTTP 504)');};
 const assert=(cond,msg)=>{if(!cond)throw new Error('FAIL: '+msg);};
 const resultado={};

 // 1. Una banda que se corta por tiempo se vuelve a cortar por las MISMAS
 // lineas de la cuadricula: el control de celdas sigue valiendo en los pedazos,
 // no hay solape y por lo tanto no hay nada que deduplicar. La pagina queda
 // marcada para revisar: algo obligo a cortar y eso se mira.
 {
  const url=cuadricula(10);
  const prep=await LecturaImagenes.preparar(url,'planilla');
  assert(prep.partes.length>1&&prep.partes[0].celdas===7,'no se reconocio la cuadricula de 10 filas: '+JSON.stringify(prep.avisos));
  const pedidos=[];let n=0;
  const r=await LecturaImagenes.leer(url,'planilla',(u,tipo,parte)=>{
   pedidos.push(parte.celdas);
   if(parte.celdas===7)return porTiempo();
   return ok(Array.from({length:parte.celdas},(_,i)=>fila('4123456'+(++n%10),'19:0'+i)));
  });
  assert(pedidos.filter(c=>c===7).length===1,'reintento la banda entera en vez de subdividirla');
  assert(pedidos.includes(4)&&pedidos.includes(3),'no corto la banda de 7 en 4+3: '+pedidos.join(','));
  assert(r.regs.length===10,'se perdieron filas al subdividir: '+r.regs.length+' de 10');
  // Cortar por la cuadricula no degrada el cotejo: cada pedazo paso su control
  // de celdas. Si esto marcara la lectura incompleta, un solo corte pondria las
  // 70 filas en "revisar" y el operador perderia cuales mirar de verdad.
  assert(r.lectura_completa===true,'degrado el cotejo entero por un corte que valido cada pedazo');
  assert(r.advertencias.some(a=>/misma cuadr/i.test(a)),'el corte quedo invisible: '+r.advertencias.join(' | '));
  assert(!r.advertencias.some(a=>/descart/i.test(a)),'deduplico donde no hay solape');
  resultado.bandaSubdividida={pedidos,filas:r.regs.length};
 }

 // 2. Sin cuadricula reconocible la pagina va entera; si ESA se corta por
 // tiempo, el ultimo recurso son dos mitades con la franja de encabezados.
 // La fila repetida por el solape se descarta; la segunda visita de la misma
 // cedula a otra hora se conserva, porque son dos ingresos distintos.
 {
  const url=cuadricula(2);
  const prep=await LecturaImagenes.preparar(url,'planilla');
  assert(prep.partes.length===1&&typeof prep.partes[0].mitades==='function','la pagina sin cuadricula quedo sin red de seguridad');
  const urls=[];
  const r=await LecturaImagenes.leer(url,'planilla',(u,tipo,parte)=>{
   urls.push(u);
   if(!parte.solapado)return porTiempo();
   return urls.length===2
    ? ok([fila('41234563','19:00'),fila('18765432','20:15')])
    : ok([fila('41234563','19:00'),fila('41234563','23:30'),fila('29876543','22:40')]);
  });
  const claves=r.regs.map(d=>d.cedula+'@'+d.hora);
  assert(urls.length===3,'no leyo la pagina en dos mitades: '+urls.length+' llamadas');
  assert(urls[1]!==urls[2]&&urls[1]!==urls[0],'las mitades salieron identicas a la pagina');
  assert(r.regs.length===4,'el dedupe conto mal: '+claves.join(','));
  assert(claves.filter(c=>c==='41234563@19:00').length===1,'no descarto la fila repetida del solape');
  assert(claves.includes('41234563@23:30'),'borro la segunda visita de la misma cedula');
  assert(r.lectura_completa===false,'dio por completa una lectura sin cuadricula');
  assert(r.advertencias.some(a=>/mitades solapadas/i.test(a)&&/1 fila/.test(a)),'no avisa el corte ni las filas descartadas: '+r.advertencias.join(' | '));
  resultado.mitadesConEncabezado={llamadas:urls.length,filas:claves};
 }

 // 3. Un documento no se parte por la mitad: se reintenta mas chico. Partir un
 // carne deja media cedula en cada pedazo, que es peor que no leerlo.
 {
  const [c,x]=canvas(1200,900);x.fillStyle='#aaa';x.fillRect(100,100,900,550);
  x.fillStyle='black';x.font='24px sans-serif';x.fillText('DOCUMENTO DE PRUEBA',150,170);
  const url=c.toDataURL('image/jpeg',.94);
  const urls=[];
  const r=await LecturaImagenes.leer(url,'documento',(u,tipo,parte)=>{
   urls.push(u);
   if(urls.length===1)return porTiempo();
   return ok([{cedula:'41234563',nombre:'ANA',apellido:'PEREZ',sexo:'F',fnac:'1980-04-05'}]);
  });
  assert(urls.length===2,'no reintento el documento reducido: '+urls.length+' llamadas');
  assert(urls[1].length<urls[0].length,'la segunda imagen no es mas chica');
  assert(r.regs.length===1,'se perdio el documento al reducir');
  assert(r.lectura_completa===false,'declaro completa una lectura con imagen reducida');
  assert(r.advertencias.some(a=>/reducida/i.test(a)),'no avisa que leyo una imagen reducida: '+r.advertencias.join(' | '));
  resultado.documentoReducido={llamadas:urls.length,bytes:[urls[0].length,urls[1].length]};
 }

 // 4. Un error que no se arregla cortando no se reintenta: gastar llamadas en
 // algo que va a fallar igual solo demora el resto de la planilla.
 {
  const url=cuadricula(10);let llamadas=0;
  const r=await LecturaImagenes.leer(url,'planilla',()=>{llamadas++;throw new Error('Respuesta sin registros.');});
  const partes=(await LecturaImagenes.preparar(url,'planilla')).partes.length;
  assert(llamadas===partes,'reintento un error que no se arregla cortando: '+llamadas+' llamadas para '+partes+' partes');
  assert(r.regs.length===0&&r.lectura_completa===false,'dio por buena una lectura fallida');
  resultado.errorNoReintentado={llamadas,partes};
 }

 // 5. Una banda cuya cantidad de filas no cuadra con la cuadricula es la misma
 // senal que un corte por tiempo: entro demasiado en una sola respuesta. Se
 // vuelve a cortar por las mismas lineas, y el control de celdas se aplica a
 // cada pedazo —mas estricto cuanto mas chico—, asi que la respuesta que no
 // cuadraba se descarta y no entra a la tabla.
 {
  const url=cuadricula(10);const pedidos=[];
  const r=await LecturaImagenes.leer(url,'planilla',(u,tipo,parte)=>{
   pedidos.push(parte.celdas);
   if(parte.celdas===7)return ok([fila('99999999','19:00')]);
   return ok(Array.from({length:parte.celdas},(_,i)=>fila('4123456'+i,'2'+i+':00')));
  });
  assert(pedidos.includes(4)&&pedidos.includes(3),'no subdividio la banda que no cuadraba: '+pedidos.join(','));
  assert(r.regs.length===10,'no recupero las filas al subdividir: '+r.regs.length);
  assert(!r.regs.some(d=>d.cedula==='99999999'),'incorporo la respuesta que el control de celdas rechazo');
  assert(r.advertencias.some(a=>/no coincide con la cuadr/i.test(a)),'no deja rastro de la respuesta rechazada: '+r.advertencias.join(' | '));
  resultado.celdasQueNoCuadran={pedidos,filas:r.regs.length};
 }

 // 6. Si ningun nivel cuadra, la recursion tiene que terminar y quedar acotada:
 // baja hasta bandas de una sola fila, donde una fila por imagen de una fila si
 // cuadra, y nada se acepta en un nivel donde la cuenta no dio.
 {
  const url=cuadricula(10);let llamadas=0;
  const r=await LecturaImagenes.leer(url,'planilla',(u,tipo,parte)=>{llamadas++;return ok([fila('4123456'+(llamadas%10),'19:00')]);});
  assert(llamadas<=40,'los reintentos no quedaron acotados: '+llamadas+' llamadas');
  assert(r.regs.length===10,'no llego a leer fila por fila: '+r.regs.length);
  assert(r.advertencias.filter(a=>/misma cuadr/i.test(a)).length>=2,'no quedo rastro de cada corte: '+r.advertencias.join(' | '));
  resultado.recursionAcotada={llamadas,filas:r.regs.length};
 }

 return resultado;
})()
