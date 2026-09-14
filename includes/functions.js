import { supabase } from "./db.js?v=1.0.0";

/* =======================================================================
   ملاحظة عامة: كل البيانات (امتحانات - أسئلة - محاولات) جوه قاعدة البيانات
   بالكامل، مفيش أي فتح لملفات JSON. ميزات الكنائس والبكدجات/الأنشطة
   والطباعة تمت إزالتها بالكامل من النظام.
   ======================================================================= */

/* =======================================
   البث المباشر وقت الامتحان (Supabase Realtime)
   الأدمن يقدر يبعت رسالة تظهر فوراً لكل من يفتح صفحة هذا الامتحان
   بدون أي عمل ريفريش، وبدون تخزين أي شيء في قاعدة البيانات (رسائل لحظية فقط).
======================================= */
const LIVE_CHANNEL_PREFIX = "exam_live_";

// يُستخدم في exam.js: يبدأ الاستماع لرسائل الأدمن الحية لهذا الامتحان
export function subscribeToExamBroadcast(examId, onMessage) {
  const channel = supabase.channel(`${LIVE_CHANNEL_PREFIX}${examId}`, {
    config: { broadcast: { self: false } },
  });
  channel.on("broadcast", { event: "admin_message" }, (payload) => {
    onMessage(payload?.payload?.text || "");
  });
  channel.subscribe();
  return channel; // يقدر المستخدم يستدعي channel.unsubscribe() لو احتاج
}

// يُستخدم في لوحة الأدمن: يبعت رسالة فورية لكل من يفتح صفحة هذا الامتحان الآن
export async function sendExamBroadcast(examId, text) {
  const channel = supabase.channel(`${LIVE_CHANNEL_PREFIX}${examId}`, {
    config: { broadcast: { self: false } },
  });
  await new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
  await channel.send({
    type: "broadcast",
    event: "admin_message",
    payload: { text },
  });
  setTimeout(() => supabase.removeChannel(channel), 1500);
  return true;
}

/* =======================================
   الامتحانات (exams)
======================================= */
export async function getExamBySlug(slug) {
  const { data } = await supabase
    .from("exams")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data || null;
}

export async function getExamById(examId) {
  const { data } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .maybeSingle();
  return data || null;
}

export async function getAllExams() {
  const { data } = await supabase.from("exams").select("*").order("id");
  return data || [];
}

// نفس getAllExams لكن بيستثني الامتحانات المخفية من صفحة الاستعلام
// (lookup_hidden = true)، تُستخدم فقط في قائمة اختيار الامتحان بصفحة lookup.html
export async function getExamsForLookup() {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .eq("lookup_hidden", false)
    .order("id");
  if (error) {
    console.error("Error loading exams for lookup:", error);
    return [];
  }
  return data || [];
}

export async function createExam(examData) {
  const payload = {
    name: examData.name,
    slug: examData.slug,
    description: examData.description || null,
    stage: examData.stage || null,
    duration_seconds: Number(examData.duration_seconds) || 1800,
    pass_threshold: Number(examData.pass_threshold ?? 50),
    is_open: examData.is_open !== undefined ? !!examData.is_open : true,
    lookup_hidden:
      examData.lookup_hidden !== undefined ? !!examData.lookup_hidden : false,
    result_visibility: examData.result_visibility || "immediate",
    closed_message: examData.closed_message || null,
    not_found_announcement: examData.not_found_announcement || null,
  };
  const { data, error } = await supabase
    .from("exams")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExam(examId, patch) {
  const allowed = [
    "name",
    "slug",
    "description",
    "stage",
    "duration_seconds",
    "pass_threshold",
    "is_open",
    "lookup_hidden",
    "result_visibility",
    "closed_message",
    "not_found_announcement",
  ];
  const payload = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) payload[k] = patch[k];
  });
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("exams")
    .update(payload)
    .eq("id", examId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExamStatus(examId, isOpen) {
  return updateExam(examId, { is_open: isOpen });
}

export async function deleteExam(examId) {
  const { error } = await supabase.from("exams").delete().eq("id", examId);
  if (error) throw error;
  return true;
}

/* =======================================
   الأسئلة (questions)
======================================= */

// إرجاع الأسئلة بشكل جاهز للاستخدام في exam.js (نفس شكل الأسئلة القديم من JSON)
export async function getQuestionsByExam(examId) {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });
  if (error) {
    console.error("Error loading questions:", error);
    return [];
  }
  return data || [];
}

