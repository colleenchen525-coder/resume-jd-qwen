// script.js (完整)
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

function fileToDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(reader.result); // data:image/...;base64,...
    reader.readAsDataURL(file);
  });
}

// Basic safe escape to avoid raw HTML injection
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Minimal markdown -> HTML converter (supports headings, bold, italic, lists, code blocks, inline code, links, paragraphs)
function markdownToHtml(md) {
  if (!md) return "";
  // escape HTML first
  let s = escapeHtml(md);

  // code block ```lang ... ```
  s = s.replace(/```([\s\S]*?)```/g, (m, code) => {
    return `<pre><code>${code.replace(/&/g,"&amp;")}</code></pre>`;
  });

  // headings
  s = s.replace(/^###### (.*$)/gim, "<h6>$1</h6>");
  s = s.replace(/^##### (.*$)/gim, "<h5>$1</h5>");
  s = s.replace(/^#### (.*$)/gim, "<h4>$1</h4>");
  s = s.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  s = s.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  s = s.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // horizontal rule
  s = s.replace(/^\-\-\-$/gim, "<hr/>");

  // bold **text**
  s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // italic *text*
  s = s.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // inline code `code`
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // unordered lists (lines starting with - or *)
  s = s.replace(/(^|\n)[ \t]*[-\*] (.+)/g, (m, p1, item) => {
    return `${p1}<li>${item.trim()}</li>`;
  });
  // wrap LI in UL
  s = s.replace(/(<li>[\s\S]*?<\/li>)/g, (m) => {
    // if already wrapped, skip
    if (m.startsWith("<ul")) return m;
    return `<ul>${m}</ul>`;
  });

  // ordered lists 1. item
  s = s.replace(/(^|\n)[ \t]*\d+\.\s+(.+)/g, (m, p1, item) => {
    return `${p1}<li>${item.trim()}</li>`;
  });
  s = s.replace(/(<li>[\s\S]*?<\/li>)/g, (m) => {
    // replace first occurrence only - simplistic
    return m;
  });

  // paragraphs: split by two newlines
  s = s.replace(/\n{2,}/g, "</p><p>");
  s = "<p>" + s + "</p>";
  // tidy up empty <p> </p>
  s = s.replace(/<p>\s*<\/p>/g, "");

  return s;
}

// main handler
document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const btn = document.getElementById("analyzeBtn");
  const status = document.getElementById("status");
  const resumeOutput = document.getElementById("resumeOutput");
  const interviewOutput = document.getElementById("interviewOutput");

  resumeOutput.textContent = "";
  interviewOutput.textContent = "";

  btn.disabled = true;
  status.textContent = "正在提取与分析，请稍候…";

  // resume: could be pdf or image or pasted text
  const resumeFile = document.getElementById("resumeFile")?.files?.[0];
  let resumeText = document.getElementById("resumeText").value.trim();
  let resumeImageDataUrl = null;

  if (resumeFile) {
    try {
      if (resumeFile.type === "application/pdf") {
        const pdfText = await extractTextFromPDF(resumeFile);
        resumeText = pdfText + (resumeText ? ("\n\n" + resumeText) : "");
      } else if (resumeFile.type.startsWith("image/")) {
        // convert to dataURL
        resumeImageDataUrl = await fileToDataUrl(resumeFile);
      } else {
        // fallback: try to convert to dataURL
        resumeImageDataUrl = await fileToDataUrl(resumeFile);
      }
    } catch (e) {
      console.error("Resume file parse failed:", e);
      alert("简历文件解析失败，请使用 PDF 或图片或直接粘贴文本。");
      btn.disabled = false;
      status.textContent = "";
      return;
    }
  }

  // JD: support optional file upload (image) or pasted text
  const jdFile = document.getElementById("jdFile")?.files?.[0];
  let jdText = document.getElementById("jdText").value.trim();
  let jdImageDataUrl = null;

  if (jdFile) {
    try {
      if (jdFile.type.startsWith("image/")) {
        jdImageDataUrl = await fileToDataUrl(jdFile);
      } else {
        jdImageDataUrl = await fileToDataUrl(jdFile);
      }
    } catch (e) {
      console.error("JD file parse failed:", e);
      alert("JD 文件读取失败，请更换文件或粘贴文本。");
      btn.disabled = false;
      status.textContent = "";
      return;
    }
  }

  if (!resumeText && !resumeImageDataUrl) { alert("请上传简历（PDF/图片）或粘贴简历文本。"); btn.disabled = false; status.textContent = ""; return; }
  if (!jdText && !jdImageDataUrl) { alert("请粘贴 JD 文本 或 上传 JD 图片。"); btn.disabled = false; status.textContent = ""; return; }

  try {
    const payload = {
      resume_text: resumeText || "",
      resume_image: resumeImageDataUrl || null,
      jd_text: jdText || "",
      jd_image: jdImageDataUrl || null
    };

    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("Server responded non-OK:", resp.status, t);
      throw new Error("Server error " + resp.status);
    }

    const data = await resp.json();

    // data.resume_advice and data.interview_questions are Markdown strings
    resumeOutput.innerHTML = markdownToHtml(data.resume_advice || "（无返回）");
    interviewOutput.innerHTML = markdownToHtml(data.interview_questions || "（无返回）");

    status.textContent = "分析完成 ✅";
  } catch (err) {
    console.error(err);
    alert("分析失败，请稍后再试或检查环境变量是否正确。");
    status.textContent = "分析失败";
  } finally {
    btn.disabled = false;
  }
});
