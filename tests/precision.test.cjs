const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../cotejo-core.js'),extra=require('../extraccion.js');
const doc={cedula:'12345672',nombre:'ANA MARIA',apellido:'PEREZ GOMEZ',sexo:'F',fnac:'1980-04-05',vencimiento:'2030-01-01',pais_documento:'Uruguay'};
const plan={cedula:doc.cedula,nombre:'Ana',apellido:'Pérez',sexo:'F',fnac:doc.fnac,fecha:'2026-10-04',hora:'12:00:00'};
function run(d={},p={},options={}){return core.comparar([{...doc,...d}],[{...plan,...p}],options)[0];}
test('coincidencia con nombres abreviados por palabras completas',()=>assert.equal(run().estado,'ok'));
test('un nombre diferente nunca queda OK',()=>assert.equal(run({}, {nombre:'Lucía'}).estado,'error'));
test('prefijos parciales no acreditan apellidos',()=>assert.equal(core.compatibles('Pere','Perez Gomez'),false));
test('apellido vacío no acredita coincidencia',()=>assert.equal(run({apellido:''}).estado,'warn'));
test('nacimiento se coteja sin copiar fecha de ingreso',()=>assert.equal(run({}, {fnac:'1980-10-04'}).estado,'error'));
test('fecha imposible no se compara como válida',()=>assert.equal(core.fecha('2026-02-31'),''));
// La sala no coteja el sexo: no se reporta que falte, pero una diferencia si,
// porque no habla del sexo sino de que el documento podria no ser de esa persona.
test('un sexo que el documento no trae no se reporta',()=>{const r=run({sexo:''});assert.equal(r.estado,'ok');assert.doesNotMatch(r.obs,/[Ss]exo/);});
test('un sexo diferente sigue siendo error',()=>assert.equal(run({},{sexo:'M'}).estado,'error'));
// La vigencia tampoco se coteja: ni vencido ni sin leer dicen nada.
test('un documento vencido ya no se reporta',()=>{const r=run({vencimiento:'2020-01-01'});assert.equal(r.estado,'ok');assert.doesNotMatch(r.obs,/VENCID/i);});
test('un vencimiento que no se leyo ya no se reporta',()=>{const r=run({vencimiento:''});assert.equal(r.estado,'ok');assert.doesNotMatch(r.obs,/[Vv]encimiento/);});
// El nacimiento si se sigue cotejando.
test('un nacimiento que no se leyo sigue bajando la fila',()=>assert.equal(run({fnac:''}).estado,'warn'));
test('residente extranjero con CI uruguaya no cambia tipo por nacionalidad',()=>assert.equal(run({nacionalidad:'COLOMBIANA'}).estado,'ok'));
test('dos documentos con mismo número son ambiguos',()=>assert.match(core.comparar([doc,{...doc,nombre:'OTRA'}],[plan])[0].obs,/Varios documentos/));
test('visitas repetidas incluso idénticas se conservan',()=>assert.equal(core.comparar([doc],[plan,{...plan}]).length,2));
test('documento sin número no desaparece',()=>assert.equal(core.comparar([{...doc,cedula:''}],[]).length,1));
test('el carné uruguayo no se toma por extranjero',()=>{const r=run({pais_documento:'REPÚBLICA ORIENTAL DEL URUGUAY'});assert.equal(r.estado,'ok');assert.doesNotMatch(r.obs,/emitido en/);});
test('un documento extranjero sí se marca',()=>assert.match(run({pais_documento:'REPÚBLICA ARGENTINA'}).obs,/emitido en/));
test('el dígito verificador se controla en el carné uruguayo',()=>assert.match(run({pais_documento:'REPÚBLICA ORIENTAL DEL URUGUAY',cedula:'12345673'},{cedula:'12345673'}).obs,/dígito verificador/));
test('una parte sin confirmar solo ensucia su propio registro',()=>{
  const sucio={...doc,cedula:'23456784',_incompleto:true}, limpio=doc;
  const pSucio={...plan,cedula:'23456784'}, filas=core.comparar([limpio,sucio],[plan,pSucio],{completa:false});
  assert.equal(filas.find(f=>f.cedula===core.numero(doc.cedula)).estado,'ok');
  assert.match(filas.find(f=>f.cedula==='23456784').obs,/Lectura incompleta en este registro/);
});
test('lectura parcial no afirma ausencia de planilla',()=>assert.equal(core.comparar([doc],[],{completa:false})[0].estado,'warn'));
test('lectura parcial no afirma ausencia de documento',()=>assert.match(core.comparar([],[plan],{completa:false})[0].obs,/no se puede confirmar si se presentó/));
test('número distinto con nombre compatible pide revisar',()=>assert.match(run({cedula:'23456789'}).obs,/número distinto/));
// Caso real de produccion: la planilla se leyo "47626493'" y el documento
// "4.762.649-3", y la misma persona salio en dos filas.
test('una comilla del escaneo no parte a la persona en dos',()=>{
  assert.equal(core.numero("47626493'"),core.numero('4.762.649-3'));
  const d={...doc,cedula:'4.762.649-3'}, p={...plan,cedula:"47626493'"};
  const filas=core.comparar([d],[p]);
  assert.equal(filas.length,1,'quedo una fila de mas: '+JSON.stringify(filas.map(f=>f.obs)));
  assert.doesNotMatch(filas[0].obs,/n\u00famero distinto|sin n\u00famero coincidente/);
});
test('la puntuacion que deja el escaneo no cambia el numero',()=>{
  ['4.762.649-3','4 762 649 3',"47626493'",'47626493\u00b4','4/762/649/3','4_762_649_3'].forEach(function(x){
    assert.equal(core.numero(x),'47626493',x);
  });
});
test('preserva letras y ceros, sin confundir O y 0',()=>{assert.equal(core.numero('AB 001.234-5'),'AB0012345');assert.notEqual(core.numero('O123'),core.numero('0123'));});
test('JSON truncado no se convierte en []',()=>assert.throws(()=>extra.parsear('[{"cedula":"123')));
test('objeto válido se valida sin perder campos',()=>assert.equal(extra.validar({registros:[doc],lectura_completa:true,advertencias:[]}).lectura_completa,true));
test('array legado requiere revisión',()=>assert.equal(extra.validar([doc]).lectura_completa,false));
test('cédula numérica del modelo se rechaza para evitar pérdida de ceros',()=>assert.throws(()=>extra.validar({registros:[{...doc,cedula:12345672}],lectura_completa:true,advertencias:[]})));
test('registros ilegibles se conservan y dejan lectura parcial',()=>{const r=extra.validar({registros:[{}],lectura_completa:true,advertencias:[]});assert.equal(r.registros.length,1);assert.equal(r.lectura_completa,false);});
test('no valida una advertencia como lectura completa',()=>assert.equal(extra.validar({registros:[doc],lectura_completa:true,advertencias:['fila ilegible']}).lectura_completa,false));
