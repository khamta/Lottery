/**
 * ตัวเรียก Ollama Cloud แบบบาง ๆ (ไม่ใช้ SDK) — ใช้ /api/chat ของ Ollama เอง (/v1 แบบ OpenAI ส่งรูปไม่ได้ทุกรุ่น)
 *   POST {OLLAMA_HOST}/api/chat  Authorization: Bearer OLLAMA_API_KEY
 *   รูปส่งเป็น base64 ใน messages[].images
 * ความผิดพลาดทุกแบบ (HTTP ไม่สำเร็จ / ต่อเครือข่ายไม่ได้) เป็น OllamaError — status ว่าง = ต่อไม่ได้
 */

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

export type OllamaChatRequest = {
  model: string;
  messages: OllamaMessage[];
  stream: false;
  options?: { temperature?: number; num_predict?: number };
};

export type OllamaChatResponse = {
  model: string;
  message: { role: string; content: string };
  /** "stop" = ตอบจบ · "length" = ยาวเกิน num_predict */
  done_reason?: string;
};

export type OllamaClient = { chat(request: OllamaChatRequest): Promise<OllamaChatResponse> };

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

export const OLLAMA_HOST = "https://ollama.com";
/** ใบใหญ่ + รุ่นที่คิดนานอาจใช้หลายนาที — เกินนี้ถือว่าติดต่อไม่ได้ ให้ worker ลองใหม่ */
const TIMEOUT_MS = 10 * 60 * 1000;

export function createOllamaClient(apiKey: string, host = OLLAMA_HOST): OllamaClient {
  const url = `${host.replace(/\/+$/, "")}/api/chat`;
  return {
    async chat(request) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new OllamaError(error instanceof Error ? error.message : String(error));
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        let message = body;
        try {
          message = (JSON.parse(body) as { error?: string }).error ?? body;
        } catch {
          // ตอบเป็นข้อความธรรมดา
        }
        throw new OllamaError(message || `HTTP ${response.status}`, response.status);
      }
      return (await response.json()) as OllamaChatResponse;
    },
  };
}

/**
 * รุ่นบน Ollama Cloud ที่อ่านรูปได้ — ให้แม่หวยเลือกที่หน้าแม่หวย (รุ่นใหม่ที่ Ollama เพิ่มขึ้นมาเองไม่ต้องแก้โค้ด)
 *   GET /api/tags = รายชื่อทุกรุ่น · POST /api/show = ความสามารถของรุ่น (เลือกเฉพาะที่มี "vision") — ทั้งสองไม่ต้องใช้ key
 * เก็บไว้ในหน่วยความจำ LIST_TTL_MS · ดึงไม่ได้ = คืน fallback (รายการที่รู้จัก) แล้วลองใหม่หลัง RETRY_LIST_MS
 */
const LIST_TTL_MS = 60 * 60 * 1000;
const RETRY_LIST_MS = 5 * 60 * 1000;
const LIST_TIMEOUT_MS = 5_000;

let listCache: { until: number; models: string[] } | null = null;

export async function listOllamaVisionModels(
  fallback: string[],
  { host = OLLAMA_HOST, fetchFn = fetch, now = Date.now() }: { host?: string; fetchFn?: typeof fetch; now?: number } = {},
): Promise<string[]> {
  if (listCache && now < listCache.until) return listCache.models;
  const base = host.replace(/\/+$/, "");
  const getJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetchFn(`${base}${path}`, { ...init, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    if (!response.ok) throw new OllamaError(`HTTP ${response.status}`, response.status);
    return (await response.json()) as T;
  };

  try {
    const { models } = await getJson<{ models: Array<{ name: string }> }>("/api/tags");
    const vision = await Promise.all(
      models.map(async ({ name }) => {
        try {
          const show = await getJson<{ capabilities?: string[] }>("/api/show", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: name }),
          });
          return show.capabilities?.includes("vision") ? name : null;
        } catch {
          return null;
        }
      }),
    );
    const names = vision.filter((name): name is string => name !== null).sort((a, b) => a.localeCompare(b));
    if (names.length === 0) throw new OllamaError("no vision models listed");
    listCache = { until: now + LIST_TTL_MS, models: names };
    return names;
  } catch (error) {
    console.warn(`[Ollama] ดึงรายการรุ่นไม่ได้ (${error instanceof Error ? error.message : String(error)}) — ใช้รายการที่รู้จักแทน`);
    listCache = { until: now + RETRY_LIST_MS, models: fallback };
    return fallback;
  }
}

/** ล้างรายการที่เก็บไว้ (ใช้ในเทสต์) */
export function resetOllamaModelList() {
  listCache = null;
}
