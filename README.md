# Cotejo de Documentos

Verifica que un conjunto de cédulas escaneadas se corresponda con una planilla
de nombres y documentos, y marca las incoherencias: número que no coincide,
nombre que no coincide, documentos que faltan, escaneos de más y duplicados.

**Todo el procesamiento ocurre en el navegador.** Las imágenes y los datos de
las personas nunca se suben a ningún servidor.

## Qué hace

- Lee la planilla desde Excel, CSV o PDF, incluido un PDF escaneado: detecta la
  tabla, la endereza si está acostada y la lee celda por celda.
- Separa las cédulas que vienen varias por hoja, endereza cada una y la lee.
- Entiende la cédula con dígito verificador (`1.222.333-0`) aunque el OCR se
  coma el guion, y usa el verificador para corregir dígitos mal leídos.
- Cruza por nombre, apellido y número, con tolerancia a los errores típicos del
  OCR.

## Cómo se usa

Abrí `index.html` en el navegador: con doble clic sobre el archivo, o desde la
versión publicada. La primera vez descarga el motor de OCR (unos 11 MB) y queda
en caché.
