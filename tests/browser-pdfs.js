// Local-only real PDF regression. The caller supplies COTEJO_TEST_PDFS as
// [{url,tipo,partes:[...],celdas:number}]. Never commit the input PDF files.
// Run with gstack browse eval on a locally served interface.
return (async()=>{
 if(!Array.isArray(window.COTEJO_TEST_PDFS))throw new Error('Configurar COTEJO_TEST_PDFS con URLs locales de fixtures.');
 const resultados=[];
 for(const fixture of COTEJO_TEST_PDFS){
  const response=await fetch(fixture.url);if(!response.ok)throw new Error('No se pudo abrir el fixture');
  const file=new File([await response.arrayBuffer()],'fixture.pdf',{type:'application/pdf'});
  const paginas=await pdfAImagenes(file,3600);
  if(paginas.length!==fixture.partes.length)throw new Error('Número de páginas incorrecto');
  let celdas=0;
  for(let i=0;i<paginas.length;i++){
   const prep=await LecturaImagenes.preparar(paginas[i],fixture.tipo);
   if(prep.partes.length!==fixture.partes[i]||prep.avisos.length)throw new Error('Separación inesperada en página '+(i+1));
   celdas+=prep.partes.reduce((a,p)=>a+(p.celdas||0),0);
  }
  if(fixture.celdas!==undefined&&celdas!==fixture.celdas)throw new Error('Cobertura de cuadrícula incorrecta');
  resultados.push({tipo:fixture.tipo,paginas:paginas.length,partes:fixture.partes,celdas});
 }
 return resultados;
})()
