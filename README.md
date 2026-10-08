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

Se hace una llamada por recorte, sin reintentar con imágenes cada vez más pequeñas.
Esto aumenta la cantidad de llamadas frente a leer una página completa, pero mantiene
el detalle y reduce la cantidad de registros por respuesta. Una parte fallida queda
identificada y todo el cotejo queda pendiente de revisión. Se verifica la cantidad de
filas devueltas contra las celdas detectadas, descontando el encabezado declarado.
Si la cantidad no coincide, esa respuesta no se incorpora a la tabla y se informa
qué parte quedó sin leer.
No se eliminan visitas repetidas ni duplicados por cédula/hora.

## Reglas

- Coincidencia por número, conservando ceros y letras; solo se quitan espacios,
  puntos y guiones. No se adivinan dígitos para validar una CI.
- Se comparan nombres, apellidos y nacimiento. Tildes y mayúsculas no importan;
  primer nombre/apellido se acepta solo como palabra completa.
- Sexo se compara solo cuando aparece explícitamente en ambas fuentes. No se
  infiere por nombre o retrato. Si falta, se indica **sin verificar**.
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

Importa el repositorio en Netlify: directorio publicado `.`, funciones en
`netlify/functions`, sin comando de build. Es necesario desplegar las funciones;
arrastrar solo HTML a un hosting estático no configura el servidor.

Variables de entorno de las Functions:

| Variable | Uso |
| --- | --- |
| `LLM_API_KEY` | Clave del proveedor. También acepta `OPENAI_API_KEY` o `OPENROUTER_API_KEY`. |
| `LLM_BASE_URL` | Endpoint compatible con Chat Completions. Por defecto `https://api.openai.com/v1`. |
| `LLM_MODEL` | Modelo con visión disponible en tu proveedor. También acepta `OPENAI_MODEL`. Se conserva el predeterminado existente `gpt-6.1-sol`; comprobar disponibilidad en tu cuenta. |
| `LLM_IMAGE_DETAIL` | Por defecto `high`. Un detalle menor puede empeorar la lectura de texto. |

La versión simple también admite clave y proveedor en Ajustes para llamadas directas
(la clave se guarda en localStorage). Con la clave vacía llama a Netlify. Para abrir
localmente, conserva `vendor/`, `extraccion.js`, `cotejo-core.js` y
`lectura-imagenes.js` junto a los HTML. La clave no se incluye en el código.

La función espera hasta 45 segundos; el límite real del hosting puede ser menor.
No hay reintentos automáticos que oculten fallas o multipliquen llamadas.
Los datos se envían al proveedor configurado para su extracción. No se guardan
PDF, cédulas ni claves en las pruebas ni en el repositorio.

## Verificación

`npm test` ejecuta pruebas locales de comparación y de la Function con un proveedor
simulado. No consume saldo ni envía documentos. Los fixtures son ficticios.

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
