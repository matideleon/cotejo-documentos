# Sistema de Cotejo

Lee las cedulas de identidad y las coteja contra la planilla de registros.

Hay **dos versiones** en el repo y hacen lo mismo:

| | `cotejo.html` | `index.html` |
|---|---|---|
| Que es | la **version simple**: un solo archivo, una sola pantalla | la version completa, con tabla acumulativa, filtros, busqueda, pegar CSV y alta manual |
| Hace falta | abrir el archivo y pegar la API key una vez | publicar en Netlify y configurar variables de entorno |
| La API key | queda en el navegador (`localStorage`) | queda en el servidor, en una Netlify Function |

Si solo necesitas leer unas cedulas y cruzarlas con la planilla, usa `cotejo.html`.

---

## Version simple — `cotejo.html`

1. Abri `cotejo.html` (doble clic, o publicalo en cualquier lado).
2. **⚙ Ajustes** → pega la API key. Opcionalmente el modelo y la base URL:

   | Campo | Por defecto | Para que |
   |-------|-------------|----------|
   | API key | — | la clave del proveedor. Se guarda solo en este navegador |
   | Modelo  | `gpt-6.1-sol` | tiene que ser un modelo **con vision** |
   | Base URL | `https://api.openai.com/v1` | `https://openrouter.ai/api/v1` para OpenRouter, etc. |

   Sirve cualquier API compatible con OpenAI: OpenAI, OpenRouter, Groq, Together.

3. Arrastra las **cedulas** al cuadro 1 y la **planilla** al cuadro 2. Fotos o PDF,
   una o varias hojas. Cada hoja de PDF se convierte a imagen y se manda aparte.
4. **Cotejar**. Se hace una llamada por pagina y despues se cruzan los datos.
5. Revisa la tabla. Los campos en blanco (cedula, nombre, apellido, sexo) se
   corrigen a mano y el cotejo **se recalcula solo**, sin volver a llamar al modelo.
6. **Descargar CSV** o **Copiar tabla**.

Si dejas la API key vacia y la pagina esta publicada en Netlify, usa la Function
`/.netlify/functions/analizar` y la clave vive del lado del servidor.

### Si algo falla

- **"el navegador no pudo llamar a ..."** — el proveedor bloqueo la llamada directa
  (CORS) o no hay red. Servi la pagina con un servidor local (`python3 -m http.server`)
  o publicala en Netlify y deja la key vacia para usar la Function.
- **"ninguna de las cedulas pasa el digito verificador"** — casi seguro el modelo no
  esta viendo las imagenes y esta inventando datos. Revisa el modelo en Ajustes:
  tiene que ser uno con vision.
- **Una pagina no devuelve registros** — el aviso muestra lo que respondio el modelo.
  Si la hoja es muy densa (9 cedulas, 24 filas) partila en dos imagenes. La app ya
  reintenta sola una vez con la imagen al 60%.

---

## Version completa — `index.html`

App web con tabla acumulativa, filtros, busqueda, pegar CSV y alta manual.
Hosting en Netlify, con una Netlify Function que hace las llamadas del lado del
servidor (la API key nunca viaja al navegador).

### Como desplegarlo


#### Opcion A — arrastrar el ZIP (lo mas rapido)

1. Entra a https://app.netlify.com/drop
2. Arrastra la carpeta descomprimida (no el zip) a la zona de drop.
3. En **Site configuration → Environment variables**, agrega:

   | Variable         | Obligatoria | Valor |
   |------------------|-------------|-------|
   | `LLM_API_KEY`    | si          | la clave del proveedor |
   | `LLM_BASE_URL`   | no          | `https://openrouter.ai/api/v1` para OpenRouter. Si no la pones, usa OpenAI |
   | `LLM_MODEL`      | no          | el slug del modelo. Por defecto `gpt-6.1-sol` |
   | `LLM_IMAGE_DETAIL` | no        | `auto` (por defecto), `low` o `high` |

   Sirve cualquier proveedor compatible con la API de OpenAI: OpenAI, OpenRouter,
   Groq, Together. La function ajusta sola el parametro de tokens segun el caso
   (`max_completion_tokens` en OpenAI, `max_tokens` en el resto).

4. **Deploys → Trigger deploy → Clear cache and deploy site** para que la
   function tome la variable.

#### Opcion B — desde GitHub

1. Subi esta carpeta a un repo.
2. En Netlify: **Add new site → Import an existing project**.
3. Build command: vacio. Publish directory: `.`
4. Agrega `LLM_API_KEY` (y `LLM_BASE_URL` si no usas OpenAI).

