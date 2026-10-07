// Netlify Function — analiza una imagen con la API de Anthropic.
// La API key vive en el servidor (variable de entorno), nunca en el navegador.

const PROMPT_DOC = `Analiza esta imagen. Puede contener una o varias cedulas de identidad uruguayas o documentos extranjeros.
Para CADA documento que veas responde UNICAMENTE con un JSON array, sin texto ni markdown:
[{"nombre":"string","apellido":"string","cedula":"solo digitos sin puntos ni guiones","sexo":"M o F","fnac":"YYYY-MM-DD","nacionalidad":"string","vencimiento":"YYYY-MM-DD o vacio si dice Sin Vencimiento"}]
Si no hay documentos devuelve []. Campos ilegibles: cadena vacia "". SOLO el JSON.`;

const PROMPT_PLAN = `Esta imagen contiene una planilla de registros de ingreso a una sala de juegos o casino.
Extrae TODOS los registros y responde UNICAMENTE con un JSON array, sin texto ni markdown:
[{"fecha":"YYYY-MM-DD","hora":"HH:MM:SS","cedula":"solo digitos","nombre":"string","apellido":"string","sexo":"M o F","fnac":"YYYY-MM-DD"}]
Fecha DD/MM/YYYY se convierte a YYYY-MM-DD. Cedula: solo digitos. Campos ilegibles: "". SOLO el JSON.`;

function extraerJSON(texto) {
  if (!texto) return null;
  const limpio = texto.replace(/```json|```/g, "").trim();
  try { return JSON.parse(limpio); } catch (e) {}
  const m = limpio.match(/\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Metodo no permitido" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Netlify." }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: "Body invalido" }) }; }

  const { image, mediaType, tipo } = body;
  if (!image) return { statusCode: 400, body: JSON.stringify({ error: "Falta la imagen" }) };

  const prompt = tipo === "planilla" ? PROMPT_PLAN : PROMPT_DOC;
  const modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!r.ok) {
      const detalle = await r.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Error de la API (" + r.status + ")", detalle: detalle.slice(0, 500) }) };
    }

    const data = await r.json();
    const texto = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const registros = extraerJSON(texto);

    if (!Array.isArray(registros)) {
      return { statusCode: 200, body: JSON.stringify({ registros: [], aviso: "No se pudo interpretar la respuesta", crudo: texto.slice(0, 400) }) };
    }

    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ registros }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
