// El cliente del servidor de lectura: a donde va, que manda y como traduce lo
// que vuelve. Nada sale a la red: se reemplaza fetch. Ejecutar con gstack
// browse eval sobre cualquiera de las dos interfaces servidas localmente.
return (async()=>{
 const assert=(c,m)=>{if(!c)throw new Error('FAIL: '+m);};
 const original=window.fetch;
 const guardado=(()=>{try{return localStorage.getItem('cotejo.clave');}catch(e){return null;}})();
 const limpiar=()=>{try{localStorage.removeItem('cotejo.clave');localStorage.removeItem('cotejo.endpoint');}catch(e){}};
 const responder=(cuerpo,init)=>{window.fetch=async(u,o)=>{ultimo={url:String(u),opciones:o};return new Response(cuerpo,init||{status:200,headers:{'content-type':'application/json'}});};};
 let ultimo=null;
 const resultado={};
 try{
  limpiar();

  // 1. Sin configuracion la pagina usa el servidor que viene por defecto. Esto
  // antes era una ruta relativa porque la funcion vivia al lado; ahora la
  // pagina es estatica y la funcion esta en otro dominio.
  assert(Servidor.url()===Servidor.porDefecto,'no uso el servidor por defecto: '+Servidor.url());
  assert(/^https:\/\//.test(Servidor.porDefecto),'el servidor por defecto no es una URL absoluta');
  resultado.porDefecto=Servidor.porDefecto;

  // 2. Se puede apuntar a otro servidor sin tocar el codigo.
  try{localStorage.setItem('cotejo.endpoint','https://otro.ejemplo/funcion');}catch(e){}
  assert(Servidor.url()==='https://otro.ejemplo/funcion','no respeto el servidor configurado: '+Servidor.url());
  limpiar();

  // 3. La clave de la sala viaja en la cabecera, y solo si esta guardada.
  responder(JSON.stringify({registros:[],lectura_completa:true,advertencias:[],encabezados:0}));
  await Servidor.pedir({tipo:'planilla'});
  assert(!('x-cotejo-clave' in ultimo.opciones.headers),'mando una cabecera de clave vacia');
  Servidor.guardarClave('abc123');
  await Servidor.pedir({tipo:'planilla'});
  assert(ultimo.opciones.headers['x-cotejo-clave']==='abc123','no mando la clave guardada');
  assert(ultimo.url===Servidor.porDefecto,'no pidio al servidor por defecto: '+ultimo.url);
  resultado.claveEnCabecera=true;

  // 4. Si falta la clave, el mensaje tiene que decir que se arregla una sola
  // vez, y faltaClave() lo tiene que reconocer: la interfaz completa no tiene
  // panel de ajustes y la pide en el momento a partir de eso.
  responder(JSON.stringify({error:'Falta la clave de acceso de esta sala o no coincide.',falta_clave:true}),{status:401,headers:{'content-type':'application/json'}});
  let err=null;
  try{await Servidor.pedir({tipo:'planilla'});}catch(e){err=e;}
  assert(err,'un 401 no fallo');
  assert(Servidor.faltaClave(err),'faltaClave() no reconocio el 401: '+err.message);
  assert(/una sola vez/i.test(err.message),'el mensaje no dice que se pone una sola vez: '+err.message);
  resultado.faltaClave=err.message;

  // 5. Un gateway que corta por tiempo devuelve HTML, no JSON. El mensaje tiene
  // que seguir diciendo "tardo demasiado", porque es lo que dispara el corte en
  // partes de lectura-imagenes. Si cambia la redaccion, se rompe la red de
  // seguridad sin que nada mas se queje.
  responder('<html><body>Inactivity Timeout</body></html>',{status:504,headers:{'content-type':'text/html'}});
  err=null;
  try{await Servidor.pedir({tipo:'planilla'});}catch(e){err=e;}
  assert(err&&/tard/i.test(err.message),'un 504 no dio un mensaje de corte por tiempo: '+(err&&err.message));
  assert(!/<html>/i.test(err.message),'le mostro el HTML del gateway al operador');
  resultado.porTiempo=err.message;

  // 6. Un error del proveedor llega tal cual, con su detalle si lo trae.
  responder(JSON.stringify({error:'El proveedor no pudo leer la imagen (HTTP 429).',detalle:'sin cuota'}),{status:502,headers:{'content-type':'application/json'}});
  err=null;
  try{await Servidor.pedir({tipo:'planilla'});}catch(e){err=e;}
  assert(err&&/429/.test(err.message)&&/sin cuota/.test(err.message),'perdio el error del proveedor: '+(err&&err.message));

  // 7. Si no se llega al servidor, el mensaje dice cual es, porque ahora puede
  // estar mal configurado y eso no se adivina.
  window.fetch=async()=>{throw new TypeError('Failed to fetch');};
  err=null;
  try{await Servidor.pedir({tipo:'planilla'});}catch(e){err=e;}
  assert(err&&err.message.indexOf(Servidor.porDefecto)!==-1,'no dice a que servidor no pudo llegar: '+(err&&err.message));
  resultado.sinRed=err.message;

  return resultado;
 } finally {
  window.fetch=original;
  limpiar();
  if(guardado!==null){try{localStorage.setItem('cotejo.clave',guardado);}catch(e){}}
 }
})()
