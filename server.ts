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
  // Use active, valid models: 2.5-flash, 3.7-flash, and 3.5-flash-lite
  const models = ["gemini-2.5-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];
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
