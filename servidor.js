(function(root){
  'use strict';
  // Donde vive la funcion que guarda la clave del proveedor. Antes la pagina y
  // la funcion vivian juntas en Netlify y bastaba una ruta relativa; ahora la
  // pagina es estatica (GitHub Pages, despliegues gratis e ilimitados) y la
  // funcion esta en Supabase, que ademas da 150 segundos para responder en vez
  // de los 10 de Netlify. Por eso la URL es absoluta y configurable.
  var POR_DEFECTO = 'https://srhiaylrohorxqmadrkw.supabase.co/functions/v1/analizar';

  function guardado(k){ try{ return (localStorage.getItem(k) || '').trim(); }catch(e){ return ''; } }

  function url(){
    var propio = guardado('cotejo.endpoint');
    if(propio) return propio;
    // Servida desde Netlify la funcion sigue estando al lado, asi que ese
    // despliegue mantiene su ruta relativa y no depende de Supabase.
    if(/netlify\.(app|com)$/i.test(location.hostname)) return '/.netlify/functions/analizar';
    return POR_DEFECTO;
  }

  function clave(){ return guardado('cotejo.clave'); }
  function guardarClave(v){ try{ localStorage.setItem('cotejo.clave', String(v||'').trim()); }catch(e){} }

  // Para la interfaz que no tiene panel de ajustes: se pide una vez y queda en
  // esta maquina. No es la clave del proveedor, es el permiso para usar el
  // servidor de lectura, que es lo que evita que cualquiera con la URL gaste
  // el saldo de la sala.
  function faltaClave(e){ return /clave de acceso/i.test((e && e.message) || ''); }

  // Una sola puerta de salida al servidor, para que las dos interfaces
  // traduzcan igual los errores. Lo que devuelve un gateway cuando corta por
  // tiempo es HTML, y mostrarselo al operador no le dice nada: el motivo si.
  function pedir(payload){
    var cabeceras = { 'content-type': 'application/json' };
    var c = clave();
    if(c) cabeceras['x-cotejo-clave'] = c;
    return fetch(url(), { method:'POST', headers:cabeceras, body:JSON.stringify(payload) })
      .then(function(r){
        return r.text().then(function(t){
          var d = null;
          try { d = JSON.parse(t); } catch(e){}
          if(!d || typeof d !== 'object'){
            throw new Error(r.status === 504 || /inactivity timeout|timeout/i.test(t)
              ? 'tardo demasiado y se corto la conexion (HTTP ' + r.status + ')'
              : 'respuesta no valida (HTTP ' + r.status + '): ' + t.slice(0,180));
          }
          // El texto no nombra ningun panel: la interfaz simple la pide en
          // Ajustes y la completa la pide en el momento, y las dos muestran esto.
          if(d.falta_clave) throw new Error(d.error + ' Se pone una sola vez por maquina y queda guardada en este navegador.');
          if(!r.ok && !d.error) d.error = 'HTTP ' + r.status + ' — ' + t.slice(0,180);
          if(d.error) throw new Error(d.error + (d.detalle ? ' — ' + d.detalle : ''));
          return d;
        });
      }, function(e){
        throw new Error('no se pudo llegar al servidor de lectura (' + url() + '): ' + (e && e.message ? e.message : 'red o CORS'));
      });
  }

  root.Servidor = { url:url, clave:clave, guardarClave:guardarClave, faltaClave:faltaClave, pedir:pedir, porDefecto:POR_DEFECTO };
})(globalThis);
