(function(root){
  'use strict';
  function cargar(url){return new Promise(function(resolve,reject){var img=new Image();img.onload=function(){resolve(img);};img.onerror=function(){reject(new Error('No se pudo abrir la imagen.'));};img.src=url;});}
  function canvas(w,h){var c=document.createElement('canvas');c.width=Math.round(w);c.height=Math.round(h);var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);return c;}
  function recorte(img,x,y,w,h){var c=canvas(w,h);c.getContext('2d').drawImage(img,x,y,w,h,0,0,c.width,c.height);return c;}
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
  function planilla(img){
    var p=analizarPixeles(img,185,true),vx=lineas(p.xs,p.h),hy=lineas(p.ys,p.w),girada=false;
    if(vx.length>hy.length+2&&vx.length>=8){img=girarCanvas(img);girada=true;p=analizarPixeles(img,185,true);vx=lineas(p.xs,p.h);hy=lineas(p.ys,p.w);}
    // Solo dividir tablas cuya cuadrícula se reconoce. Las bandas no se solapan:
    // cada fila física se extrae una vez, sin deduplicar por número ni por hora.
    if(hy.length<8)return {partes:[{url:jpeg(recorte(img,0,0,img.width,img.height))}],url:girada?jpeg(img):null,avisos:['No se reconoció la cuadrícula: se leyó la página completa. Verificar orientación y cantidad de filas.']};
    var diffs=hy.slice(1).map(function(v,i){return v-hy[i];}), orden=diffs.slice().sort(function(a,b){return a-b;}), med=orden[Math.floor(orden.length/2)];
    if(med<7 || diffs.some(function(d){return d<med*.55||d>med*1.6;}))return {partes:[{url:jpeg(recorte(img,0,0,img.width,img.height))}],url:girada?jpeg(img):null,avisos:['Cuadrícula irregular: verificar cantidad de filas.']};
    var contexto=canvas(img.width*.4,img.height*.4);contexto.getContext('2d').drawImage(img,0,0,contexto.width,contexto.height);
    var partes=[],n=hy.length-1;
    for(var a=0;a<n;a+=7){var b=Math.min(a+7,n),y0=Math.max(0,Math.floor(hy[a]/p.k)-3),y1=Math.min(img.height,Math.ceil(hy[b]/p.k)+3);
      partes.push({celdas:b-a,url:jpeg(recorte(img,0,y0,img.width,y1-y0)),contexto:contexto.toDataURL('image/jpeg',.85),descripcion:'Banda '+(partes.length+1)+'. La imagen principal contiene '+(b-a)+' celdas horizontales (incluye encabezado si aparece). Extrae todas las filas de datos de esta banda. La segunda imagen es la página completa SOLO como contexto.'});
    }
    return {partes:partes,url:girada?jpeg(img):null,avisos:[]};
  }
  function documentos(img){
    var p=analizarPixeles(img,225);
    var cols=grupos(p.xs,p.h*.035,3).filter(function(g){return g[1]-g[0]>p.w*.09;}),rows=grupos(p.ys,p.w*.035,3).filter(function(g){return g[1]-g[0]>p.h*.09;});
    if(!cols.length||!rows.length||cols.length*rows.length>16)return {partes:[{url:jpeg(recorte(img,0,0,img.width,img.height))}],avisos:['No se separaron los documentos: verificar cuántos se leyeron.']};
    var partes=[];
    cols.forEach(function(c){
      var x0=Math.max(0,Math.floor(c[0]/p.k)-10),x1=Math.min(img.width,Math.ceil(c[1]/p.k)+10);
      var strip=recorte(img,x0,0,x1-x0,img.height),sp=analizarPixeles(strip,225);
      var filas=grupos(sp.ys,sp.w*.035,3).filter(function(g){return g[1]-g[0]>sp.h*.09;});
      filas.forEach(function(r){
        var y0=Math.max(0,Math.floor(r[0]/sp.k)-10),y1=Math.min(img.height,Math.ceil(r[1]/sp.k)+10);
        var tile=recorte(img,x0,y0,x1-x0,y1-y0),t=analizarPixeles(tile),tinta=t.xs.reduce(function(a,b){return a+b;},0)/(t.w*t.h);
        if(tinta<.025)return;
        if(tile.height>tile.width*1.15)tile=girarCanvas(tile);
        partes.push({esperados:tile.width/tile.height>1.2&&tile.width/tile.height<2?1:null,url:jpeg(tile),descripcion:'Zona de documento '+(partes.length+1)+'. Extrae todos los documentos físicos visibles en esta zona.'});
      });
    });
    return {partes:partes.length?partes:[{url:jpeg(recorte(img,0,0,img.width,img.height))}],avisos:partes.length?[]:['No se separó contenido legible: se conserva la página completa para revisar.']};
  }
  async function preparar(url,tipo){var img=await cargar(url);return tipo==='planilla'?planilla(img):documentos(img);}
  async function leer(url,tipo,llamar,avisar){
    var prep=await preparar(url,tipo),regs=[],warnings=prep.avisos.slice(),completa=!warnings.length;
    for(var i=0;i<prep.partes.length;i++){
      if(avisar)avisar('leyendo parte '+(i+1)+' de '+prep.partes.length);
      try{
        var r=await llamar(prep.partes[i].url,tipo,prep.partes[i]);
        if(!Array.isArray(r.registros))throw new Error('Respuesta sin registros.');
        r.registros.forEach(function(d,j){d._parte=i+1;d._registro=j+1;regs.push(d);});
        if(!r.lectura_completa)completa=false;
        var parte=prep.partes[i];
        if(parte.celdas && (r.encabezados===null || r.encabezados===undefined || r.registros.length+r.encabezados!==parte.celdas)){
          completa=false;warnings.push('Parte '+(i+1)+': la cantidad de filas leídas no coincide con la cuadrícula. Revisar el original.');
        }
        if(parte.esperados && r.registros.length!==parte.esperados){
          completa=false;warnings.push('Parte '+(i+1)+': cantidad de documentos inesperada. Revisar el recorte.');
        }
        warnings=warnings.concat((r.advertencias||[]).map(function(t){return 'Parte '+(i+1)+': '+t;}));
      }catch(e){completa=false;warnings.push('Parte '+(i+1)+' sin leer: '+e.message);}
    }
    if(!completa&&!warnings.length)warnings.push('La lectura no pudo confirmarse completa.');
    return {regs:regs,lectura_completa:completa&&prep.partes.length>0,advertencias:warnings,url:prep.url||url,partes:prep.partes.length};
  }
  root.LecturaImagenes={preparar:preparar,leer:leer};
})(globalThis);
