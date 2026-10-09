(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CotejoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  // Se saca la puntuacion con la que se escribe un numero y la que deja el
  // escaneo: una comilla pegada a la cedula alcanzaba para que la misma
  // persona apareciera dos veces, una pidiendo revisar y otra como documento
  // sin fila en la planilla. Ninguna cedula lleva estos signos, asi que no
  // puede juntar dos numeros que de verdad sean distintos. Letras y ceros se
  // conservan: ahi si la diferencia es el dato. Entran tambien las marcas
  // combinantes, porque NFKC deja un acento suelto (´) como marca sin letra.
  function numero(v) { return String(v == null ? '' : v).normalize('NFKC').toUpperCase().replace(/[\s.\-'\u2019\u2018\u00b4`"\u201c\u201d_/\\\u0300-\u036f]/g, ''); }
  function palabras(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z\s'-]/g, '').trim().split(/[\s'-]+/).filter(Boolean); }
  function compatibles(a, b) {
    var A = palabras(a), B = palabras(b);
    return !!(A.length && B.length) && (A.every(function(x, i) { return x === B[i]; }) || B.every(function(x, i) { return x === A[i]; }));
  }
  function distancia(a, b) {
    var row = Array.from({length:b.length+1}, function(_, i) { return i; });
    for(var i=1;i<=a.length;i++) {
      var prev=row[0]; row[0]=i;
      for(var j=1;j<=b.length;j++) { var old=row[j]; row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=old; }
    }
    return row[b.length];
  }
  function fecha(v) {
    var s=String(v||'').trim(), m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if(m) s=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    var d=new Date(s+'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===s ? s : '';
  }
  // El carne uruguayo dice "REPUBLICA ORIENTAL DEL URUGUAY", no "URUGUAY".
  // Comparar la cadena entera marcaba como extranjero a todos los documentos
  // uruguayos y, peor, saltaba el control del digito verificador en todos
  // ellos, que es justo el que atrapa un numero mal leido o inventado.
  function esUruguay(t) { return t==='URUGUAY'||t==='URUGUAYA'||t==='URUGUAYO'||t==='ROU'||t==='URY'||t==='UY'; }
  function ciValida(v) {
    var s=numero(v); if(!/^\d{7,8}$/.test(s)) return false;
    s=s.padStart(8,'0'); var coef=[2,9,8,7,6,3,4], sum=0;
    for(var i=0;i<7;i++) sum+=Number(s[i])*coef[i];
    return (10-sum%10)%10===Number(s[7]);
  }
  function comparar(docs, plan, opciones) {
    opciones=opciones||{};
    var completa=opciones.completa!==false, usados=new Set(), out=[];
    plan.forEach(function(p) {
      var ci=numero(p.cedula), candidatos=docs.filter(function(d) { return ci && numero(d.cedula)===ci; });
      var d=candidatos.length===1?candidatos[0]:null, h=[];
      var f={_p:p,_d:d,fecha:p.fecha||'',hora:p.hora||'',cedula:ci,nombre:p.nombre||'',apellido:p.apellido||'',sexo:p.sexo||'',fnac:p.fnac||''};
      candidatos.forEach(function(c) { usados.add(c); });
      function add(s,t) { h.push([s,t]); }
      if(candidatos.length>1) add('warn','Varios documentos tienen este número. Revisar cuál corresponde; no se eligió uno automáticamente.');
      else if(!ci) add('warn','No se pudo leer el número de la planilla.');
      else if(!d) {
        var posibles=docs.filter(function(x) { return compatibles(p.nombre,x.nombre)&&compatibles(p.apellido,x.apellido); });
        add(posibles.length?'warn':'nd',posibles.length?'Hay un documento con nombre compatible pero número distinto. Revisar ambos originales.':(completa?'Sin documento asociado a este número.':'Lectura incompleta: no se puede confirmar si se presentó el documento.'));
      }
      if(d) {
        ['nombre','apellido'].forEach(function(k) {
          if(!palabras(p[k]).length || !palabras(d[k]).length) add('warn','Falta '+k+' legible en una de las fuentes.');
          else if(!compatibles(p[k],d[k])) {
            var a=palabras(p[k]).join(' '), b=palabras(d[k]).slice(0,palabras(p[k]).length).join(' ');
            add(k==='apellido' && distancia(a,b)<=Math.min(2,Math.floor(a.length/4))?'warn':'error',k.toUpperCase()+' DIFERENTE — documento: '+d[k]);
          }
        });
        var emisor=palabras(d.pais_documento), extranjero=emisor.length && !emisor.some(esUruguay);
        // Nacionalidad y país emisor son distintos: un residente extranjero puede tener CI uruguaya.
        if(extranjero) add('warn','Documento emitido en '+d.pais_documento+': revisar tipo y número.');
        if(!extranjero && !ciValida(ci)) add('warn','Número leído con dígito verificador inválido: revisar el original, sin corregir dígitos automáticamente.');
        var nacP=fecha(p.fnac), nacD=fecha(d.fnac);
        if(nacP && nacD && nacP!==nacD) add('error','FECHA DE NACIMIENTO DIFERENTE — planilla: '+nacP+'; documento: '+nacD);
        else if(!nacP || !nacD) add('warn','Fecha de nacimiento sin verificar: falta o no es válida en una fuente.');
        // La sala no coteja el sexo: la columna se saco de la tabla y que una
        // fuente no lo traiga no se reporta. Una diferencia si se reporta,
        // porque no habla del sexo sino de que el documento podria no ser de
        // la persona de la fila.
        var sP=String(p.sexo||'').toUpperCase(), sD=String(d.sexo||'').toUpperCase();
        if(/^[MF]$/.test(sP)&&/^[MF]$/.test(sD)&&sP!==sD) add('error','Sexo diferente — planilla: '+sP+'; documento: '+sD);
        // La vigencia del documento tampoco se coteja, por decision de la sala.
        // El vencimiento se sigue extrayendo y viaja en los datos, asi que
        // volver a mirarlo es una regla, no una relectura.
        if(!fecha(p.fecha)) add('warn','Fecha de ingreso faltante o inválida.');
      }
      // Por registro, no para todo el cotejo: un campo ilegible en un documento
      // no vuelve dudosas las otras veinticuatro filas. Si lo hiciera, todo
      // queda en "revisar" y el operador pierde cuales mirar de verdad. La
      // bandera global se sigue usando donde si corresponde: mas arriba, para
      // no afirmar que un documento FALTA cuando puede estar en una parte que
      // no se pudo leer.
      if(p._incompleto || (d && d._incompleto)) add('warn','Lectura incompleta en este registro: pendiente de revisión.');
      // 'nota' se muestra en la observacion pero no baja el estado. Todo lo
      // demas si: una ausencia que puede esconder un riesgo --vencimiento sin
      // leer esconde un documento vencido, nacimiento sin leer esconde un
      // menor, nombre sin leer es la identidad misma-- sigue siendo aviso.
      function hay(nivel){ return h.some(function(x){ return x[0]===nivel; }); }
      f.estado=hay('error')?'error':hay('warn')?'warn':hay('nd')?'nd':'ok';
      f.obs=h.map(function(x){return x[1];}).join(' · '); out.push(f);
    });
    docs.forEach(function(d) {
      if(usados.has(d)) return;
      var ci=numero(d.cedula);
      out.push({_p:null,_d:d,fecha:'',hora:'',cedula:ci,nombre:d.nombre||'',apellido:d.apellido||'',sexo:d.sexo||'',fnac:d.fnac||'',
        estado:completa&&!d._incompleto&&ci&&ciValida(ci)?'error':'warn',obs:!ci?'Documento sin número legible: completar desde el original.':completa?'Documento sin número coincidente en la planilla.':'Lectura incompleta: no se puede confirmar si este documento figura en la planilla.'});
    });
    return out;
  }
  return {numero:numero,compatibles:compatibles,ciValida:ciValida,fecha:fecha,comparar:comparar};
});
