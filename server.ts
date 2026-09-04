import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

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
    const { content, currentTitle, type = "Sermón", tone = "ministerial" } = req.body || {};

    if (!content || typeof content !== "string" || content.trim().length < 5) {
      return res.status(400).json({
        error: "Se requiere contenido del proyecto para analizar y generar sugerencias de títulos.",
      });
    }

    const ai = getGeminiClient();

    // Clean HTML tags from content if present
    const plainText = content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000); // Send up to 12k chars for rich context

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

    res.json({
      success: true,
      suggestions: parsedData.suggestions || [],
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

// Endpoint for Audio Transcription using gemini-3.5-transcribe
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audio, mimeType = "audio/webm", prompt } = req.body || {};

    if (!audio || typeof audio !== "string") {
      return res.status(400).json({
        error: "Se requiere el archivo o grabación de audio para transcribir.",
      });
    }

    const ai = getGeminiClient();

    // Extract base64 and clean MIME type if standard data URL is passed
    let base64Audio = audio;
    let detectedMime = mimeType;

    if (audio.includes(",")) {
      const parts = audio.split(",");
      base64Audio = parts[1];
      const match = parts[0].match(/data:([^;]+);base64/);
      if (match && match[1]) {
        detectedMime = match[1];
      }
    }

    // Clean common audio mime types (strip codecs param for standard mime checking if needed)
    if (detectedMime.includes(";")) {
      detectedMime = detectedMime.split(";")[0].trim();
    }

    const defaultPrompt =
      prompt ||
      "Transcribe el siguiente audio con total fidelidad en español. Conserva con precisión la puntuación, signos de interrogación/admiración, nombres propios, citas y referencias bíblicas, términos teológicos y párrafos ordenados.";

    const audioPart = {
      inlineData: {
        mimeType: detectedMime || "audio/webm",
        data: base64Audio,
      },
    };

    const textPart = {
      text: defaultPrompt,
    };

    // Use gemini-3.5-transcribe as strictly specified
    const response = await ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: {
        parts: [audioPart, textPart],
      },
    });

    const transcriptionText = response.text || "";

    if (!transcriptionText.trim()) {
      return res.status(200).json({
        success: true,
        text: "",
        warning: "No se detectó voz clara o palabras en la grabación.",
      });
    }

    res.json({
      success: true,
      text: transcriptionText.trim(),
      model: "gemini-3.5-transcribe",
    });
  } catch (error: any) {
    console.error("Error transcribing audio with gemini-3.5-transcribe:", error);
    const rawError = error?.message || "";
    let errorMessage = "Error al transcribir el audio con el modelo gemini-3.5-transcribe.";

    if (rawError.includes("GEMINI_API_KEY")) {
      errorMessage = "Clave de API de Gemini no configurada en el servidor. Por favor verifica los secretos en Settings.";
    } else if (rawError.includes("503") || rawError.includes("high demand") || rawError.includes("UNAVAILABLE")) {
      errorMessage = "El servicio de transcripción de IA está experimentando alta demanda. Por favor intenta de nuevo en unos momentos.";
    } else if (rawError.includes("429") || rawError.includes("RESOURCE_EXHAUSTED")) {
      errorMessage = "Límite de cuota alcanzado. Espera unos segundos y vuelve a intentar.";
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
