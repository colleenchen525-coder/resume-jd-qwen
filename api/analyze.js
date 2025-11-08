// api/analyze.js
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,     // ✅ 百炼 API KEY
      baseURL: process.env.LLM_BASE_URL    // ✅ DashScope 兼容模式 URL
    });

    const { resume, jd } = req.body;
    if (!resume || !jd) return res.status(400).json({ error: "Missing resume or jd" });

    const MODEL = process.env.LLM_MODEL || "qwen3-vl-30b-a3b-instruct";

    const resumeResp = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "user", content: `请根据以下简历，给出修改建议：${resume}` }
      ]
    });

    const jdResp = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "user", content: `根据简历与JD，生成面试官提问与考察点：\n简历：${resume}\nJD：${jd}` }
      ]
    });

    return res.status(200).json({
      resume_advice: resumeResp.choices?.[0]?.message?.content ?? "",
      interview_questions: jdResp.choices?.[0]?.message?.content ?? ""
    });

  } catch (err) {
    console.error("🔥 analyze error:", err.response?.data || err);
    return res.status(500).json({ error: "Backend Error" });
  }
}