El modelo se elige con la variable opcional `OPENAI_MODEL`. Por defecto usa
`gpt-6.1-sol` (equilibrio entre precision y costo). Alternativas: `gpt-6-astra`
si queres maxima precision, o `gpt-6-luna` si te importa mas el costo por pagina.

### Como se usa

1. **Nueva sesion de cotejo** → cargas las cedulas, como **fotos o como PDF**.
2. Siguiente → cargas la planilla, tambien como **foto o PDF**.
3. Analizar → cada pagina se procesa por separado y despues se cruzan los datos.
4. Revisas, corregis lo que haga falta y **Importas** a la tabla.
5. **Exportar CSV** cuando termines.

Tambien hay **Pegar CSV** para cargar datos ya cotejados, y **Agregar manual**
para una fila suelta.

---

## Reglas del cotejo (valen para las dos versiones)

| Estado      | Cuando se marca |
|-------------|-----------------|
| ✗ Error     | Cedula vencida al dia de hoy; digito verificador que no cierra; sexo distinto entre planilla y documento; apellido realmente distinto; documento extranjero (hay que completar Tipo doc / N doc); documento escaneado que no figura en la planilla |
| ⚠ Aviso     | Diferencia de escritura en el apellido (hasta 2 letras de distancia); capitalizacion irregular |
| ? N/D       | Figura en la planilla pero no se escaneo el documento |
| ✓ OK        | Todo coincide |

Una fila puede tener varios problemas: se listan todos en la observacion y manda
el mas grave. El cruce entre documento y planilla se hace por numero de cedula.

## Si una pagina se rechaza

Algunos modelos rechazan una pagina entera por cantidad de tokens de imagen.
Las dos versiones lo detectan y reintentan solas con la imagen mas chica:
`cotejo.html` una vez al 60%, `index.html` al 60% y despues al 40%.
Si aun asi falla, parti la hoja en dos imagenes (o baja `LLM_IMAGE_DETAIL` a `low`
en la version de Netlify).

## Limitaciones que conviene conocer

- **Sin dependencias externas.** PDF.js viaja dentro del proyecto (`vendor/`), asi
  que funciona aunque la red bloquee los CDN. Las tipografias se cargan de Google
  Fonts y si no estan disponibles cae a las del sistema sin romperse.
- **PDF.** Se aceptan PDF en los dos pasos. Cada pagina se convierte a imagen en
  el navegador (con PDF.js) y se manda por separado, asi que un PDF de 3 hojas son
  3 llamadas. Funciona con PDF escaneados y con PDF digitales.
- **Timeout de las functions.** En el plan gratuito de Netlify cada function corta
  a los 10 segundos, y una pagina muy densa (una hoja con 9 cedulas, o una planilla
  de 24 filas) puede pasarse. Si ves el aviso de que la pagina tardo demasiado,
  parti esa hoja en dos imagenes y volve a intentar. En plan Pro el limite sube a
  26 s y el problema practicamente desaparece.
- **Compresion automatica.** Las fotos se reducen a 1600 px y las paginas de PDF se
  renderizan a 2000 px, ambas en JPEG, para no superar el limite de payload. No hay
  nada que configurar.
- **HEIC del iPhone.** Si una foto no se procesa, configura el telefono en
  Ajustes → Camara → Formatos → **Mas compatible** para que guarde en JPG.
- **Los datos no persisten.** La tabla vive mientras la pestaña este abierta.
  Exporta el CSV antes de cerrar.

## Estructura

```
.
├── cotejo.html                     version simple — un archivo, sin backend
├── index.html                      version completa
├── vendor/                         PDF.js (local, sin CDN)
├── netlify.toml                    configuracion de Netlify
├── netlify/functions/analizar.js   function que llama a la API de OpenAI
└── README.md
```


## Probado

**`index.html`** — el flujo completo se probo en Chromium con los PDF reales del
05/10/2026 (3 hojas de cedulas + 1 de planilla): conversion de PDF a imagenes,
envio por pagina, cotejo, revision, importacion, filtros, busqueda y exportacion.
Resultado: 24 registros, 4 errores, 1 aviso, sin falsos positivos.

**`cotejo.html`** — se probo en Chromium con la llamada al modelo interceptada,
sobre un juego de datos que cubre los ocho casos del cotejo (coincidencia exacta,
sexo distinto, apellido tipeado, cedula vencida, documento extranjero, digito
verificador que no cierra, registro sin documento y documento fuera de la
planilla). Se verifico ademas que un PDF de 3 hojas se convierta a 3 imagenes y
se mande en 3 llamadas, que una correccion a mano recalcule el cotejo, que el CSV
salga completo, que sin API key se use la Netlify Function y que un error del
proveedor se muestre tal cual.