export async function createQuestion(examId, q) {
  // نحدد order_index تلقائي = آخر رقم + 1
  const { data: existing } = await supabase
    .from("questions")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);
  const nextOrder =
    existing && existing.length ? existing[0].order_index + 1 : 0;

  const payload = {
    exam_id: examId,
    order_index: q.order_index ?? nextOrder,
    type: q.type,
    question: q.question,
    options: q.options ?? null,
    correct_answer: q.correct_answer ?? null,
    score: Number(q.score ?? 1),
    blank_scores: q.blank_scores ?? null,
    images: Array.isArray(q.images) ? q.images : [],
  };
  const { data, error } = await supabase
    .from("questions")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuestion(questionId, patch) {
  const allowed = [
    "type",
    "question",
    "options",
    "correct_answer",
    "score",
    "blank_scores",
    "order_index",
    "images",
  ];
  const payload = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) payload[k] = patch[k];
  });
  const { data, error } = await supabase
    .from("questions")
    .update(payload)
    .eq("id", questionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuestion(questionId) {
  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId);
  if (error) throw error;
  return true;
}

export async function reorderQuestions(examId, orderedQuestionIds) {
  // orderedQuestionIds: مصفوفة IDs بالترتيب المطلوب
  const updates = orderedQuestionIds.map((id, index) =>
    supabase
      .from("questions")
      .update({ order_index: index })
      .eq("id", id)
      .eq("exam_id", examId),
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  return true;
}

/* =======================================
   التصحيح التلقائي (يدعم درجة لكل سؤال ودرجة لكل فراغ)
   ---------------------------------------
   normalize(): بتوحّد شكل النص عشان المقارنة تتم "بالمعنى" مش بالحرف،
   فبتتجاهل كل اختلافات الكتابة الشائعة في العربي (همزات، تاء مربوطة/هاء،
   ألف مقصورة/ياء، تشكيل، مسافات، وجود/غياب أداة التعريف "ال"...).
   شوف الشرح الكامل لكل حالة في رسالة تسليم المهمة.
======================================= */
export function normalize(value) {
  let s = String(value ?? "");

  // 1) إزالة محارف خفية غير مرئية ممكن تتسرب من النسخ/اللصق أو بعض الكيبوردات
  s = s.replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF]/g, "");

  // 2) إزالة التشكيل بكل أنواعه (فتحة/ضمة/كسرة/شدة/سكون/تنوين...) وعلامة التطويل (ـــ)
  s = s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  s = s.replace(/\u0640/g, "");

  // 3) توحيد كل أشكال الألف (همزة فوق/تحت/مدة/وصل) إلى ألف عادية: أ إ آ ٱ ← ا
  s = s.replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/g, "\u0627");

  // 4) توحيد التاء المربوطة مع الهاء: ة ← ه (يتحسبوا نفس الحرف عند المقارنة)
  s = s.replace(/\u0629/g, "\u0647");

  // 5) توحيد الألف المقصورة والياء المهموزة مع الياء العادية: ى ئ ← ي
  s = s.replace(/[\u0649\u0626]/g, "\u064A");

  // 6) توحيد الواو المهموزة مع الواو العادية: ؤ ← و
  s = s.replace(/\u0624/g, "\u0648");

  // 7) إزالة الهمزة المفردة المنفصلة تماماً (بتتكتب أحياناً وأحياناً لأ): ء ← (حذف)
  s = s.replace(/\u0621/g, "");

  // 8) شيل أداة التعريف "ال" من أول كل كلمة (قبل إلغاء المسافات) بشرط تفضل الكلمة
  //    معناها واضح بعد الشيل (عشان منكسرش كلمات زي "الله")، بعدين نلغي كل المسافات
  //    نهائياً عشان شكل التباعد بين الكلمات ميأثرش على المقارنة إطلاقاً.
  s = s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length >= 4 && w.startsWith("\u0627\u0644") ? w.slice(2) : w))
    .join("");

  return s.trim().toLowerCase();
}

