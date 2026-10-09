# Sistema de cotejo

Compara documentos de identidad con planillas de ingresos. Conserva dos interfaces:
`cotejo.html` (simple, edición y CSV) e `index.html` (tabla acumulativa y filtros).
Las dos usan las mismas reglas de lectura y comparación.

## Uso

1. Carga documentos y planillas como PDF o imágenes.
2. Comprueba las miniaturas. En la versión simple puedes girarlas antes de leer.
3. Analiza y revisa los avisos. Una lectura incompleta nunca acredita un OK.
4. Corrige desde el original y exporta el CSV antes de cerrar la pestaña.

PDF e imágenes se conservan hasta 3600 px, JPEG de alta calidad. Las planillas
con cuadrícula reconocible se orientan y dividen en bandas de hasta siete filas,
sin enviar otras filas como imagen de contexto. Los documentos se separan
por espacios entre columnas y carnés, antes de llamar al modelo. La segmentación
es heurística: revisar siempre que los recortes y la cantidad extraída correspondan
al original. Si no se reconoce una tabla se mantiene entera y se informa el aviso.

Se hace una llamada por recorte. Cuando una parte no se puede tomar de una sola vez
—el límite de diez segundos de la Function en el plan gratuito de Netlify, un timeout
del proveedor, una respuesta truncada o una cantidad de filas que no cuadra con la
cuadrícula— se corta más fino y se reintenta, según el caso: una banda se vuelve a
cortar por las mismas líneas de la cuadrícula, con lo que el control de celdas sigue
valiendo en cada pedazo y no aparecen filas repetidas; un documento se reintenta con la
imagen reducida, nunca partido, porque media cédula en cada pedazo es peor que no
leerlo. El corte se repite hasta tres veces, de modo que en el peor caso una banda baja
a una fila por llamada y la cantidad de llamadas queda acotada. Un error que no se
arregla cortando no se reintenta. Todo corte deja su motivo en los avisos. Cortar por
la cuadrícula no degrada el cotejo, porque cada pedazo pasa el mismo control de celdas
que el camino normal y más estricto cuanto más chico; marcar esas páginas como lectura
incompleta pondría la planilla entera en «revisar» por un corte que no perdió ni
inventó nada, y ahí se pierde cuáles filas hay que mirar de verdad. Las dos lecturas
que no se pueden validar —las mitades solapadas y la imagen reducida— sí quedan
marcadas como no completas.
Esto aumenta la cantidad de llamadas frente a leer una página completa, pero mantiene
el detalle y reduce la cantidad de registros por respuesta. Una parte fallida queda
identificada y todo el cotejo queda pendiente de revisión. Se verifica la cantidad de
filas devueltas contra las celdas detectadas, descontando el encabezado declarado.
Si la cantidad no coincide, esa respuesta no se incorpora a la tabla y se informa
qué parte quedó sin leer.

En el camino normal no se eliminan visitas repetidas ni duplicados por cédula/hora.
La única excepción es el último recurso de una planilla sin cuadrícula reconocible que
además se corta por tiempo: se lee en dos mitades solapadas, con la franja de
encabezados pegada arriba de la de abajo —sin esa franja el modelo no sabe qué columna
es cuál y corre los nombres respecto de las cédulas— y ahí sí se descarta lo que
repite cédula y hora, que es la fila que cayó en el solape, conservando una segunda
visita de la misma persona a otra hora. Esa lectura nunca se declara completa y queda
avisada para revisar contra el original.

## Reglas

- Coincidencia por número, conservando ceros y letras. Se quita la puntuación con
  la que se escribe un número y la que deja el escaneo —espacios, puntos, guiones,
  comillas, barras, guiones bajos y acentos sueltos—: una comilla pegada a la
  cédula alcanzaba para que la misma persona apareciera en dos filas. Ninguna
  cédula lleva esos signos, así que no puede juntar dos números distintos. No se
  adivinan dígitos para validar una CI.
- Se comparan nombres, apellidos y nacimiento. Tildes y mayúsculas no importan;
  primer nombre/apellido se acepta solo como palabra completa.
- Sexo se compara solo cuando aparece explícitamente en ambas fuentes. No se
  infiere por nombre o retrato. Una diferencia es **error**; que una fuente no lo
  traiga se anota como **sin verificar** pero no baja el estado de la fila: los
  frentes de cédula no imprimen sexo, así que lo contrario dejaba el 100% de las
  filas en aviso y ninguna podía quedar OK.
