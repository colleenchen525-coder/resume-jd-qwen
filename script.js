function $(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  const el = $("status");
  if (el) el.textContent = text || "";
}

function setLoading(isLoading) {
  const btn = $("analyzeBtn");
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "分析中…" : "开始分析";
}

function showOutput(show) {
  const wrap = $("outputWrap");
  if (!wrap) return;
  wrap.classList.toggle("hidden", !show);
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

  return { match_level: level, rationale, alignment_signals, risk_signals };
}

function fallbackResult(reason = "信息不足") {
  return {
    match_level: "Weak",
    rationale: reason,
    alignment_signals: ["经历描述有限", "证据不充分"],
    risk_signals: ["信息不足", "证据不充分"]
  };
}

function renderList(listEl, items) {
  if (!listEl) return;
  listEl.innerHTML = "";
  items.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    listEl.appendChild(li);
  });
}

function renderResult(r) {
  const matchEl = $("matchLevel");
  const rationaleEl = $("rationale");
  const alignEl = $("alignments");
  const risksEl = $("risks");

  if (matchEl) matchEl.textContent = r.match_level;
  if (rationaleEl) rationaleEl.textContent = r.rationale;

  renderList(alignEl, r.alignment_signals);
  renderList(risksEl, r.risk_signals);

  showOutput(true);
}

$("analyzeBtn").addEventListener("click", async () => {
  const jdText = ($("jdText")?.value || "").trim();
  const resumeText = ($("resumeText")?.value || "").trim();

  setStatus("");
  showOutput(false);

  if (!jdText) return alert("请粘贴职位 JD 文本。");
  if (!resumeText) return alert("请粘贴简历文本。");

  setLoading(true);
  setStatus("正在分析，请稍候…");

  try {
    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jd_text: jdText, resume_text: resumeText })
    });

    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }

    const normalized = normalizeResult(data) || fallbackResult("输出不规范，请重试");
    renderResult(normalized);
    setStatus("完成 ✅");
  } catch (err) {
    console.error(err);
    renderResult(fallbackResult("服务暂不可用"));
    setStatus("失败（已兜底）");
  } finally {
    setLoading(false);
  }
});