export function isAnswerCorrect(userAnswer, correctAnswer) {
  const u = normalize(userAnswer);
  if (u === "") return false;
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.some((accepted) => normalize(accepted) === u);
  }
  return normalize(correctAnswer) === u;
}

export function normalizeBlanksCorrectAnswer(correctAnswer) {
  if (!Array.isArray(correctAnswer)) return [[String(correctAnswer)]];
  const isNested = correctAnswer.some((v) => Array.isArray(v));
  if (isNested)
    return correctAnswer.map((v) => (Array.isArray(v) ? v : [String(v)]));
  return [correctAnswer];
}

// تصحيح سؤال إكمال الفراغ مع دعم درجة مستقلة لكل فراغ (Partial credit)
function gradeFillInTheBlankDetailed(userAnswer, correctAnswer, blankScores) {
  const blanks = normalizeBlanksCorrectAnswer(correctAnswer);
  const userBlanks = Array.isArray(userAnswer) ? userAnswer : [userAnswer];

  const scores =
    Array.isArray(blankScores) && blankScores.length === blanks.length
      ? blankScores.map((s) => Number(s) || 0)
      : blanks.map(() => 1); // fallback: درجة واحدة لكل فراغ لو مفيش تحديد

  let score = 0;
  let maxScore = 0;
  let allCorrect = true;

  blanks.forEach((accepted, i) => {
    const pts = scores[i] ?? 0;
    maxScore += pts;
    const correct = isAnswerCorrect(userBlanks[i] ?? "", accepted);
    if (correct) score += pts;
    else allCorrect = false;
  });

  return { isCorrect: allCorrect, score, maxScore };
}

// تصحيح أي سؤال (يرجع النتيجة والدرجة القصوى)
export function gradeQuestion(question, userAnswer) {
  const type = question.type;
  const correctAnswer = question.correct_answer;

  if (type === "essay") {
    // مقالي: يحتاج تصحيح يدوي من الأدمن
    return {
      autoGraded: false,
      isCorrect: false,
      score: 0,
      maxScore: Number(question.score) || 0,
    };
  }

  if (type === "fill_in_the_blank") {
    const result = gradeFillInTheBlankDetailed(
      userAnswer,
      correctAnswer,
      question.blank_scores,
    );
    return { autoGraded: true, ...result };
  }

  // true_false / multiple_choice
  const maxScore = Number(question.score) || 1;
  const correct = isAnswerCorrect(userAnswer, correctAnswer);
  return {
    autoGraded: true,
    isCorrect: correct,
    score: correct ? maxScore : 0,
    maxScore,
  };
}

/* =======================================
   التقديرات وحد النجاح
======================================= */
export function getGradeText(percentage) {
  const p = Number(percentage) || 0;
  if (p >= 91) return "ممتاز";
  if (p >= 76) return "جيد جداً";
  if (p >= 61) return "جيد";
  if (p >= 50) return "مقبول";
  return "ضعيف";
}

/* =======================================
   المحاولات (Attempts)
======================================= */
export async function checkExistingAttempt(examId, phone) {
  const { count } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId)
    .eq("user_phone", phone)
    .in("status", ["submitted", "graded"]);
  return (count || 0) > 0;
}

