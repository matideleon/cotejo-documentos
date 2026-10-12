// Sella las dos interfaces con la version de los archivos JS que cargan.
//
// GitHub Pages sirve los .js con cache de minutos, asi que un refresh normal
// puede traer el HTML nuevo con los scripts viejos: la app queda en un estado
// mezclado que no es ninguna de las dos versiones. En una herramienta de
// control eso es peor que un error visible, porque las reglas que corren no
// son las que uno cree.
//
// La version es un hash corto del contenido de esos archivos, asi que cambia
// sola cuando cambia el codigo. Va en el ?v= de cada <script> --lo que obliga
// al navegador a bajarlos de nuevo-- y a la vista en el pie, para poder
// preguntar "que version ves" y que la respuesta signifique algo.
//
//   node herramientas/version.mjs            sella las dos interfaces
//   node herramientas/version.mjs --revisar  solo avisa si quedo desfasado
//
// La prueba tests/version.test.cjs corre lo mismo con --revisar, de modo que
// un cambio en el JS sin sellar no llega a produccion en silencio.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SCRIPTS = ['extraccion.js', 'servidor.js', 'cotejo-core.js', 'lectura-imagenes.js'];
export const PAGINAS = ['cotejo.html', 'index.html'];

export function version(){
  const h = createHash('sha256');
  // El nombre entra al hash: renombrar un archivo tambien es un cambio.
  for(const f of SCRIPTS) h.update(f).update('\0').update(readFileSync(join(raiz, f)));
  return h.digest('hex').slice(0, 8);
}

export function sellar(pagina, v){
  const ruta = join(raiz, pagina);
  const antes = readFileSync(ruta, 'utf8');
  let despues = antes;
  for(const f of SCRIPTS){
    const re = new RegExp('(<script src="' + f.replace('.', '\\.') + ')(\\?v=[0-9a-f]+)?(">)', 'g');
    despues = despues.replace(re, '$1?v=' + v + '$3');
  }
  despues = despues.replace(/(<span class="version"[^>]*>)[^<]*(<\/span>)/g, '$1v' + v + '$2');
  return { ruta, antes, despues, sellada: despues.includes('?v=' + v) && despues.includes('>v' + v + '<') };
}

export function revisar(){
  const v = version();
  return PAGINAS.map(function(p){
    const r = sellar(p, v);
    return { pagina: p, v: v, alDia: r.antes === r.despues && r.sellada };
  });
}

if(process.argv[1] === fileURLToPath(import.meta.url)){
  const v = version();
  const soloRevisar = process.argv.includes('--revisar');
  let pendiente = 0;
  for(const p of PAGINAS){
    const r = sellar(p, v);
    if(r.antes === r.despues){ console.log('al dia   ' + p + '  v' + v); continue; }
    pendiente++;
    if(soloRevisar) console.log('DESFASADO ' + p + ' — deberia decir v' + v);
    else { writeFileSync(r.ruta, r.despues); console.log('sellada  ' + p + '  v' + v); }
  }
  if(soloRevisar && pendiente) process.exit(1);
}
