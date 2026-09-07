import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { titleSuggestionsCache } from "./server/aiCache";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Helper to get Gemini client
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
    cache: titleSuggestionsCache.getStats(),
  });
});

// Endpoint para inspección y estadísticas de la caché de IA
app.get("/api/ai/cache-stats", (_req, res) => {
  res.json({
    status: "ok",
    stats: titleSuggestionsCache.getStats(),
  });
});

// Endpoint para purgar la caché de IA manualmente
app.post("/api/ai/cache-clear", (_req, res) => {
  titleSuggestionsCache.clear();
  res.json({
    status: "ok",
    message: "Caché de IA limpiada exitosamente.",
    stats: titleSuggestionsCache.getStats(),
  });
});

// Helper to generate content with fallback models and retry on 503/429/temporary errors
async function generateContentWithFallback(ai: GoogleGenAI, config: any, prompt: string) {
  // Use active, valid models: 3.8-flash, 3.7-flash, and 3.5-flash-lite
  const models = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          // Wait briefly before retry
          await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        }
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || "";
        console.warn(`Attempt ${attempt + 1} with model ${model} failed:`, errMsg);
        
        // If it's a 404/not found, immediately try next model
        if (errMsg.includes("404") || errMsg.includes("NOT_FOUND") || errMsg.includes("no longer available")) {
          break;
        }
        
        // If it's not a temporary error (503/429/high demand), try next model
        if (!errMsg.includes("503") && !errMsg.includes("429") && !errMsg.includes("high demand") && !errMsg.includes("UNAVAILABLE") && !errMsg.includes("RESOURCE_EXHAUSTED")) {
          break;
        }
      }
    }
  }

  throw lastError;
}

// Endpoint to generate project title suggestions
app.post("/api/titles/suggest", async (req, res) => {
  try {
    const {
      content,
      currentTitle,
      type = "Sermón",
      tone = "ministerial",
      forceRefresh = false,
    } = req.body || {};

    if (!content || typeof content !== "string" || content.trim().length < 5) {
      return res.status(400).json({
        error: "Se requiere contenido del proyecto para analizar y generar sugerencias de títulos.",
      });
    }

    // Clean HTML tags from content if present
    const plainText = content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000); // Send up to 12k chars for rich context

    // Generar clave única de caché basada en el contenido analizado y sus parámetros
    const cacheKey = titleSuggestionsCache.generateKey({
      text: plainText,
      currentTitle: (currentTitle || "").trim(),
      type: type.trim(),
      tone: tone.trim(),
    });

    // 1. Verificación de Caché (Respuesta instantánea <5ms sin consumo de tokens)
    if (!forceRefresh) {
      const cached = titleSuggestionsCache.get(cacheKey);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        return res.json({
          success: true,
          cached: true,
          cachedAt: new Date(cached.createdAt).toISOString(),
          cacheHits: cached.hits,
          suggestions: cached.data.suggestions || [],
        });
      }
    }

    res.setHeader("X-Cache", "MISS");

    const ai = getGeminiClient();

    const prompt = `Analiza el siguiente texto de un sermón o estudio ministerial cristiano ("${type}") y genera entre 4 y 6 sugerencias de títulos impactantes, elocuentes, de profunda edificación espiritual y teológicamente sólidos.

Información contextual:
- Título actual del proyecto: "${currentTitle || "Sin título definido"}"
- Tipo de documento: "${type}"
- Enfoque / Tono deseado: "${tone}"

Contenido del documento:
"""
${plainText}
"""

Instrucciones para los títulos:
1. Deben capturar la esencia, propósito y mensaje central del texto.
2. Cada título debe tener variedad de estilos: por ejemplo, uno Apostólico/Profético, uno Expositivo/Bíblico, uno Práctico/Transformacional, uno Inspirador/Alentador, y uno Temático Breve.
3. Proporciona un subtítulo o lema breve que le dé fuerza ministerial.
4. Si el contenido alude a temas bíblicos o versículos, incluye una cita bíblica recomendada que respalde el título.
5. Proporciona una breve razón (1 o 2 oraciones) explicando por qué este título es ideal para este mensaje.`;

    const geminiConfig = {
      systemInstruction:
        "Eres un teólogo y editor ministerial senior del Ministerio Apostólico LemGil. Te especializas en la redacción, pulido y titulación de sermones, libros y enseñanzas cristianas con excelencia literaria y espiritual.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "El título principal sugerido",
                },
                subtitle: {
                  type: Type.STRING,
                  description: "Un subtítulo o lema complementario",
                },
                category: {
                  type: Type.STRING,
                  description:
                    "Categoría de estilo: Apostólico, Expositivo, Profético, Inspirador, Doctrinal o Práctico",
                },
                bibleVerseSuggestion: {
                  type: Type.STRING,
                  description:
                    "Pasaje o cita bíblica recomendada que encaja con el título",
                },
                reason: {
                  type: Type.STRING,
                  description: "Razón por la que este título resume el contenido",
                },
              },
              required: ["title", "category", "reason"],
            },
          },
        },
        required: ["suggestions"],
      },
    };

    const response = await generateContentWithFallback(ai, geminiConfig, prompt);

    const responseText = response.text || "{}";
    const parsedData = JSON.parse(responseText);
    const suggestions = parsedData.suggestions || [];

    // Guardar en la caché de alta velocidad (TTL 30 minutos)
    if (suggestions.length > 0) {
      titleSuggestionsCache.set(
        cacheKey,
        { suggestions },
        30 * 60 * 1000,
        currentTitle || plainText.slice(0, 60)
      );
    }

    res.json({
      success: true,
      cached: false,
      suggestions,
    });
  } catch (error: any) {
    console.error("Error generating title suggestions:", error);
    const rawError = error?.message || "";
    let errorMessage = "Error al procesar la solicitud de títulos con la IA.";

    if (rawError.includes("GEMINI_API_KEY")) {
      errorMessage = "Clave de API de Gemini no configurada en el servidor. Por favor verifica los secretos en Settings.";
    } else if (rawError.includes("503") || rawError.includes("high demand") || rawError.includes("UNAVAILABLE")) {
      errorMessage = "El servicio de IA está experimentando alta demanda momentánea. Por favor presiona 'Reintentar Análisis' en unos segundos.";
    } else if (rawError.includes("429") || rawError.includes("RESOURCE_EXHAUSTED")) {
      errorMessage = "Límite de solicitudes alcanzado. Por favor espera un momento y vuelve a intentar.";
    } else if (rawError) {
      errorMessage = rawError;
    }

    res.status(500).json({
      error: errorMessage,
    });
  }
});

