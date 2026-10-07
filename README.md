# Sistema de Cotejo — DGC

App web para cotejar documentos de identidad contra la planilla de registros.
Hosting en Netlify, con una Netlify Function que hace las llamadas a la API de
Anthropic del lado del servidor (la API key nunca viaja al navegador).

## Como desplegarlo

### Opcion A — arrastrar el ZIP (lo mas rapido)

1. Entra a https://app.netlify.com/drop
2. Arrastra la carpeta descomprimida (no el zip) a la zona de drop.
3. Una vez creado el sitio, anda a **Site configuration → Environment variables**
   y agrega:

   | Variable            | Valor                      |
   |---------------------|----------------------------|
   | `ANTHROPIC_API_KEY` | tu clave `sk-ant-...`      |

4. **Deploys → Trigger deploy → Clear cache and deploy site** para que la
   function tome la variable.

### Opcion B — desde GitHub

1. Subi esta carpeta a un repo.
2. En Netlify: **Add new site → Import an existing project**.
3. Build command: vacio. Publish directory: `.`
4. Agrega `ANTHROPIC_API_KEY` en las variables de entorno.

## Como se usa

1. **Nueva sesion de cotejo** → cargas las cedulas, como **fotos o como PDF**.
2. Siguiente → cargas la planilla, tambien como **foto o PDF**.
3. Analizar → cada pagina se procesa por separado y despues se cruzan los datos.
4. Revisas, corregis lo que haga falta y **Importas** a la tabla.
5. **Exportar CSV** cuando termines.

Tambien hay **Pegar CSV** para cargar datos ya cotejados, y **Agregar manual**
para una fila suelta.

## Reglas del cotejo

| Estado      | Cuando se marca |
|-------------|-----------------|
| ✗ Error     | Cedula vencida; sexo distinto entre planilla y documento; apellido distinto; documento escaneado que no figura en la planilla |
| ⚠ Aviso     | Documento extranjero con Tipo doc / N doc sin completar; diferencia de escritura en el apellido; capitalizacion irregular |
| ? N/D       | Figura en la planilla pero no se escaneo el documento |
| ✓ OK        | Todo coincide |

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
├── index.html                      frontend completo
├── vendor/                         PDF.js (local, sin CDN)
├── netlify.toml                    configuracion de Netlify
├── netlify/functions/analizar.js   function que llama a la API
└── README.md
```


## Probado

El flujo completo se probo en Chromium con los PDF reales del 05/10/2026
(3 hojas de cedulas + 1 de planilla): conversion de PDF a imagenes, envio por
pagina, cotejo, revision, importacion, filtros, busqueda y exportacion.
Resultado: 24 registros, 4 errores, 1 aviso, sin falsos positivos.
