import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { C, F } from "./constants.js";
import { notifyMultiple, getSAAndAdminIds } from "./notifications.js";
import { useIsMobile } from "./hooks.js";

const PASS_SCORE = 0.6; // 60% to pass

function QuizModal({ video, userId, user, lang, onPass, onFail, onClose }) {
  const H = lang === "hi";
  const isMobile = useIsMobile();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    supabase.from("training_quizzes")
      .select("*")
      .eq("video_id", video.id)
      .order("id")
      .then(({ data }) => {
        setQuestions(data || []);
        setLoading(false);
        if (data && data.length > 0) setTimerActive(true);
      });
  }, [video.id]);

  // Timer countdown
  useEffect(() => {
    if (!timerActive || showResult || selected !== null) return;
    if (timeLeft <= 0) {
      handleAnswer(null); // time up → wrong
      return;
    }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, timerActive, showResult, selected]);

  const handleAnswer = (opt) => {
    if (selected !== null) return;
    const q = questions[current];
    const correct = opt === q?.correct_option;
    setSelected(opt);
    const newAnswers = [...answers, { qId: q?.id, selected: opt, correct }];
    setAnswers(newAnswers);

    setTimeout(() => {
      if (current + 1 >= questions.length) {
        const sc = newAnswers.filter(a => a.correct).length;
        setScore(sc);
        setShowResult(true);
        setTimerActive(false);
        saveResult(newAnswers, sc);
      } else {
        setCurrent(p => p + 1);
        setSelected(null);
        setTimeLeft(30);
      }
    }, 1500);
  };

  const saveResult = async (ans, sc) => {
    const total = questions.length;
    const passed = sc / total >= PASS_SCORE;
    await supabase.from("quiz_results").insert({
      user_id: userId,
      video_id: video.id,
      score: sc,
      total,
      passed,
      answers: ans,
    });
    const pct = Math.round((sc / total) * 100);
    const videoTitle = video.topic || video.title || "Unknown";
    const userName = user?.name || "Unknown";
    const userProp = user?.prop || user?.property || null;
    getSAAndAdminIds(userProp).then(ids => {
      const type = passed ? "quiz_passed" : "quiz_failed";
      const icon = passed ? "📝✅" : "📝❌";
      notifyMultiple(type, icon+" "+userName+(passed?" passed":" failed")+" quiz: "+videoTitle+" ("+sc+"/"+total+" = "+pct+"%)",userId,userName,ids,userProp);
    });
    if (passed) onPass();
  };

  if (loading) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1001,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <div style={{ color: "#fff", fontFamily: F.b, fontSize: 15 }}>Loading quiz...</div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1001,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20
      }}>
        <div style={{ background: C.white, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
          <div style={{ fontFamily: F.d, fontSize: 19, fontWeight: 700, color: C.maroon, marginBottom: 8 }}>
            {H ? "कोई क्विज़ नहीं" : "No Quiz Available"}
          </div>
          <div style={{ fontSize: 14, color: C.tl, marginBottom: 20 }}>
            {H ? "इस वीडियो के लिए अभी कोई क्विज़ नहीं है।" : "No quiz has been added for this video yet."}
          </div>
          <button onClick={() => { onPass(); onClose(); }} style={{
            width: "100%", padding: "14px", borderRadius: 10, border: "none",
            background: C.green, color: C.white, fontFamily: F.b, fontSize: 16, fontWeight: 700, cursor: "pointer"
          }}>✅ {H ? "पूर्ण के रूप में चिह्नित करें" : "Mark as Complete"}</button>
          <button onClick={onClose} style={{
            width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`,
            background: C.bg, fontFamily: F.b, fontSize: 15, cursor: "pointer", marginTop: 8
          }}>{H ? "बंद करें" : "Close"}</button>
        </div>
      </div>
    );
  }

  if (showResult) {
    const total = questions.length;
    const pct = Math.round((score / total) * 100);
    const passed = pct >= 60;
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1001,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20
      }}>
        <div style={{ background: C.white, borderRadius: 16, padding: 28, maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>{passed ? "🏆" : "😔"}</div>
          <div style={{ fontFamily: F.d, fontSize: 25, fontWeight: 700, color: passed ? C.green : C.red, marginBottom: 6 }}>
            {score}/{total} ({pct}%)
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: passed ? C.green : C.red, marginBottom: 16 }}>
            {passed
              ? (H ? "✅ पास! ट्रेनिंग पूर्ण।" : "✅ Passed! Training marked complete.")
              : (H ? "❌ पास नहीं हुए। दोबारा देखें और प्रयास करें।" : "❌ Not passed. Please re-watch and try again.")}
          </div>
          {passed ? (
            <button onClick={onClose} style={{
              width: "100%", padding: "14px", borderRadius: 10, border: "none",
              background: C.green, color: C.white, fontFamily: F.b, fontSize: 16, fontWeight: 700, cursor: "pointer"
            }}>🎉 {H ? "जारी रखें" : "Continue"}</button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={onFail} style={{
                width: "100%", padding: "14px", borderRadius: 10, border: "none",
                background: C.maroon, color: C.white, fontFamily: F.b, fontSize: 16, fontWeight: 700, cursor: "pointer"
              }}>▶ {H ? "वीडियो दोबारा देखें" : "Watch Again"}</button>
              <button onClick={onClose} style={{
                width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`,
                background: C.bg, fontFamily: F.b, fontSize: 15, cursor: "pointer"
              }}>{H ? "बाद में" : "Later"}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const q = questions[current];
  const opts = [
    { key: "a", label: q.option_a },
    { key: "b", label: q.option_b },
    { key: "c", label: q.option_c },
    { key: "d", label: q.option_d },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1001,
      display: "flex", alignItems: "flex-end",
      animation: "fadeIn 0.2s ease"
    }}>
      <div style={{
        background: C.white, borderRadius: "20px 20px 0 0",
        width: "100%", maxHeight: "90vh", overflow: "auto",
        padding: "24px 20px 40px",
        animation: "slideUpFull 0.3s ease"
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              width: i === current ? 24 : 10, height: 10, borderRadius: 5,
              background: i < current ? C.green : i === current ? C.maroon : C.border,
              transition: "all 0.2s"
            }} />
          ))}
        </div>

        {/* Timer bar */}
        <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 16, overflow: "hidden" }}>
          <div style={{
            height: "100%", background: timeLeft > 10 ? C.green : C.red,
            width: `${(timeLeft / 30) * 100}%`, borderRadius: 2, transition: "width 1s linear, background 0.3s"
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: C.tl, fontWeight: 600 }}>
            {H ? `प्रश्न ${current + 1}/${questions.length}` : `Q ${current + 1} of ${questions.length}`}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: timeLeft <= 10 ? C.red : C.tl
          }}>⏱ {timeLeft}s</span>
        </div>

        <div style={{ fontSize: 19, fontWeight: 700, color: C.text, marginBottom: 24, lineHeight: 1.4 }}>
          {H && q.question_hi ? q.question_hi : q.question}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {opts.map(o => {
            const isSelected = selected === o.key;
            const isCorrect = o.key === q.correct_option;
            let bg = C.white, border = C.border, color = C.text;
            if (selected !== null) {
              if (isCorrect) { bg = C.gBg; border = C.green; color = C.green; }
              else if (isSelected && !isCorrect) { bg = C.rBg; border = C.red; color = C.red; }
            }
            return (
              <button key={o.key} onClick={() => handleAnswer(o.key)} disabled={selected !== null} style={{
                width: "100%", padding: "16px", borderRadius: 12,
                border: `2px solid ${isSelected || (selected !== null && isCorrect) ? border : C.border}`,
                background: selected !== null ? bg : C.white,
                cursor: selected !== null ? "default" : "pointer",
                fontFamily: F.b, fontSize: 16, fontWeight: 600, color,
                textAlign: "left", display: "flex", alignItems: "center", gap: 12,
                transition: "all 0.2s", minHeight: isMobile ? 52 : 56
              }}>
                <span style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: selected !== null && isCorrect ? C.green : selected !== null && isSelected && !isCorrect ? C.red : C.maroonSoft,
                  color: selected !== null && (isCorrect || isSelected) ? C.white : C.maroon,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 14
                }}>{o.key.toUpperCase()}</span>
                <span>{o.label}</span>
                {selected !== null && isCorrect && <span style={{ marginLeft: "auto" }}>✅</span>}
                {selected !== null && isSelected && !isCorrect && <span style={{ marginLeft: "auto" }}>❌</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Admin: Add/Edit quiz questions for a video ──
export function QuizManager({ video, lang, onClose }) {
  const H = lang === "hi";
  const isMobile = useIsMobile();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ question: "", question_hi: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "a" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("training_quizzes").select("*").eq("video_id", video.id).order("id")
      .then(({ data }) => { setQuestions(data || []); setLoading(false); });
  }, [video.id]);

  const addQuestion = async () => {
    if (!form.question.trim() || !form.option_a || !form.option_b || !form.option_c || !form.option_d) return;
    setSaving(true);
    const { data } = await supabase.from("training_quizzes").insert({ ...form, video_id: video.id }).select().single();
    if (data) setQuestions(p => [...p, data]);
    setForm({ question: "", question_hi: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "a" });
    setSaving(false);
  };

  const deleteQuestion = async (id) => {
    await supabase.from("training_quizzes").delete().eq("id", id);
    setQuestions(p => p.filter(q => q.id !== id));
  };

  const inp = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const iStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: F.b, fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1002, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: F.d, fontSize: 17, fontWeight: 700, color: C.maroon }}>📝 Quiz Manager</div>
            <div style={{ fontSize: 12, color: C.tl }}>{video.topic}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: C.bg, borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* Existing questions */}
        {!loading && questions.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              {questions.length} question{questions.length !== 1 ? "s" : ""} {questions.length >= 3 ? "✅" : `(need ${3 - questions.length} more to activate)`}
            </div>
            {questions.map((q, i) => (
              <div key={q.id} style={{ padding: "10px 12px", background: C.bg, borderRadius: 8, marginBottom: 6, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Q{i + 1}. {q.question}</div>
                  <button onClick={() => deleteQuestion(q.id)} style={{ border: "none", background: C.rBg, color: C.red, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>🗑️</button>
                </div>
                <div style={{ fontSize: 11, color: C.tl, marginTop: 4 }}>
                  A: {q.option_a} · B: {q.option_b} · C: {q.option_c} · D: {q.option_d}
                  <span style={{ marginLeft: 8, color: C.green, fontWeight: 700 }}>✓ {q.correct_option.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add question form */}
        <div style={{ background: C.maroonSoft, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.maroon, marginBottom: 12 }}>➕ Add Question</div>
          <input placeholder="Question (English)" value={form.question} onChange={e => inp("question", e.target.value)} style={iStyle} />
          <input placeholder="प्रश्न (Hindi - optional)" value={form.question_hi} onChange={e => inp("question_hi", e.target.value)} style={iStyle} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            <input placeholder="Option A" value={form.option_a} onChange={e => inp("option_a", e.target.value)} style={{ ...iStyle, marginBottom: 0 }} />
            <input placeholder="Option B" value={form.option_b} onChange={e => inp("option_b", e.target.value)} style={{ ...iStyle, marginBottom: 0 }} />
            <input placeholder="Option C" value={form.option_c} onChange={e => inp("option_c", e.target.value)} style={{ ...iStyle, marginBottom: 0 }} />
            <input placeholder="Option D" value={form.option_d} onChange={e => inp("option_d", e.target.value)} style={{ ...iStyle, marginBottom: 0 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Correct Answer:</label>
            {["a", "b", "c", "d"].map(k => (
              <button key={k} onClick={() => inp("correct_option", k)} style={{
                width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                background: form.correct_option === k ? C.green : C.bg,
                color: form.correct_option === k ? C.white : C.text,
                fontFamily: F.b, fontSize: 14, fontWeight: 700
              }}>{k.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={addQuestion} disabled={saving} style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none", marginTop: 14,
            background: saving ? "#aaa" : C.maroon, color: C.white, fontFamily: F.b, fontSize: 15, fontWeight: 700, cursor: saving ? "default" : "pointer"
          }}>{saving ? "Saving..." : "✅ Add Question"}</button>
        </div>
      </div>
    </div>
  );
}

export default QuizModal;
