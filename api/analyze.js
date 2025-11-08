// api/analyze.js
import OpenAI from "openai";

function buildResumeAdvicePrompt(rawResume) {
  return `
你是一名资深招聘官/HRBP，请以中文输出对下述候选人「简历文本」的修改建议，要求：
- 先给出「总体诊断」（结构、亮点、硬伤）
- 再输出「三处需要重点修改的段落（逐段重写示例）」
- 每条建议要具体到「动词-结果-指标」，避免泛化描述
- 最后给一版「适配互联网产品经理岗位」的简历摘要（3-5行）

【候选人简历】：
${rawResume}
`;
}

function buildInterviewInstruction() {
  return `
你是一位招聘面试官（产品方向）。基于上方的「候选人简历（图/文混合）」与「目标 JD（图/文混合）」，请生成中文「面试问题清单」并标注出题意图。
输出格式严格如下（不要多余前言）：
1）问题：XXX
   出题意图：XXX
2）问题：XXX
   出题意图：XXX
请覆盖：动机匹配、核心能力验证、案例深挖、跨部门协作、数据与指标、优先级/Trade-off、失败复盘、职业发展期望。
`;
}

// helper: convert possible parts into the model-compatible "content" structure:
// returns an array with objects {type: "image_url", image_url:{url:...}} and/or {type:"text", text: "..."}
function makePartsFromInputs(text, imageDataUrl, textWrapper = null) {
  const parts = [];
  if (imageDataUrl) {
    parts.push({ type: "image_url", image_url: { url: imageDataUrl } });
  }
  if (text && text.trim()) {
    const t = textWrapper ? textWrapper(text) : text;
    parts.push({ type: "text", text: t });
  }
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");

    // support multiple field names
    const resumeText = body.resume_text ?? body.resume ?? "";
    const resumeImage = body.resume_image ?? body.resumeImage ?? null; // expected data URL
    const jdText = body.jd_text ?? body.jd ?? "";
    const jdImage = body.jd_image ?? body.jdImage ?? null;

    if (!resumeText && !resumeImage) return res.status(400).json({ error: "Missing resume (text or image)" });
    if (!jdText && !jdImage) return res.status(400).json({ error: "Missing JD (text or image)" });

    // basic size guard for data URLs (avoid huge payloads)
    const MAX_LEN = 10 * 1024 * 1024; // 10MB string length limit
    for (const d of [resumeImage, jdImage]) {
      if (d && typeof d === "string" && d.length > MAX_LEN) {
        return res.status(400).json({ error: "Image too large" });
      }
    }

    const client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_BASE_URL
    });
    const MODEL = process.env.LLM_MODEL || "qwen3-vl-30b-a3b-instruct";

    // Build user message content arrays:
    const resumeParts = makePartsFromInputs(resumeText, resumeImage, (t) => buildResumeAdvicePrompt(t));
    // for interview prompt, we show resume then JD then instruction
    const interviewParts = [
      // resume image / text (if any)
      ...makePartsFromInputs(resumeText, resumeImage, (t) => "(以下为候选人简历）\n" + t),
      // jd image / text
      ...makePartsFromInputs(jdText, jdImage, (t) => "(以下为目标 JD）\n" + t),
      // finally instruction text (asks for Qs)
      { type: "text", text: buildInterviewInstruction() }
    ];

    // Call 1: resume advice (chat completion)
    const resumeResp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: "你是严谨的中文招聘专家，擅长产品经理候选人的简历优化与面试评估。" },
        { role: "user", content: resumeParts }
      ]
    });

    // Call 2: interview questions
    const qasResp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [
        { role: "system", content: "你是严格的用人经理，善于设计结构化面试问题并解释背后考察点。" },
        { role: "user", content: interviewParts }
      ]
    });

    // extract text safely (support a few response shapes)
    const getContent = (resp) => {
      try {
        const c = resp?.choices?.[0]?.message?.content;
        if (!c) return "";
        // if content is array-like, flatten textual parts
        if (Array.isArray(c)) {
          return c.map((p) => (typeof p === "string" ? p : p.text ?? "")).join("\n");
        }
        return typeof c === "string" ? c : (c.text ?? "");
      } catch (e) {
        return "";
      }
    };

    const resume_advice_md = getContent(resumeResp);
    const interview_questions_md = getContent(qasResp);

    return res.status(200).json({
      resume_advice: resume_advice_md,
      interview_questions: interview_questions_md
    });
  } catch (err) {
    console.error("analyze error full:", err?.response?.data ?? err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
