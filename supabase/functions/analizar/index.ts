// Supabase Edge Function — analiza una imagen con un proveedor compatible con
// la API de OpenAI. La clave del proveedor vive en el servidor (secreto del
// proyecto), nunca en el navegador: el operador de la sala no maneja ninguna.
//
// Vive aca y no en Netlify por dos motivos. El plan gratuito de Netlify cobra
// credito por cada despliegue a produccion, asi que iterar sale caro. Y daba
// diez segundos para responder, que no alcanzan para una planilla entera; aca
// el limite son 150. El tope de 2 s de CPU no molesta porque esperar al
// proveedor es I/O, no CPU.
//
// La funcion exige una clave compartida (secreto COTEJO_CLAVE) en la cabecera
// x-cotejo-clave. Sin eso, cualquiera con la URL gastaria el saldo del
// proveedor: la pagina es publica y la funcion tambien. El operador la pega
// una vez por maquina en Ajustes, no en cada corrida.

import './extraccion.js';
// deno-lint-ignore no-explicit-any
const Extraccion = (globalThis as any).Extraccion;

const PROMPT_PRUEBA = 'Responde en una sola frase: que ves en esta imagen? Si no recibiste ninguna imagen, responde exactamente: NO RECIBI IMAGEN.';

function cors(): Record<string, string> {
  return {
    'access-control-allow-origin': Deno.env.get('COTEJO_ORIGEN') || '*',
    'access-control-allow-headers': 'content-type, x-cotejo-clave',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
  };
}

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors(), 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json(405, { error: 'Metodo no permitido' });

  // La clave compartida no es opcional: una funcion abierta con la clave del
  // proveedor adentro es plata de cualquiera que encuentre la URL.
  const esperada = Deno.env.get('COTEJO_CLAVE');
  if (!esperada) {
    return json(503, { error: 'Falta configurar COTEJO_CLAVE en los secretos del proyecto de Supabase. Sin esa clave la funcion no atiende a nadie.' });
  }
  if (req.headers.get('x-cotejo-clave') !== esperada) {
    return json(401, { error: 'Falta la clave de acceso de esta sala o no coincide.', falta_clave: true });
  }

  const apiKey = Deno.env.get('LLM_API_KEY') || Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json(500, { error: 'Falta la clave del proveedor: configura LLM_API_KEY (o OPENAI_API_KEY / OPENROUTER_API_KEY) en los secretos del proyecto de Supabase.' });
  }

  const crudo = await req.text();
  if (crudo.length > 4500000) return json(413, { error: 'Dividir la imagen: solicitud demasiado grande.' });
  let body: Record<string, unknown>;
  try { body = JSON.parse(crudo || '{}'); }
  catch { return json(400, { error: 'Body invalido' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'Body invalido' });

  const { image, mediaType, tipo, contexto, descripcion } = body as {
    image?: unknown; mediaType?: unknown; tipo?: unknown; contexto?: unknown; descripcion?: unknown;
  };
  if (contexto && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(contexto))) return json(400, { error: 'Imagen de contexto invalida' });
  if (!['documento', 'planilla', 'prueba'].includes(String(tipo))) return json(400, { error: 'Tipo invalido' });
  if (typeof image !== 'string' || image.length > 4000000 || (contexto && (typeof contexto !== 'string' || contexto.length > 1000000))) return json(400, { error: 'Imagen demasiado grande o invalida' });
  if (mediaType && !['image/jpeg', 'image/png', 'image/webp'].includes(String(mediaType))) return json(400, { error: 'Formato de imagen invalido' });
  if (!image) return json(400, { error: 'Falta la imagen' });

  const prompt = tipo === 'prueba' ? PROMPT_PRUEBA : (Extraccion.prompts[String(tipo)] + '\n' + String(descripcion || '').slice(0, 600));
  const modelo = Deno.env.get('LLM_MODEL') || Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini';
  const baseUrl = (Deno.env.get('LLM_BASE_URL') || Deno.env.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const esOpenAI = baseUrl.indexOf('api.openai.com') !== -1;
  const dataUrl = 'data:' + (mediaType || 'image/jpeg') + ';base64,' + image;

  const contenido: unknown[] = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: dataUrl, detail: Deno.env.get('LLM_IMAGE_DETAIL') || 'high' } },
  ];
  if (contexto) contenido.push({ type: 'image_url', image_url: { url: contexto, detail: 'low' } });

  // deno-lint-ignore no-explicit-any
  const cuerpo: Record<string, any> = { model: modelo, messages: [{ role: 'user', content: contenido }], store: false };
  // OpenAI usa max_completion_tokens; el resto de los proveedores, max_tokens.
  // En los modelos que razonan (familia GPT-5) ese tope incluye el razonamiento:
  // si queda corto, el modelo lo gasta pensando y devuelve texto vacio.
  if (esOpenAI) cuerpo.max_completion_tokens = 16000;
  else cuerpo.max_tokens = 4000;

  const cabeceras: Record<string, string> = { 'content-type': 'application/json', 'authorization': 'Bearer ' + apiKey };
  if (baseUrl.indexOf('openrouter') !== -1) {
    cabeceras['HTTP-Referer'] = Deno.env.get('APP_URL') || 'https://github.com/matideleon/cotejo-documentos';
    cabeceras['X-Title'] = 'Cotejo de Documentos';
  }

  // Supabase corta a los 150 s; cortar antes deja decir por que en vez de que
  // el gateway devuelva un 504 que no explica nada.
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 120000);
  try {
    const r = await fetch(baseUrl + '/chat/completions', {
      method: 'POST', signal: control.signal, headers: cabeceras, body: JSON.stringify(cuerpo),
    });
    if (!r.ok) return json(502, { error: 'El proveedor no pudo leer la imagen (HTTP ' + r.status + '). No se confirmo la lectura.' });

    const data = await r.json();
    const texto = data?.choices?.[0]?.message?.content || '';

    if (tipo === 'prueba') {
      return json(200, { modelo, baseUrl, respuesta: String(texto).slice(0, 400) });
    }

    const choice = data?.choices?.[0];
    if (!choice || choice.finish_reason !== 'stop' || choice.message?.refusal) {
      return json(502, { error: 'La lectura fue rechazada o truncada; revisar esta parte.' });
    }
    try { return json(200, Extraccion.parsear(texto)); }
    catch (e) { return json(502, { error: (e as Error).message }); }
  } catch (err) {
    return json(500, {
      error: (err as Error).name === 'AbortError'
        ? 'Se agoto el tiempo de lectura; esta parte quedo sin verificar.'
        : 'No se pudo completar la lectura con el proveedor.',
    });
  } finally {
    clearTimeout(reloj);
  }
});