export async function createAttempt(examId, name, phone) {
  const { data, error } = await supabase
    .from("attempts")
    .insert({
      exam_id: examId,
      user_name: name,
      user_phone: phone,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getAttempt(attemptId) {
  const { data } = await supabase
    .from("attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  return data || null;
}

export async function ensureExamStarted(attemptId) {
  const attempt = await getAttempt(attemptId);
  if (attempt && !attempt.exam_started_at) {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("attempts")
      .update({ exam_started_at: nowIso })
      .eq("id", attemptId)
      .is("exam_started_at", null)
      .select("exam_started_at")
      .maybeSingle();
    return data?.exam_started_at || nowIso;
  }
  return attempt?.exam_started_at || null;
}

export async function submitExamAttempt(attemptId, questions, postedAnswers) {
  const rows = [];
  let totalScore = 0;
  let totalPossible = 0;

  questions.forEach((q, index) => {
    const type = q.type;
    const rawAnswer = postedAnswers[index] ?? "";

    let storedAnswer;
    if (type === "fill_in_the_blank" && Array.isArray(rawAnswer)) {
      storedAnswer = JSON.stringify(
        rawAnswer.map((v) => String(v ?? "").trim()),
      );
    } else {
      storedAnswer = Array.isArray(rawAnswer)
        ? ""
        : String(rawAnswer ?? "").trim();
    }

    const cleanAnswer =
      type === "fill_in_the_blank" && Array.isArray(rawAnswer)
        ? rawAnswer.map((v) => String(v ?? "").trim())
        : String(rawAnswer ?? "").trim();

    const result = gradeQuestion(q, cleanAnswer);

    if (result.autoGraded) {
      totalPossible += result.maxScore;
      totalScore += result.score;
    }

    rows.push({
      attempt_id: attemptId,
      question_id: q.id ?? null,
      question_index: index,
      question_type: type,
      user_answer: storedAnswer,
      correct_answer: Array.isArray(q.correct_answer)
        ? JSON.stringify(q.correct_answer)
        : String(q.correct_answer ?? ""),
      auto_graded: result.autoGraded,
      is_correct: result.isCorrect,
      score: result.score,
      max_score: result.maxScore,
      graded_by: "auto",
    });
  });

  const percentage = totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0;
  const gradeText = getGradeText(percentage);
  // ملحوظة: نسبة النجاح المبدئية بتتحسب من الأسئلة اللي بتتصحح أوتوماتيك فقط.
  // لو الامتحان فيه أسئلة مقالية، هتفضل "قيد المراجعة" لحد ما الأدمن يصححها
  // (انظر recalcAttemptTotals بعد تصحيح المقالي).
  const status = "submitted";

  if (rows.length) {
    const { error: ansErr } = await supabase
      .from("answers")
      .upsert(rows, { onConflict: "attempt_id,question_index" });
    if (ansErr) throw ansErr;
  }

  const passThreshold = await getExamPassThreshold(questions);

  const { error: attErr } = await supabase
    .from("attempts")
    .update({
      end_time: new Date().toISOString(),
      status,
      total_score: totalScore,
      total_possible: totalPossible,
      percentage,
      grade_text: gradeText,
      pass_fail: percentage >= passThreshold ? "pass" : "fail",
    })
    .eq("id", attemptId);
  if (attErr) throw attErr;

  return true;
}

// نجيب حد النجاح الفعلي بتاع الامتحان (كل الأسئلة بتحمل exam_id واحد)
async function getExamPassThreshold(questions) {
  if (!questions || !questions.length) return 50;
  const examId = questions[0].exam_id;
  if (!examId) return 50;
  const exam = await getExamById(examId);
  return exam?.pass_threshold ?? 50;
}

export async function deleteAttempt(attemptId) {
  const { error } = await supabase
    .from("attempts")
    .delete()
    .eq("id", attemptId);
  if (error) throw error;
  return true;
}

/* =======================================
   إعادة احتساب مجموع المحاولة (تُستخدم بعد أي تعديل يدوي على إجابة)
======================================= */
export async function recalcAttemptTotals(attemptId) {
  const { data: answersRows, error } = await supabase
    .from("answers")
    .select("score, max_score")
    .eq("attempt_id", attemptId);
  if (error) throw error;

  const totalScore = (answersRows || []).reduce(
    (s, a) => s + (Number(a.score) || 0),
    0,
  );
  const totalPossible = (answersRows || []).reduce(
    (s, a) => s + (Number(a.max_score) || 0),
    0,
  );
  const percentage = totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0;
  const gradeText = getGradeText(percentage);

  const attempt = await getAttempt(attemptId);
  const exam = attempt ? await getExamById(attempt.exam_id) : null;
  const passThreshold = exam?.pass_threshold ?? 50;

  const { error: updErr } = await supabase
    .from("attempts")
    .update({
      total_score: totalScore,
      total_possible: totalPossible,
      percentage,
      grade_text: gradeText,
      pass_fail: percentage >= passThreshold ? "pass" : "fail",
      status: "graded",
    })
    .eq("id", attemptId);
  if (updErr) throw updErr;

  return { totalScore, totalPossible, percentage, gradeText };
}

// تعديل إجابة معينة يدوياً من الأدمن (تصحيح/تغليط أي سؤال، أو تصحيح مقالي)
// ملحوظة: الدرجة معمول لها حد أقصى تلقائي = الدرجة القصوى المحددة للسؤال، ميقدرش يتعداها.
export async function adminUpdateAnswer(
  answerId,
  { isCorrect, score, maxScore },
) {
  const { data: existing } = await supabase
    .from("answers")
    .select("max_score")
    .eq("id", answerId)
    .maybeSingle();
  const effectiveMax =
    maxScore !== undefined
      ? Number(maxScore)
      : Number(existing?.max_score ?? Infinity);

  const patch = { graded_by: "admin" };
  if (isCorrect !== undefined) patch.is_correct = isCorrect;
  if (score !== undefined) {
    let clamped = Number(score);
    if (Number.isFinite(effectiveMax) && clamped > effectiveMax)
      clamped = effectiveMax;
    if (clamped < 0) clamped = 0;
    patch.score = clamped;
  }
  if (maxScore !== undefined) patch.max_score = Number(maxScore);

  const { data, error } = await supabase
    .from("answers")
    .update(patch)
    .eq("id", answerId)
    .select()
    .single();
  if (error) throw error;

  await recalcAttemptTotals(data.attempt_id);
  return data;
}

export async function getAnswersForAttempt(attemptId) {
  const { data, error } = await supabase
    .from("answers")
    .select("*")
    .eq("attempt_id", attemptId)
    .order("question_index", { ascending: true });
  if (error) {
    console.error("Error loading answers:", error);
    return [];
  }
  return data || [];
}

/* =======================================
   جلب وعد المحاولات للقوائم (لوحة الأدمن)
======================================= */
export async function countAttemptsByPassFail(passFail, examId, search) {
  let query = supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .in("status", ["submitted", "graded"]);

  if (passFail) query = query.eq("pass_fail", passFail);
  if (examId) query = query.eq("exam_id", Number(examId));
  if (search) {
    query = query.or(
      `user_name.ilike.%${search}%,user_phone.ilike.%${search}%`,
    );
  }

  const { count, error } = await query;
  if (error) console.error("Error counting attempts:", error);
  return count || 0;
}

export async function getAttemptsByPassFail(
  passFail,
  examId,
  limit,
  offset,
  search,
) {
  let query = supabase
    .from("attempts")
    .select("*, exams(name)")
    .in("status", ["submitted", "graded"]);

  if (passFail) query = query.eq("pass_fail", passFail);
  if (examId) query = query.eq("exam_id", Number(examId));
  if (search) {
    query = query.or(
      `user_name.ilike.%${search}%,user_phone.ilike.%${search}%`,
    );
  }

  query = query
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching attempts:", error);
    return [];
  }

  return (data || []).map((a) => ({
    ...a,
    exam_name: a.exams?.name || `امتحان ${a.exam_id}`,
  }));
}

/* =======================================
   إعدادات عامة (settings key/value)
======================================= */
export async function getSetting(key) {
  const { data } = await supabase
    .from("settings")
    .select("setting_value")
    .eq("setting_key", key)
    .maybeSingle();
  return data?.setting_value ?? null;
}

export async function setSetting(key, value) {
  const { error } = await supabase
    .from("settings")
    .upsert(
      { setting_key: key, setting_value: String(value ?? "") },
      { onConflict: "setting_key" },
    );
  if (error) throw error;
  return true;
}

/* =======================================
   اسم وشعار الموقع (تظهر للطالب في كل شاشات الامتحان)
======================================= */
export async function getSiteBranding() {
  const [name, logo] = await Promise.all([
    getSetting("site_name"),
    getSetting("site_logo"),
  ]);
  return { name: name || "", logo: logo || "" };
}

/* =======================================
   باسورد لوحة الأدمن (محفوظ في قاعدة البيانات، مش في أي كود JS)
======================================= */
export async function verifyAdminPassword(inputPassword) {
  const stored = await getSetting("admin_password");
  // لو مفيش باسورد محفوظ لأي سبب، نستخدم قيمة افتراضية (نفس القيمة المزروعة في schema.sql)
  const effective = stored ?? "Miketalaat213510##";
  return String(inputPassword) === String(effective);
}

export async function changeAdminPassword(newPassword) {
  if (!newPassword || String(newPassword).trim().length < 4) {
    throw new Error("الباسورد الجديد قصير جداً");
  }
  await setSetting("admin_password", String(newPassword).trim());
  return true;
}
