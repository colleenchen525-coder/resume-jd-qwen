async function extractTextFromPDF(file) {
  if (!file) return "";
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n";
  }
  return text.trim();
}

document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const btn = document.getElementById("analyzeBtn");
  const status = document.getElementById("status");
  const resumeOutput = document.getElementById("resumeOutput");
  const interviewOutput = document.getElementById("interviewOutput");

  resumeOutput.textContent = "";
  interviewOutput.textContent = "";

  btn.disabled = true;
  status.textContent = "正在提取与分析，请稍候…";

  const file = document.getElementById("resumeFile").files[0];
  let resumeText = document.getElementById("resumeText").value.trim();
  if (file) {
    try {
      const pdfText = await extractTextFromPDF(file);
      resumeText = pdfText + (resumeText ? ("\n\n" + resumeText) : "");
    } catch (e) {
      console.error("PDF 解析失败：", e);
      alert("PDF 解析失败，请改为粘贴文本或更换 PDF 文件。");
      btn.disabled = false;
      status.textContent = "";
      return;
    }
  }
  const jdText = document.getElementById("jdText").value.trim();

  if (!resumeText) { alert("请上传简历 PDF 或粘贴简历文本。"); btn.disabled = false; status.textContent = ""; return; }
  if (!jdText) { alert("请粘贴 JD 文本。"); btn.disabled = false; status.textContent = ""; return; }

  try {
    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: resumeText, jd: jdText })
    });
    if (!resp.ok) throw new Error("Server error");
    const data = await resp.json();
    resumeOutput.textContent = data.resume_advice || "（无返回）";
    interviewOutput.textContent = data.interview_questions || "（无返回）";
    status.textContent = "分析完成 ✅";
  } catch (err) {
    console.error(err);
    alert("分析失败，请稍后再试或检查环境变量是否正确。");
    status.textContent = "分析失败";
  } finally {
    btn.disabled = false;
  }
});