- **OK significa «no se encontró ninguna discrepancia», no «todo verificado».** El
  recorte de la regla anterior vale solo para el sexo. Una ausencia que puede
  esconder un riesgo sigue siendo aviso: un vencimiento que no se leyó esconde un
  documento vencido, un nacimiento que no se leyó esconde un menor, y un nombre o
  apellido ilegible es la identidad misma.
- El emisor se reconoce por palabra (`URUGUAY`, `ROU`, `URY`, `UY`), no por la
  cadena entera: el carné dice «REPÚBLICA ORIENTAL DEL URUGUAY». Compararla
  completa marcaba todos los documentos uruguayos como extranjeros y, peor,
  saltaba el control del dígito verificador, que solo corre sobre los nacionales.
- La lectura incompleta se mira **por registro**: un campo ilegible en un
  documento no vuelve dudosas las demás filas. La bandera global se usa solo para
  no afirmar que algo **falta** cuando puede estar en una parte que no se leyó.
- El vencimiento se verifica a la fecha de ingreso, o a la fecha actual de
  Montevideo si falta el ingreso (en ese caso se agrega un aviso).
- Nacionalidad y país emisor son campos diferentes. Tener nacionalidad extranjera
  no convierte una CI uruguaya en un documento extranjero.
- Dos documentos con igual número son ambiguos: no se elige el primero.
- Un dato ilegible, un número con verificador inválido o una respuesta incompleta
  produce aviso/revisión, sin afirmar que el documento es inválido o inventado.
- Editar la planilla no modifica la evidencia del documento. La versión simple
  vuelve a cotejar; la completa marca la edición para revisión manual.

## Configuración y despliegue

La página es estática y la clave del proveedor vive en un servidor aparte, porque
el operador de la sala no tiene que manejar ninguna clave de API. Son dos piezas
independientes y cada una se publica donde conviene.

**Versión de la página.** Cada `<script>` de la app lleva `?v=<hash>` y el pie
muestra esa misma versión. GitHub Pages sirve los `.js` con caché de minutos, así
que sin eso un refresh normal trae el HTML nuevo con los scripts viejos: la app
queda en un estado mezclado que no es ninguna de las dos versiones, y corre
reglas distintas de las que uno cree. El hash sale del contenido y del nombre de
`extraccion.js`, `servidor.js`, `cotejo-core.js` y `lectura-imagenes.js`, así que
cambia solo cuando cambia el código. Después de tocar cualquiera de esos
archivos: `node herramientas/version.mjs`. `npm test` corre lo mismo con
`--revisar` y falla si quedaron sin sellar, de modo que no se publica en
silencio. Para saber qué versión está viva, mirar el pie de la página.

**Página (GitHub Pages).** Settings → Pages → Source: *Deploy from a branch*,
rama `main`, carpeta `/ (root)`. No hace falta build ni workflow: los HTML y
`vendor/` están en la raíz, y `.nojekyll` evita que Jekyll toque nada. Los
despliegues son gratis e ilimitados, que es justo lo que Netlify dejó de ser:
en su plan de créditos cada despliegue a producción cuesta 15 de los 300
mensuales, así que iterar sale caro antes de que la app consuma nada.

**Servidor de lectura (Supabase Edge Function).** El código está en
`supabase/functions/analizar/`. Da 150 segundos para responder, frente a los 10
del plan gratuito de Netlify; el tope de 2 s de CPU no molesta porque esperar al
proveedor es I/O y no cuenta. Se despliega con
`supabase functions deploy analizar`. `extraccion.js` dentro de esa carpeta es un
enlace simbólico al de la raíz: los prompts y la validación son los mismos en el
navegador y en el servidor, sin copias que se desincronicen.

Secretos del proyecto de Supabase (Edge Functions → Secrets):

| Secreto | Uso |
| --- | --- |
| `COTEJO_CLAVE` | **Obligatorio.** Clave compartida de la sala. Sin ella la función responde 503 y no atiende a nadie: la URL es pública y una función abierta con la clave del proveedor adentro es plata de cualquiera que la encuentre. |
| `LLM_API_KEY` | Clave del proveedor. También acepta `OPENAI_API_KEY` o `OPENROUTER_API_KEY`. |
| `LLM_BASE_URL` | Endpoint compatible con Chat Completions. Por defecto `https://api.openai.com/v1`. |
| `LLM_MODEL` | Modelo con visión. También acepta `OPENAI_MODEL`. Por defecto `gpt-5-mini`, que es el verificado sobre estos escaneos; comprobar disponibilidad en tu cuenta antes de cambiarlo. |
| `LLM_IMAGE_DETAIL` | Por defecto `high`. Un detalle menor puede empeorar la lectura de texto. |
| `COTEJO_ORIGEN` | Opcional. Restringe CORS a un origen; por defecto `*`. No reemplaza a `COTEJO_CLAVE`: CORS lo respeta un navegador, no un script. |

