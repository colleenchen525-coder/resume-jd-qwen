// ---------- helpers ----------
function setStatus(text) {
  const status = document.getElementById("status");
  if (status) status.textContent = text || "";
}

function showOutput(show) {
  const wrap = document.getElementById("outputWrap");
  if (!wrap) return;
  wrap.classList.toggle("hidden", !show);
}

function setLoading(isLoading) {
  const btn = document.getElementById("analyzeBtn");
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Analyzing..." : "Analyze";
}

// 兜底：确保渲染稳定（即使后端出错，也不至于前端挂）
function normalizeResult(obj) {
  if (!obj || typeof obj !== "object") return null;

  const level = obj.match_level;
  const okLevel = level === "Strong" || level === "Partial" || level === "Weak";
  const rationale = typeof obj.rationale === "string" ? obj.rationale.trim() : "";

  const risksRaw = Array.isArray(obj.risk_signals) ? obj.risk_signals : [];
  const risks = risksRaw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 2);

  if (!okLevel || !rationale || risks.length !== 2) return null;

  return {
    match_level: level,
    rationale,
    risk_signals: risks
  };
}

function fallbackResult(reason = "信息不足") {
  return {
    match_level: "Weak",
    rationale: reason,
    risk_signals: ["信息不足", "证据不充分"]
  };
}

function renderResult(r) {
  const matchEl = document.getElementById("matchLevel");
  const rationaleEl = document.getElementById("rationale");
  const risksEl = document.getElementById("risks");

  if (matchEl) matchEl.textContent = r.match_level;
  if (rationaleEl) rationaleEl.textContent = r.rationale;

  if (risksEl) {
    risksEl.innerHTML = "";
    r.risk_signals.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      risksEl.appendChild(li);
    });
  }

  showOutput(true);
}

// ---------- main ----------
document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const jdText = (document.getElementById("jdText")?.value || "").trim();
  const resumeText = (document.getElementById("resumeText")?.value || "").trim();

  // 清空状态与输出
  setStatus("");
  showOutput(false);

  if (!jdText) {
    alert("请粘贴 JD 文本。");
    return;
  }
  if (!resumeText) {
    alert("请粘贴简历文本。");
    return;
  }

  setLoading(true);
  setStatus("分析中，请稍候…");

  try {
    const payload = {
      jd_text: jdText,
      resume_text: resumeText
    };

    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // 注意：后端即使失败也会尽量返回 200 + 兜底 JSON
    // 但这里仍然做一层保险
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