// Endpoint para transcripción de audio con Gemini (soporta Dictado y Sermón Extendido)
app.post("/api/audio/transcribe", async (req, res) => {
  try {
    const { audio, mimeType = "audio/webm", mode = "dictado", promptHint } = req.body || {};

    if (!audio || typeof audio !== "string") {
      return res.status(400).json({
        error: "Se requiere el contenido de audio codificado en Base64.",
      });
    }

    // Limpiar prefijo data URL si viene presente
    const base64Data = audio.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, "").trim();

    if (!base64Data) {
      return res.status(400).json({
        error: "El archivo de audio está vacío o corrupto.",
      });
    }

    // Si el audio es insignificante o silencioso (< 300 caracteres base64), responder vacío de inmediato
    if (base64Data.length < 300) {
      return res.json({
        success: true,
        text: "",
        mode,
      });
    }

    const ai = getGeminiClient();

    // Instrucción para el transcriptor ministerial
    const systemInstruction =
      "Eres un transcriptor ministerial y teológico de excelencia para el Ministerio Apostólico LemGil. Tu labor es transcribir con máxima exactitud y fidelidad las palabras grabadas en español.";

    let prompt =
      mode === "extendido"
        ? `Transcribe con máxima fidelidad este sermón, prédica o estudio bíblico grabado en audio.
Instrucciones obligatorias:
1. Transcribe exactamente lo hablado en español con ortografía impecable y puntuación natural.
2. Agrupa el texto en párrafos fluidos y legibles acordes a las pausas y temas del orador.
3. Si el orador menciona versículos o pasajes bíblicos (por ejemplo "San Juan capítulo tres versículo dieciséis"), escríbelos en su formato estándar (ejemplo: "Juan 3:16").
4. Respeta las mayúsculas de reverencia cuando se refiera a Dios, Jesús, Cristo, Espíritu Santo, Padre Celestial.
5. Devuelve ÚNICAMENTE el texto transcrito directo, sin saludos iniciales, sin etiquetas [Música], sin comentarios explicativos ni formato markdown redundante.`
        : `Transcribe con máxima fidelidad este dictado de voz ministerial.
Instrucciones obligatorias:
1. Transcribe exactamente las palabras dichas en español con puntuación natural.
2. Si se mencionan citas o libros bíblicos, escríbelos en formato estándar (ej: "Romanos 8:28").
3. Devuelve ÚNICAMENTE las palabras transcritas, sin preámbulos, sin comillas envolventes ni notas adicionales.`;

    if (promptHint && typeof promptHint === "string" && promptHint.trim().length > 0) {
      prompt += `\nContexto o tema del mensaje: "${promptHint.slice(0, 300)}"`;
    }

    // Normalizar MIME type eliminando parámetros de codecs
    const cleanMimeType = (mimeType || "audio/webm").split(";")[0].trim();

    const audioPart = {
      inlineData: {
        mimeType: cleanMimeType,
        data: base64Data,
      },
    };

    // Modelos para transcripción de audio
    const transcribeModels = ["gemini-3.5-transcribe", "gemini-3.8-flash", "gemini-3.7-flash"];
    let transcriptionText = "";
    let lastError: any = null;

    for (const model of transcribeModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, 800));
          }

          const response = await ai.models.generateContent({
            model,
            contents: [audioPart, prompt],
            config: {
              systemInstruction,
            },
          });

          // Extraer texto
          if (response.text && response.text.trim().length > 0) {
            transcriptionText = response.text.trim();
          } else if (response.candidates?.[0]?.content?.parts) {
            const partsText = response.candidates[0].content.parts
              .map((p: any) => p.text || "")
              .join("")
              .trim();
            transcriptionText = partsText;
          }
          // Si la respuesta fue exitosa sin lanzar error, terminar el ciclo
          break;
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || "";
          console.warn(`Attempt ${attempt + 1} transcription with ${model} failed:`, errMsg);
          if (errMsg.includes("404") || errMsg.includes("NOT_FOUND")) {
            break;
          }
        }
      }

      if (lastError === null || transcriptionText.length > 0) {
        break;
      }
    }

    if (!transcriptionText && lastError) {
      throw lastError;
    }

    res.json({
      success: true,
      text: transcriptionText,
      mode,
    });
  } catch (error: any) {
    console.error("Error al transcribir audio:", error);
    const rawError = error?.message || "";
    let userMsg = "Error al procesar la transcripción del audio.";
    if (rawError.includes("GEMINI_API_KEY")) {
      userMsg = "Clave de Gemini API no configurada en el servidor.";
    } else if (rawError.includes("429") || rawError.includes("RESOURCE_EXHAUSTED")) {
      userMsg = "Servicio de transcripción ocupado momentáneamente. Intenta nuevamente.";
    } else if (rawError) {
      userMsg = rawError;
    }

    res.status(500).json({
      error: userMsg,
    });
  }
});

// Vite & Static server configuration
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LemWriter server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
