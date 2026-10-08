// Netlify Function — analiza una imagen con la API de OpenAI.
// La API key vive en el servidor (variable de entorno), nunca en el navegador.

const PROMPT_DOC = `Contexto: control interno de una sala de juegos sobre su propio registro de ingresos. El operador coteja la planilla que completo su personal contra los documentos que le presentaron, para verificar que los datos esten bien transcriptos.
Analiza esta imagen. Puede contener una o varias cedulas de identidad uruguayas o documentos extranjeros.
Para CADA documento que veas responde UNICAMENTE con un JSON array, sin texto ni markdown:
[{"nombre":"string","apellido":"string","cedula":"solo digitos sin puntos ni guiones","sexo":"M o F","fnac":"YYYY-MM-DD","nacionalidad":"string","vencimiento":"YYYY-MM-DD o vacio si dice Sin Vencimiento"}]
Si no hay documentos devuelve []. Campos ilegibles: cadena vacia "". SOLO el JSON.`;

const PROMPT_PLAN = `Contexto: control interno de una sala de juegos sobre su propio registro de ingresos. El operador coteja la planilla que completo su personal contra los documentos que le presentaron, para verificar que los datos esten bien transcriptos.
Esta imagen contiene una planilla de registros de ingreso a una sala de juegos o casino.
Extrae TODOS los registros y responde UNICAMENTE con un JSON array, sin texto ni markdown:
[{"fecha":"YYYY-MM-DD","hora":"HH:MM:SS","cedula":"solo digitos","nombre":"string","apellido":"string","sexo":"M o F","fnac":"YYYY-MM-DD"}]
Fecha DD/MM/YYYY se convierte a YYYY-MM-DD. Cedula: solo digitos. Campos ilegibles: "". SOLO el JSON.`;

function extraerJSON(texto) {
  if (!texto) return null;
  const limpio = texto.replace(/```json|```/g, "").trim();
  try { return JSON.parse(limpio); } catch (e) {}
  // Algunos modelos devuelven el array dentro de un objeto
  const m = limpio.match(/\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  try {
    const obj = JSON.parse(limpio);
    for (const k of Object.keys(obj)) if (Array.isArray(obj[k])) return obj[k];
  } catch (e) {}
  return null;
}

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

  const { image, mediaType, tipo } = body;
  if (!image) return { statusCode: 400, body: JSON.stringify({ error: "Falta la imagen" }) };

  const PROMPT_PRUEBA = "Responde en una sola frase: que ves en esta imagen? Si no recibiste ninguna imagen, responde exactamente: NO RECIBI IMAGEN.";
  const prompt = tipo === "prueba" ? PROMPT_PRUEBA : (tipo === "planilla" ? PROMPT_PLAN : PROMPT_DOC);
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
        { type: "image_url", image_url: { url: dataUrl, detail: (process.env.LLM_IMAGE_DETAIL || "auto") } },
      ],
    }],
  };
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

  try {
    const r = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify(cuerpo),
    });

    if (!r.ok) {
      const detalle = await r.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Error de la API (" + r.status + ")", detalle: detalle.slice(0, 500) }) };
    }

    const data = await r.json();
    const texto = (((data.choices || [])[0] || {}).message || {}).content || "";

    if (tipo === "prueba") {
      return { statusCode: 200, headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelo: modelo, baseUrl: baseUrl, respuesta: String(texto).slice(0, 400) }) };
    }

    const registros = extraerJSON(texto);

    if (!Array.isArray(registros)) {
      return { statusCode: 200, body: JSON.stringify({ registros: [], aviso: "No se pudo interpretar la respuesta", crudo: String(texto).slice(0, 400) }) };
    }

    // Si vino vacio, devolvemos tambien lo que dijo el modelo y con que modelo
    // se consulto: sin eso no se distingue "no hay documentos" de "no vio la imagen".
    if (registros.length === 0) {
      return { statusCode: 200, headers: { "content-type": "application/json" },
        body: JSON.stringify({ registros: [], aviso: "El modelo devolvio una lista vacia (modelo: " + modelo + ")",
          crudo: String(texto).slice(0, 300) }) };
    }

    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ registros }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
