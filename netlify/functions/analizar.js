// Netlify Function — analiza una imagen con la API de OpenAI.
// La API key vive en el servidor (variable de entorno), nunca en el navegador.

const Extraccion = require('../../extraccion.js');

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Metodo no permitido" }) };
  }

  // Sirve para cualquier proveedor compatible con la API de OpenAI:
  // OpenAI, OpenRouter, Groq, Together. Solo cambian LLM_BASE_URL y LLM_MODEL.
  const apiKey = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta la clave: configura LLM_API_KEY (o OPENAI_API_KEY / OPENROUTER_API_KEY) en las variables de entorno de Netlify." }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Body invalido" }) }; }

  if (!body || typeof body !== "object" || Array.isArray(body)) return {statusCode:400,body:JSON.stringify({error:"Body inválido"})};
  if ((event.body || "").length > 4500000) return {statusCode:413,body:JSON.stringify({error:"Dividir la imagen: solicitud demasiado grande."})};
  const { image, mediaType, tipo, contexto, descripcion } = body;
  if (contexto && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(contexto)) return {statusCode:400,body:JSON.stringify({error:"Imagen de contexto inválida"})};
  if (!["documento", "planilla", "prueba"].includes(tipo)) return { statusCode: 400, body: JSON.stringify({ error: "Tipo inválido" }) };
  if (typeof image !== "string" || image.length > 4000000 || (contexto && (typeof contexto !== "string" || contexto.length > 1000000))) return { statusCode: 400, body: JSON.stringify({ error: "Imagen demasiado grande o inválida" }) };
  if (mediaType && !["image/jpeg", "image/png", "image/webp"].includes(mediaType)) return { statusCode: 400, body: JSON.stringify({error:"Formato de imagen inválido"}) };
  if (!image) return { statusCode: 400, body: JSON.stringify({ error: "Falta la imagen" }) };

  const PROMPT_PRUEBA = "Responde en una sola frase: que ves en esta imagen? Si no recibiste ninguna imagen, responde exactamente: NO RECIBI IMAGEN.";
  const prompt = tipo === "prueba" ? PROMPT_PRUEBA : (Extraccion.prompts[tipo] + "\n" + String(descripcion || "").slice(0, 600));
  const modelo = process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-6.1-sol";
  const baseUrl = (process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const esOpenAI = baseUrl.indexOf("api.openai.com") !== -1;
  const dataUrl = "data:" + (mediaType || "image/jpeg") + ";base64," + image;

  // OpenAI usa max_completion_tokens; el resto de los proveedores, max_tokens.
  const cuerpo = {
    model: modelo,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl, detail: (process.env.LLM_IMAGE_DETAIL || "high") } },
      ],
    }],
  };
  if (contexto) cuerpo.messages[0].content.push({type:"image_url",image_url:{url:contexto,detail:"low"}});
  cuerpo.store = false;
  // En los modelos que razonan (familia GPT-5) este tope incluye el razonamiento:
  // si queda corto, el modelo lo gasta pensando y devuelve texto vacio.
  if (esOpenAI) cuerpo.max_completion_tokens = 16000;
  else cuerpo.max_tokens = 4000;

  const cabeceras = {
    "content-type": "application/json",
    "authorization": "Bearer " + apiKey,
  };
  // OpenRouter pide estas dos para atribuir el trafico
  if (baseUrl.indexOf("openrouter") !== -1) {
    cabeceras["HTTP-Referer"] = process.env.APP_URL || "https://promo-cotejo.netlify.app";
    cabeceras["X-Title"] = "Cotejo de Documentos";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const r = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: cabeceras,
      body: JSON.stringify(cuerpo),
    });

    if (!r.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "El proveedor no pudo leer la imagen (HTTP " + r.status + "). No se confirmó la lectura." }) };
    }

    const data = await r.json();
    const texto = (((data.choices || [])[0] || {}).message || {}).content || "";

    if (tipo === "prueba") {
      return { statusCode: 200, headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelo: modelo, baseUrl: baseUrl, respuesta: String(texto).slice(0, 400) }) };
    }

    const choice = (data.choices || [])[0];
    if (!choice || choice.finish_reason !== "stop" || choice.message?.refusal) {
      return { statusCode: 502, body: JSON.stringify({error:"La lectura fue rechazada o truncada; revisar esta parte."}) };
    }
    let resultado;
    try { resultado = Extraccion.parsear(texto); }
    catch (e) { return {statusCode:502,body:JSON.stringify({error:e.message})}; }
    return {statusCode:200,headers:{"content-type":"application/json"},body:JSON.stringify(resultado)};

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.name === "AbortError" ? "Se agotó el tiempo de lectura; esta parte quedó sin verificar." : "No se pudo completar la lectura con el proveedor." }) };
  } finally { clearTimeout(timer); }
};
