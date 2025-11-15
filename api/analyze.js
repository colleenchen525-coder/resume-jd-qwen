// api/analyze.js
import OpenAI from "openai";

function buildAnalysisInstruction() {
  return `
你是一名严谨的互联网大厂招聘专家 & 实际负责业务的产品经理团队负责人，擅长分析「候选人简历」与「目标 JD」的匹配度。
现在你会看到：候选人简历（可能是图文混合） 和 目标 JD（也可能是图文混合）。

你的任务是：
1）解析 JD，生成结构化的岗位画像 jobProfile
2）解析候选人简历，生成结构化的候选人画像 candidateProfile
3）给出多维度匹配度评分 matchScores
4）给出可执行的简历修改建议 suggestions
5）给出面试准备要点 interviewPrep

【输出要求（非常重要）】
- 只输出 JSON，不要输出任何解释说明。
- JSON 必须是合法 JSON，对象最外层结构如下所示。
- 字段名必须是英文，内容可以用中文。
- 数值分数统一 0-100 的整数。

JSON 结构（示例，仅供参考，实际请填充真实内容）：

{
  "jobProfile": {
    "jobTitle": "string",
    "level": "string",
    "mustHaveSkills": ["string"],
    "niceToHaveSkills": ["string"],
    "yearsOfExperience": "string",
    "businessFocus": ["string"],
    "hardRequirements": ["string"]
  },
  "candidateProfile": {
    "summary": "string",
    "yearsOfExperience": "string",
    "industries": ["string"],
    "coreSkills": ["string"],
    "projects": [
      {
        "title": "string",
        "company": "string",
        "duration": "string",
        "highlights": ["string"],
        "metrics": ["string"]
      }
    ]
  },
  "matchScores": {
    "overall": 80,
    "skillFit": 85,
    "experienceFit": 75,
    "industryFit": 60,
    "businessFit": 70,
    "notes": "string"
  },
  "suggestions": {
    "priorityList": [
      {
        "priority": "P0",
        "title": "string",
        "reason": "string",
        "beforeExample": "string",
        "afterExample": "string"
      }
    ],
    "coveredRequirements": ["string"],
    "missingRequirements": ["string"]
  },
  "interviewPrep": {
    "sellingPoints": ["string"],
    "riskPoints": ["string"],
    "suggestedQuestions": ["string"]
  }
}

请务必严格按上述 JSON 结构输出，一个完整的 JSON 对象，不要有多余文字。
`;
}

// helper: convert text + imageDataUrl into multi-modal parts
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

    const resumeText = body.resume_text ?? body.resume ?? "";
    const resumeImage = body.resume_image ?? body.resumeImage ?? null;
    const jdText = body.jd_text ?? body.jd ?? "";
    const jdImage = body.jd_image ?? body.jdImage ?? null;

    if (!resumeText && !resumeImage) return res.status(400).json({ error: "Missing resume (text or image)" });
    if (!jdText && !jdImage) return res.status(400).json({ error: "Missing JD (text or image)" });

    const MAX_LEN = 10 * 1024 * 1024;
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

    const analysisParts = [
      ...makePartsFromInputs(resumeText, resumeImage, (t) => "（以下为候选人简历）\n" + t),
      ...makePartsFromInputs(jdText, jdImage, (t) => "（以下为目标 JD）\n" + t),
      { type: "text", text: buildAnalysisInstruction() }
    ];

    const analysisResp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "你是严谨的中文招聘专家和用人经理，善于分析岗位要求与候选人简历匹配度，并输出结构化 JSON。"
        },
        { role: "user", content: analysisParts }
      ]
    });

    const rawContent = analysisResp?.choices?.[0]?.message?.content;

    // 兼容 content 可能为 string 或数组
    let rawText = "";
    if (Array.isArray(rawContent)) {
      rawText = rawContent.map((p) => (typeof p === "string" ? p : (p.text ?? ""))).join("\n");
    } else if (typeof rawContent === "string") {
      rawText = rawContent;
    } else if (rawContent && typeof rawContent === "object" && rawContent.text) {
      rawText = rawContent.text;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      console.error("JSON parse error:", e, "rawText:", rawText);
      return res.status(500).json({ error: "LLM JSON parse failed", rawText });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("analyze error full:", err?.response?.data ?? err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
