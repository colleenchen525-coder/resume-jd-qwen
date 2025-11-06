import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,              // 百炼/聚合平台的 API Key
  baseURL: process.env.LLM_BASE_URL             // 百炼 OpenAI 兼容地址
});

const MODEL = process.env.LLM_MODEL || "qwen2.5-14b-instruct";

function buildResumeAdvicePrompt(resume) {
  return `
你是一名资深招聘官/HRBP，请以中文输出对下述候选人「简历文本」的修改建议，要求：
- 先给出「总体诊断」（结构、亮点、硬伤）
- 再输出「三处需要重点修改的段落（逐段重写示例）」
- 每条建议要具体到「动词-结果-指标」，避免泛化描述
- 最后给一版「适配互联网产品经理岗位」的简历摘要（3-5行）

【候选人简历】：
${resume}
`;
}

function buildInterviewQuestionsPrompt(resume, jd) {
  return `
你是一位招聘面试官（产品方向）。基于「候选人简历」与「目标 JD」，请生成中文「面试问题清单」并标注出题意图。
输出格式严格如下（不要多余前言）：
1）问题：XXX
   出题意图：XXX
2）问题：XXX
   出题意图：XXX
请覆盖：动机匹配、核心能力验证、案例深挖、跨部门协作、数据与指标、优先级/Trade-off、失败复盘、职业发展期望。

【候选人简历】：
${resume}

【目标 JD】：
${jd}
`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    const { resume, jd } = req.body || {};
    if (!resume || !jd) return res.status(400).json({ error: "Missing resume or jd" });

    const advice = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: "你是严谨的中文招聘专家，擅长产品经理候选人的简历优化与面试评估。" },
        { role: "user", content: buildResumeAdvicePrompt(resume) }
      ]
    });

    const qas = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [
        { role: "system", content: "你是严格的用人经理，善于设计结构化面试问题并解释背后考察点。" },
        { role: "user", content: buildInterviewQuestionsPrompt(resume, jd) }
      ]
    });

    return res.status(200).json({
      resume_advice: advice.choices?.[0]?.message?.content?.trim() || "",
      interview_questions: qas.choices?.[0]?.message?.content?.trim() || ""
    });
  } catch (err) {
    console.error("analyze error:", err?.response?.data || err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
