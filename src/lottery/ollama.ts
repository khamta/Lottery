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

/** status ว่าง = ต่อไม่ได้ · model = รุ่นที่เรียก (บอกได้ว่าใช้ไม่ได้ทั้งบัญชีหรือแค่รุ่นนี้) */
export class OllamaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly model?: string,
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
        throw new OllamaError(error instanceof Error ? error.message : String(error), undefined, request.model);
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        let message = body;
        try {
          message = (JSON.parse(body) as { error?: string }).error ?? body;
        } catch {
          // ตอบเป็นข้อความธรรมดา
        }
        throw new OllamaError(message || `HTTP ${response.status}`, response.status, request.model);
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

/**
 * รุ่นไหนใช้ได้กับแผนของ key นี้ — Ollama ไม่มี API บอก จึงลองเรียกจริงด้วยคำขอเล็กที่สุด (ตอบ 1 token)
 *   "ok"          ใช้ได้เลย (แผน Free = ใช้ฟรี)
 *   "credits"     ไม่อยู่ในแผน ต้องเติมเครดิต / อัปเกรด (402)
 *   "unavailable" ยังไม่เปิดให้บัญชีนี้ใช้ (403)
 * ไม่รู้ผล (ล่ม / ติด rate limit) = ไม่ใส่ในผล · ลองทีละ ACCESS_CONCURRENCY รุ่น (แผน Free จำกัดคำขอพร้อมกัน)
 * เก็บผลไว้ LIST_TTL_MS — เปิดหน้าแม่หวยครั้งแรกรอไม่เกิน ACCESS_WAIT_MS ที่เหลือเช็กต่อเบื้องหลัง เปิดครั้งถัดไปจึงเห็นครบ
 */
export type OllamaAccess = "ok" | "credits" | "unavailable";

const ACCESS_CONCURRENCY = 2;
const ACCESS_WAIT_MS = 4_000;

let accessCache: { until: number; models: string; access: Record<string, OllamaAccess> } | null = null;
let accessRefresh: Promise<void> | null = null;

async function probeModel(
  apiKey: string,
  model: string,
  { host, fetchFn }: { host: string; fetchFn: typeof fetch },
): Promise<OllamaAccess | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchFn(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, stream: false, messages: [{ role: "user", content: "hi" }], options: { num_predict: 1 } }),
        signal: AbortSignal.timeout(15_000),
      });
      await response.body?.cancel();
      if (response.ok) return "ok";
      if (response.status === 402) return "credits";
      if (response.status === 403) return "unavailable";
      if (response.status !== 429) return null;
    } catch {
      return null;
    }
    // คำขอพร้อมกันเกินแผน — รอแล้วลองใหม่
    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
  }
  return null;
}

export async function ollamaModelAccess(
  apiKey: string | undefined,
  models: string[],
  {
    host = OLLAMA_HOST,
    fetchFn = fetch,
    now = Date.now(),
    waitMs = ACCESS_WAIT_MS,
  }: { host?: string; fetchFn?: typeof fetch; now?: number; waitMs?: number } = {},
): Promise<Record<string, OllamaAccess>> {
  if (!apiKey) return {};
  const key = models.join(",");
  if (accessCache && accessCache.models === key && now < accessCache.until) return accessCache.access;

  if (!accessRefresh) {
    const base = host.replace(/\/+$/, "");
    const access: Record<string, OllamaAccess> = {};
    accessRefresh = (async () => {
      const queue = [...models];
      await Promise.all(
        Array.from({ length: ACCESS_CONCURRENCY }, async () => {
          for (let model = queue.shift(); model; model = queue.shift()) {
            const result = await probeModel(apiKey, model, { host: base, fetchFn });
            if (result) access[model] = result;
          }
        }),
      );
      accessCache = { until: now + LIST_TTL_MS, models: key, access };
    })().finally(() => {
      accessRefresh = null;
    });
  }

  await Promise.race([accessRefresh, new Promise((resolve) => setTimeout(resolve, waitMs))]);
  return accessCache?.models === key ? accessCache.access : {};
}

/** ล้างผลที่เก็บไว้ (ใช้ในเทสต์) */
export function resetOllamaAccess() {
  accessCache = null;
  accessRefresh = null;
}