La clave de la sala se pone **una sola vez por máquina**: la versión simple tiene
el campo en ⚙ Ajustes y la completa la pide la primera vez que hace falta. Queda
en el `localStorage` de ese navegador. No es la clave del proveedor, que nunca
pasa por el navegador.

Ajustes de la versión simple admite además otro servidor de lectura, y clave y
proveedor para llamadas directas desde el navegador sin pasar por el servidor
(útil para probar otro modelo sin volver a desplegar).

El despliegue de Netlify sigue funcionando sin cambios: servida desde un dominio
`netlify.app`, la página usa su ruta relativa `/.netlify/functions/analizar` y no
depende de Supabase. Para abrir localmente, conserva `vendor/`, `extraccion.js`,
`cotejo-core.js`, `lectura-imagenes.js` y `servidor.js` junto a los HTML.

Un proyecto gratuito de Supabase se pausa tras aproximadamente una semana sin
uso: si la sala estuvo cerrada, la primera corrida puede fallar hasta despausarlo
desde el panel.

La función espera hasta 120 segundos y corta antes del límite del hosting para
poder decir por qué en vez de devolver un 504 que no explica nada. Los datos se
envían al proveedor configurado para su extracción. No se guardan PDF, cédulas
ni claves en las pruebas ni en el repositorio.

## Verificación

`npm test` ejecuta pruebas locales de comparación y de la Function con un proveedor
simulado. No consume saldo ni envía documentos. Los fixtures son ficticios.

`tests/browser-smoke.js`, `tests/browser-cortes.js` y `tests/browser-servidor.js`
se evalúan en el navegador sobre
cualquiera de las dos interfaces servidas localmente, con imágenes sintéticas y un
`llamar()` simulado: tampoco llaman a un proveedor. El segundo cubre la red de
seguridad del corte por tiempo: que una banda se subdivida por la cuadrícula sin
perder filas, que las mitades solapadas descarten la fila del solape pero conserven
una segunda visita, que un documento se reintente reducido, que una respuesta que no cuadra con la
cuadrícula se descarte en vez de entrar a la tabla, que la recursión termine acotada y
que un error ajeno no gaste reintentos. El tercero cubre el cliente del servidor
de lectura: a dónde va por defecto, que la clave de la sala viaje en la cabecera y
solo si está guardada, que un 401 se reconozca como falta de clave, que un 504 con
HTML de gateway se traduzca a un mensaje que siga disparando el corte en partes, y
que un fallo de red diga a qué servidor no se pudo llegar.

La función de Supabase no tiene pruebas locales en este repositorio: su validación
de entrada es la misma que la de `netlify/functions/analizar.js`, que sí está
cubierta por `tests/api.test.cjs`.

Se comprobó la preparación visual y una extracción real con `gpt-5-mini` sobre
dos juegos de PDF autorizados: 12 páginas, 70 carnés y 70 filas de planilla.
La versión final devolvió las 70 filas, sin las siete duplicadas que aparecieron
al enviar la página completa como contexto. Se contrastaron número, nombre,
apellido, sexo y fechas de las planillas: un apellido quedó vacío y advertido;
los demás campos de esa comparación coincidieron con el original, ignorando
mayúsculas y tildes. Esta medición corresponde a una ejecución, no garantiza
la precisión futura ni valida automáticamente el contenido de los documentos.

La lectura de los carnés conservó los 70 registros. Se detectó un número de
cédula mal transcrito; el cotejo lo marcó para revisión, sin corregirlo por su
cuenta. Los frentes aportados no muestran sexo: ese campo se dejó sin verificar.
Una interrupción local de Internet obligó a recuperar las partes fallidas durante
la validación. Las pruebas automáticas siguen usando exclusivamente datos ficticios.

Archivos: `cotejo-core.js` contiene las reglas; `extraccion.js`, el contrato y los
prompts compartidos; `lectura-imagenes.js`, la preparación de páginas; la Function
`analizar.js` llama al proveedor y rechaza respuestas truncadas o inválidas.
