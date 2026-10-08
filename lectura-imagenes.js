(function(root){
  'use strict';
  function cargar(url){return new Promise(function(resolve,reject){var img=new Image();img.onload=function(){resolve(img);};img.onerror=function(){reject(new Error('No se pudo abrir la imagen.'));};img.src=url;});}
  function canvas(w,h){var c=document.createElement('canvas');c.width=Math.round(w);c.height=Math.round(h);var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);return c;}
  function recorte(img,x,y,w,h){var c=canvas(w,h);c.getContext('2d').drawImage(img,x,y,w,h,0,0,c.width,c.height);return c;}
  function escala(img,f){var c=canvas(img.width*f,img.height*f);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}
  function jpeg(c){
    for(var q=.94;q>=.8;q-=.04){var url=c.toDataURL('image/jpeg',q);if(url.length<3900000)return url;}
    throw new Error('Imagen demasiado grande: dividir la página, conservando el detalle.');
  }
  function girarCanvas(img){var c=canvas(img.height,img.width),x=c.getContext('2d');x.translate(0,c.height);x.rotate(-Math.PI/2);x.drawImage(img,0,0);return c;}
  function grupos(values,min,maxGap){
    var out=[],start=-1,last=-1;
    values.forEach(function(v,i){if(v>=min){if(start<0)start=i;last=i;}else if(start>=0&&i-last>maxGap){out.push([start,last+1]);start=-1;}});
    if(start>=0)out.push([start,last+1]);return out;
  }
  function analizarPixeles(img,umbral,reglas){
    var k=Math.min(1,1100/Math.max(img.width,img.height)), c=canvas(img.width*k,img.height*k),x=c.getContext('2d',{willReadFrequently:true});
    x.drawImage(img,0,0,c.width,c.height);var data=x.getImageData(0,0,c.width,c.height).data;
    var xs=new Array(c.width).fill(0),ys=new Array(c.height).fill(0);
    for(var y=0;y<c.height;y++)for(var xx=0;xx<c.width;xx++){var i=(y*c.width+xx)*4;if((data[i]+data[i+1]+data[i+2])/3<(umbral||185)){xs[xx]++;ys[y]++;}}
    if(reglas){
      xs.fill(0);ys.fill(0);
      function oscuro(px,py){if(px<0||py<0||px>=c.width||py>=c.height)return false;var i=(py*c.width+px)*4;return (data[i]+data[i+1]+data[i+2])/3<185;}
      for(var yy=0;yy<c.height;yy++)for(var xxx=0;xxx<c.width;xxx++){
        var horizontal=false,vertical=false;
        for(var delta=-4;delta<=4;delta++){if(!horizontal&&oscuro(xxx,yy+delta))horizontal=true;if(!vertical&&oscuro(xxx+delta,yy))vertical=true;}
        if(horizontal)ys[yy]++;if(vertical)xs[xxx]++;
      }
    }
    return {xs:xs,ys:ys,w:c.width,h:c.height,k:k};
  }
  function lineas(values,length){return grupos(values,length*.65,3).filter(function(g){return g[1]-g[0]<16;}).map(function(g){return (g[0]+g[1])/2;});}

  // Último recurso para una planilla sin cuadrícula reconocible que se corta por
  // tiempo: dos mitades con la franja de encabezados pegada arriba de la de
  // abajo. Sin esa franja el modelo no sabe qué columna es cuál y corre los
  // nombres respecto de las cédulas. El solape hace que la fila del corte
  // aparezca entera en alguna de las dos, al precio de poder repetirla.
  function mitadesConEncabezado(img){
    var cabeza=Math.round(img.height*.12),solape=Math.round(img.height*.08),medio=Math.round(img.height/2);
    return [[0,medio+solape],[Math.max(cabeza,medio-solape),img.height]].map(function(t,i){
      var alto=t[1]-t[0],conCabeza=i>0,c=canvas(img.width,alto+(conCabeza?cabeza:0)),x=c.getContext('2d');
      if(conCabeza)x.drawImage(img,0,0,img.width,cabeza,0,0,c.width,cabeza);
      x.drawImage(img,0,t[0],img.width,alto,0,conCabeza?cabeza:0,c.width,alto);
      return {url:jpeg(c),solapado:true,descripcion:'Mitad '+(i+1)+' de 2 de la página, con la franja de encabezados pegada arriba. Extrae todas las filas de datos visibles. Las mitades se solapan: puede haber filas repetidas entre una y otra.'};
    });
  }

  // Las mitades se solapan, así que una fila puede venir dos veces. La clave
  // incluye la hora a propósito: la misma persona puede entrar dos veces en la
  // noche y esas son dos filas legítimas del registro, no un duplicado. Solo se
  // descarta lo que repite cédula Y hora, que es la fila que cayó en el solape.
  function sinDuplicados(regs){
    var vistos={},out=[];
    regs.forEach(function(r){
      var ci=String((r&&r.cedula)||'').replace(/\D/g,''),hora=String((r&&r.hora)||'').trim();
      var clave=ci?ci+'@'+hora:[(r&&r.nombre)||'',(r&&r.apellido)||'',hora].join('|').toLowerCase();
      if(clave==='||'||vistos[clave])return;
      vistos[clave]=1;out.push(r);
    });
    return out;
  }

  function planilla(img,maxFilas){
    maxFilas=maxFilas||7;
    var p=analizarPixeles(img,185,true),vx=lineas(p.xs,p.h),hy=lineas(p.ys,p.w),girada=false;
    if(vx.length>hy.length+2&&vx.length>=8){img=girarCanvas(img);girada=true;p=analizarPixeles(img,185,true);vx=lineas(p.xs,p.h);hy=lineas(p.ys,p.w);}
    // Sin cuadrícula no hay con qué validar cuántas filas tendría que haber: se
    // manda la página entera y queda el corte en mitades como red de seguridad.
    function pagina(aviso){
      return {partes:[{url:jpeg(recorte(img,0,0,img.width,img.height)),mitades:function(){return mitadesConEncabezado(img);}}],
              url:girada?jpeg(img):null,avisos:[aviso]};
    }
    if(hy.length<8)return pagina('No se reconoció la cuadrícula: se leyó la página completa. Verificar orientación y cantidad de filas.');
    var diffs=hy.slice(1).map(function(v,i){return v-hy[i];}), orden=diffs.slice().sort(function(a,b){return a-b;}), med=orden[Math.floor(orden.length/2)];
    if(med<7 || diffs.some(function(d){return d<med*.55||d>med*1.6;}))return pagina('Cuadrícula irregular: verificar cantidad de filas.');
    var n=hy.length-1;
    // Una banda va de una línea de la cuadrícula a otra, nunca por el medio de
    // una fila, así que las bandas no se solapan: cada fila física se extrae una
    // vez y no hay nada que deduplicar. subdividir() vuelve a cortar por esas
    // mismas líneas si la banda se corta por tiempo, de modo que el control de
    // celdas sigue valiendo en los pedazos. Cortar a ciegas por la mitad es lo
    // que corría los nombres respecto de las cédulas.
    function banda(a,b,etiqueta){
      var y0=Math.max(0,Math.floor(hy[a]/p.k)-3),y1=Math.min(img.height,Math.ceil(hy[b]/p.k)+3),celdas=b-a;
      return {celdas:celdas,url:jpeg(recorte(img,0,y0,img.width,y1-y0)),
        descripcion:'Banda '+etiqueta+'. La imagen principal contiene '+celdas+' celdas horizontales (incluye encabezado si aparece). Extrae todas las filas de datos de esta banda. No hay otras filas fuera de esta banda para extraer.',
        subdividir:celdas>1?function(){
          var medio=a+Math.ceil(celdas/2),out=[banda(a,medio,etiqueta+'.1')];
          if(b>medio)out.push(banda(medio,b,etiqueta+'.2'));
          return out;
        }:null};
    }
    var partes=[];
    for(var a=0;a<n;a+=maxFilas)partes.push(banda(a,Math.min(a+maxFilas,n),String(partes.length+1)));
    return {partes:partes,url:girada?jpeg(img):null,avisos:[]};
  }

  // Un carné no se parte por la mitad: si se corta por tiempo se manda más
  // chico. Perder nitidez es recuperable y queda avisado; perder media cédula no.
  function tile(c,extra){
    var parte={url:jpeg(c),reducir:function(){return jpeg(escala(c,.6));}};
    Object.keys(extra||{}).forEach(function(k){parte[k]=extra[k];});
    return parte;
  }

  function documentos(img){
    var p=analizarPixeles(img,225);
    var cols=grupos(p.xs,p.h*.035,3).filter(function(g){return g[1]-g[0]>p.w*.09;}),rows=grupos(p.ys,p.w*.035,3).filter(function(g){return g[1]-g[0]>p.h*.09;});
    if(!cols.length||!rows.length||cols.length*rows.length>16)return {partes:[tile(recorte(img,0,0,img.width,img.height))],avisos:['No se separaron los documentos: verificar cuántos se leyeron.']};
    var partes=[];
    cols.forEach(function(c){
      var x0=Math.max(0,Math.floor(c[0]/p.k)-10),x1=Math.min(img.width,Math.ceil(c[1]/p.k)+10);
      var strip=recorte(img,x0,0,x1-x0,img.height),sp=analizarPixeles(strip,225);
      var filas=grupos(sp.ys,sp.w*.035,3).filter(function(g){return g[1]-g[0]>sp.h*.09;});
      filas.forEach(function(r){
        var y0=Math.max(0,Math.floor(r[0]/sp.k)-10),y1=Math.min(img.height,Math.ceil(r[1]/sp.k)+10);
        var corte=recorte(img,x0,y0,x1-x0,y1-y0),t=analizarPixeles(corte),tinta=t.xs.reduce(function(a,b){return a+b;},0)/(t.w*t.h);
        if(tinta<.025)return;
        if(corte.height>corte.width*1.15)corte=girarCanvas(corte);
        partes.push(tile(corte,{esperados:corte.width/corte.height>1.2&&corte.width/corte.height<2?1:null,
          descripcion:'Zona de documento '+(partes.length+1)+'. Extrae todos los documentos físicos visibles en esta zona.'}));
      });
    });
    return {partes:partes.length?partes:[tile(recorte(img,0,0,img.width,img.height))],avisos:partes.length?[]:['No se separó contenido legible: se conserva la página completa para revisar.']};
  }

  async function preparar(url,tipo){var img=await cargar(url);return tipo==='planilla'?planilla(img):documentos(img);}

  // Lo que se recupera cortando o reduciendo: el límite de tiempo de la función
  // de Netlify, un timeout del proveedor, una imagen que no entra, una respuesta
  // truncada y una cantidad de filas que no cuadra con la cuadrícula. Los dos
  // últimos son la misma señal: entró demasiado en una sola respuesta. Volver a
  // cortar ahí es seguro porque el control de celdas se aplica igual a cada
  // pedazo, y es más estricto cuanto más chico el pedazo: lo mal leído se rechaza
  // igual. Un error de otra clase no se arregla reintentando y no se reintenta.
  function recuperableCortando(msg){return /tard|timeout|504|abort|agot|demasiado grande|truncad|no coincide con la cuadr/i.test(String(msg||''));}

  async function leer(url,tipo,llamar,avisar){
    var prep;
    try{ prep=await preparar(url,tipo); }
    catch(e){
      // Si la preparación falla todavía se puede intentar la página tal cual:
      // leerla sin separar es peor que separarla, pero mucho mejor que perderla.
      prep={partes:[{url:url}],url:null,avisos:['No se pudo preparar la página ('+e.message+'): se leyó tal cual.']};
    }

    async function leerParte(parte,etiqueta,nivel){
      try{
        var r=await llamar(parte.url,tipo,parte);
        if(!Array.isArray(r.registros))throw new Error('Respuesta sin registros.');
        if(parte.celdas&&(r.encabezados===null||r.encabezados===undefined||r.registros.length+r.encabezados!==parte.celdas))
          throw new Error('La cantidad de filas leídas no coincide con la cuadrícula. Revisar el original.');
        if(parte.esperados&&r.registros.length!==parte.esperados)
          throw new Error('Cantidad de documentos inesperada. Revisar el recorte.');
        r.registros.forEach(function(d,j){d._parte=etiqueta;d._registro=j+1;});
        return {regs:r.registros,completa:!!r.lectura_completa,
                avisos:(r.advertencias||[]).map(function(t){return etiqueta+': '+t;})};
      }catch(e){
        var rescate=nivel<3&&recuperableCortando(e.message)?await recortarMas(parte,etiqueta,nivel,e):null;
        return rescate||{regs:[],completa:false,avisos:[etiqueta+' sin leer: '+e.message]};
      }
    }

    async function leerVarias(partes,prefijo,sep,nivel){
      var acc={regs:[],completa:partes.length>0,avisos:[]};
      for(var i=0;i<partes.length;i++){
        var etiqueta=prefijo+sep+(i+1);
        if(avisar)avisar('leyendo '+etiqueta.toLowerCase()+' de '+partes.length);
        var r=await leerParte(partes[i],etiqueta,nivel);
        acc.regs=acc.regs.concat(r.regs);acc.completa=acc.completa&&r.completa;acc.avisos=acc.avisos.concat(r.avisos);
      }
      return acc;
    }

    // Se intenta en este orden: cortar por la cuadrícula (no pierde nada ni
    // necesita deduplicar), cortar en mitades solapadas (último recurso sin
    // cuadrícula, queda marcado como no verificado) y reducir (documentos, que
    // no se parten). Devuelve null si el rescate tampoco trajo nada.
    async function recortarMas(parte,etiqueta,nivel,causa){
      if(parte.subdividir){
        var hijas;try{hijas=parte.subdividir();}catch(e){return null;}
        if(!hijas.length)return null;
        if(avisar)avisar(etiqueta+' no se pudo leer de una vez: se corta por la cuadrícula en '+hijas.length+' partes');
        var r=await leerVarias(hijas,etiqueta,'.',nivel+1);
        if(!r.regs.length)return null;
        // Esta lectura NO se degrada a incompleta: cada pedazo se validó contra
        // sus propias celdas, que es la misma garantía del camino normal y más
        // estricta cuanto más chico el pedazo. Marcarla incompleta pondría todo
        // el cotejo en «revisar» por un corte que no perdió ni inventó nada, y
        // ahí el operador pierde la señal de cuáles filas mirar de verdad. Queda
        // el aviso para que el corte no sea invisible.
        r.avisos=[etiqueta+': no se pudo tomar la respuesta entera ('+causa.message+'); se leyó en '+hijas.length+' partes de la misma cuadrícula, cada una validada contra sus celdas.'].concat(r.avisos);
        return r;
      }
      if(parte.mitades){
        var ms;try{ms=parte.mitades();}catch(e){return null;}
        if(avisar)avisar(etiqueta+' no se pudo leer de una vez: se lee en dos mitades con los encabezados');
        var m=await leerVarias(ms,etiqueta,'.',nivel+1);
        if(!m.regs.length)return null;
        var antes=m.regs.length;m.regs=sinDuplicados(m.regs);
        // Sin cuadrícula no hay forma de confirmar que estén todas las filas, y
        // el solape pudo repetir alguna: esto se revisa contra el original.
        m.completa=false;
        m.avisos=[etiqueta+': no se pudo tomar la respuesta entera ('+causa.message+'); se leyó en 2 mitades solapadas y se descartaron '+(antes-m.regs.length)+' fila(s) repetida(s) por cédula y hora. Verificar contra el original.'].concat(m.avisos);
        return m;
      }
      if(parte.reducir){
        var chica;try{chica=parte.reducir();}catch(e){return null;}
        if(avisar)avisar(etiqueta+' no se pudo leer de una vez: se reintenta con la imagen reducida');
        var copia={};Object.keys(parte).forEach(function(k){copia[k]=parte[k];});
        copia.url=chica;copia.reducir=null;
        copia.descripcion=(parte.descripcion||'')+' La imagen viene reducida: si un dato no se lee con seguridad, dejalo vacío y avisá.';
        var d=await leerParte(copia,etiqueta,nivel+1);
        if(!d.regs.length)return null;
        d.completa=false;
        d.avisos=[etiqueta+': no se pudo tomar la respuesta entera ('+causa.message+'); se reintentó con la imagen reducida. Verificar los datos de esta parte.'].concat(d.avisos);
        return d;
      }
      return null;
    }

    var leido=await leerVarias(prep.partes,'Parte',' ',0);
    var warnings=prep.avisos.concat(leido.avisos);
    var completa=leido.completa&&!prep.avisos.length&&prep.partes.length>0;
    if(!completa&&!warnings.length)warnings.push('La lectura no pudo confirmarse completa.');
    return {regs:leido.regs,lectura_completa:completa,advertencias:warnings,url:prep.url||url,partes:prep.partes.length};
  }

  root.LecturaImagenes={preparar:preparar,leer:leer};
})(globalThis);
