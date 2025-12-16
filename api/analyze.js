// api/analyze.js
import OpenAI from "openai";

/**
 * 输出：加入 alignment_signals（事实型，不叫优点）
 * - match_level: Strong | Partial | Weak
 * - rationale: 一句话
 * - alignment_signals: 恰好 2 条（事实型信号，非夸奖）
 * - risk_signals: 恰好 2 条
 */
function buildInstruction() {
  return `
你是严谨的招聘面试官与用人经理。你的任务不是预测录用结果，而是把主观判断结构化为「可讨论的信号」。
禁止：给建议、给通过率/概率、给行动方案、给简历修改、给面试题、给职业规划。禁止输出任何多余文字或解释。
只允许基于输入的 JD 与 Resume 文本做判断；不要推断敏感属性。

【输出格式要求（必须严格遵守）】
- 只输出合法 JSON（不要 markdown、不要代码块、不要多余字段）
- JSON 必须是一个对象，且只能包含以下 4 个 key：
  1) match_level: 只能是 "Strong" / "Partial" / "Weak"
  2) rationale: 一句短句（中文<=30字；英文<=120字符）
  3) alignment_signals: 恰好 2 条字符串数组（事实型信号，不要夸奖；每条中文<=18字；英文<=80字符）
     - 允许：客观经历/范围/侧重点，如“有0-1 AI功能落地”“主要为应用层集成”
     - 禁止：主观褒义词，如“很强/优秀/顶尖/潜力大”
  4) risk_signals: 恰好 2 条字符串数组（不确定性/权衡点；每条中文<=18字；英文<=80字符）
- 如果信息不足：match_level 选 "Weak"，rationale 写“信息不足”，alignment_signals 与 risk_signals 用通用但不越权的描述（例如“经历描述有限”“证据不充分”）

只输出 JSON。`;
}

function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function contentToText(rawContent) {
  if (!rawContent) return "";
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") return p.text ?? "";
        return "";
      })
      .join("\n");
  }
  if (rawContent && typeof rawContent === "object" && rawContent.text) return rawContent.text;
  return "";
}

function normalizeResult(obj) {
  if (!obj || typeof obj !== "object") return null;

  const level = obj.match_level;
  const okLevel = level === "Strong" || level === "Partial" || level === "Weak";
  const rationale = typeof obj.rationale === "string" ? obj.rationale.trim() : "";

  const alignRaw = Array.isArray(obj.alignment_signals) ? obj.alignment_signals : [];
  const riskRaw = Array.isArray(obj.risk_signals) ? obj.risk_signals : [];

  const alignment_signals = alignRaw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 2);

  const risk_signals = riskRaw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 2);

  if (!okLevel || !rationale || alignment_signals.length !== 2 || risk_signals.length !== 2) return null;

  return {
    match_level: level,
    rationale,
    alignment_signals,
    risk_signals
  };
}

function fallbackResult(reason = "信息不足") {
  return {
    match_level: "Weak",
    rationale: reason,
    alignment_signals: ["经历描述有限", "证据不充分"],
    risk_signals: ["信息不足", "证据不充分"]
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");

    const resumeText = (body.resume_text ?? body.resume ?? "").toString();
    const jdText = (body.jd_text ?? body.jd ?? "").toString();

    if (!resumeText.trim()) return res.status(400).json({ error: "Missing resume text" });
    if (!jdText.trim()) return res.status(400).json({ error: "Missing JD text" });

    const client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_BASE_URL
    });

    const MODEL = process.env.LLM_MODEL || "qwen3-vl-30b-a3b-instruct";

    const userPrompt = `JD:\n${jdText}\n\nResume:\n${resumeText}`;

    const analysisResp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "你是严谨的招聘面试官。你只输出符合要求的 JSON，不输出任何解释。"
        },
        {
          role: "user",
          content: `${buildInstruction()}\n\n${userPrompt}`
        }
      ]
    });

    const rawContent = analysisResp?.choices?.[0]?.message?.content;
    const rawText = contentToText(rawContent);

    const jsonText = extractJsonObject(rawText);
    if (!jsonText) return res.status(200).json(fallbackResult("输出格式不符合"));

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("JSON parse error:", e, "rawText:", rawText);
      return res.status(200).json(fallbackResult("解析失败"));
    }

    const normalized = normalizeResult(parsed);
    if (!normalized) return res.status(200).json(fallbackResult("输出不规范"));

    return res.status(200).json(normalized);
  } catch (err) {
    console.error("analyze error full:", err?.response?.data ?? err);
    return res.status(200).json(fallbackResult("服务暂不可用"));
  }
}
