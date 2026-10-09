// Un cambio en el JS sin sellar las paginas no llega a produccion en silencio.
// GitHub Pages cachea los .js por minutos: sin el ?v= el navegador combina el
// HTML nuevo con los scripts viejos y la app corre reglas que no son las que
// uno cree que corre.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const raiz=join(__dirname,'..');
let mod;
test('las dos interfaces estan selladas con la version del JS que cargan',async()=>{
  mod=await import('../herramientas/version.mjs');
  const desfasadas=mod.revisar().filter(r=>!r.alDia).map(r=>r.pagina);
  assert.deepEqual(desfasadas,[],'correr: node herramientas/version.mjs');
});

test('cada script de la app lleva la version en la URL',async()=>{
  mod=mod||await import('../herramientas/version.mjs');
  const v=mod.version();
  for(const pagina of mod.PAGINAS){
    const html=readFileSync(join(raiz,pagina),'utf8');
    for(const f of mod.SCRIPTS){
      assert.ok(html.includes('<script src="'+f+'?v='+v+'">'),pagina+' carga '+f+' sin la version '+v);
    }
    assert.ok(html.includes('>v'+v+'<'),pagina+' no muestra la version en el pie');
  }
});

test('la version cambia cuando cambia cualquier script',async()=>{
  mod=mod||await import('../herramientas/version.mjs');
  const antes=mod.version();
  // Se verifica sin tocar el disco: el hash depende del contenido y del
  // nombre, asi que basta comprobar que ambos entran en la cuenta.
  const {createHash}=require('node:crypto');
  function hash(pares){const h=createHash('sha256');for(const [n,c] of pares)h.update(n).update('\0').update(c);return h.digest('hex').slice(0,8);}
  const reales=mod.SCRIPTS.map(f=>[f,readFileSync(join(raiz,f))]);
  assert.equal(hash(reales),antes,'el hash no reproduce la version publicada');
  const tocado=reales.map((x,i)=>i===0?[x[0],Buffer.concat([x[1],Buffer.from('//')])]:x);
  assert.notEqual(hash(tocado),antes,'un cambio de contenido no mueve la version');
  const renombrado=reales.map((x,i)=>i===0?['otro.js',x[1]]:x);
  assert.notEqual(hash(renombrado),antes,'un renombre no mueve la version');
});
