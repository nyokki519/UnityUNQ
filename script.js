/* ==========================================================================
   Unity イベントアンケート — script.js
   ==========================================================================
   ★★★ 設定はここだけ変更すればOKです（初心者向け） ★★★
   ========================================================================== */

const CONFIG = {

  // 送信方式を選択してください： "form"（Googleフォーム経由） / "gas"（GAS Webアプリ経由）
  // ・"form" … 一番手軽。Googleフォームを1つ作るだけで、回答は自動的に
  //            そのフォームに紐づくスプレッドシートに溜まります。
  // ・"gas"  … Googleフォームを使わず、Apps Script経由で直接スプレッド
  //            シートに書き込みたい場合はこちら（下部の解説参照）。
  SUBMIT_METHOD: "form",

  // ---- "form" を使う場合の設定 -------------------------------------------
  // 1. Googleフォームを新規作成し、質問を5つ用意する（種類は何でもOK。
  //    回答欄のIDだけ使うので見た目は使いません）
  // 2. フォームの「送信」ボタンを右クリック→「検証」、または
  //    プレビュー画面のHTMLソースを表示して、各質問の
  //    name="entry.XXXXXXXXX" の数字部分を調べる
  //    （一番簡単なのは、フォームを一度提出してみて、ブラウザの
  //     開発者ツール(Network)で送信されたパラメータ名を見る方法です）
  // 3. フォームの「…」メニュー→「事前入力したURLを取得」でも
  //    entry番号を確認できます
  // 4. 下記の GOOGLE_FORM_ACTION_URL は、フォームURLの末尾
  //    「viewform」を「formResponse」に変えたものです
  GOOGLE_FORM_ACTION_URL: "https://docs.google.com/forms/d/e/YOUR_FORM_ID_HERE/formResponse",

  ENTRY_IDS: {
    satisfaction:  "entry.111111111", // Q1 満足度（星の数 1〜5が文字列で送信されます）
    goodPoints:    "entry.222222222", // Q2 良かったところ（複数選択・チェックボックス質問推奨）
    reason:        "entry.333333333", // Q3 参加理由（複数選択・チェックボックス質問推奨）
    futureEvents:  "entry.444444444", // Q4 やってほしいイベント（複数選択・チェックボックス質問推奨）
    freeText:      "entry.555555555"  // Q5 自由記述
  },

  // ---- "gas" を使う場合の設定 ---------------------------------------------
  // Google Apps Script を使ってスプレッドシートに直接保存する方式です。
  // 1. 保存したいGoogleスプレッドシートを開く
  // 2.「拡張機能」→「Apps Script」を開き、このファイル末尾のコメントにある
  //    サンプルコードを貼り付けて保存
  // 3.「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」を選択
  //    - 実行するユーザー：自分
  //    - アクセスできるユーザー：全員
  // 4. 発行されたウェブアプリのURLを下記に貼り付ける
  GAS_WEB_APP_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID_HERE/exec",

  // 送信後、成功したとみなすまでの待機時間（ミリ秒）
  // ※ Googleフォームへのiframe送信はレスポンス内容を読み取れない仕様のため、
  //   一定時間内にネットワークエラーが起きなければ成功として扱います
  SUBMIT_TIMEOUT_MS: 4000
};

/* ==========================================================================
   ここから下はロジックです（通常は変更不要）
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

  /* ---------------------------------------------------------------------
     State
  --------------------------------------------------------------------- */
  const state = {
    currentIndex: 0,           // 0-based question index
    total: 5,
    answers: {
      satisfaction: 0,
      goodPoints: [],
      reason: [],
      futureEvents: [],
      freeText: ""
    },
    isSubmitting: false
  };

  const RING_CIRCUMFERENCE = 2 * Math.PI * 24; // r=24

  /* ---------------------------------------------------------------------
     DOM refs
  --------------------------------------------------------------------- */
  const screenIntro = document.getElementById("screen-intro");
  const screenSurvey = document.getElementById("screen-survey");
  const screenComplete = document.getElementById("screen-complete");

  const btnStart = document.getElementById("btn-start");
  const btnNext = document.getElementById("btn-next");
  const btnNextLabel = document.getElementById("btn-next-label");
  const btnBack = document.getElementById("btn-back");

  const questions = Array.from(document.querySelectorAll(".question"));
  const qError = document.getElementById("q-error");

  const progressLabel = document.getElementById("progress-label");
  const progressRingBar = document.getElementById("progress-ring-bar");

  const starRating = document.getElementById("star-rating");
  const stars = Array.from(starRating.querySelectorAll(".star"));
  const starCaption = document.getElementById("star-caption");
  const starLabels = ["", "うーん、いまいち", "普通でした", "良かったです", "とても良かったです", "最高でした！"];

  const freeText = document.getElementById("free-text");
  const freeTextCount = document.getElementById("free-text-count");

  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");

  const toast = document.getElementById("toast");
  const toastText = document.getElementById("toast-text");
  const toastRetry = document.getElementById("toast-retry");

  const hiddenFrame = document.getElementById("hidden-submit-frame");

  /* ---------------------------------------------------------------------
     Screen navigation (intro → survey → complete)
  --------------------------------------------------------------------- */
  function showScreen(el) {
    [screenIntro, screenSurvey, screenComplete].forEach(s => s.classList.remove("is-active"));
    el.classList.add("is-active");
    window.scrollTo(0, 0);
  }

  btnStart.addEventListener("click", () => {
    showScreen(screenSurvey);
    renderQuestion(0, "in");
  });

  /* ---------------------------------------------------------------------
     Progress ring / label
  --------------------------------------------------------------------- */
  function updateProgress(index) {
    const num = index + 1;
    progressLabel.innerHTML = String(num).padStart(2, "0") +
      '<span class="progress-ring-slash">/0' + state.total + '</span>';
    const ratio = num / state.total;
    const offset = RING_CIRCUMFERENCE * (1 - ratio);
    progressRingBar.style.strokeDashoffset = String(offset);
  }

  /* ---------------------------------------------------------------------
     Render question / navigation buttons
  --------------------------------------------------------------------- */
  function renderQuestion(index) {
    questions.forEach(q => q.classList.remove("is-active"));
    const target = questions[index];
    target.classList.add("is-active");

    updateProgress(index);
    clearError();

    btnBack.classList.toggle("is-hidden", index === 0);
    btnNextLabel.textContent = (index === state.total - 1) ? "回答を送信する" : "次へ";
  }

  function clearError() {
    qError.textContent = "";
  }
  function showError(msg) {
    qError.textContent = msg;
  }

  /* ---------------------------------------------------------------------
     Q1: Star rating
  --------------------------------------------------------------------- */
  function paintStars(value, hoverValue) {
    const active = hoverValue || value;
    stars.forEach(starEl => {
      const v = Number(starEl.dataset.value);
      starEl.classList.toggle("is-filled", v <= active);
      starEl.setAttribute("aria-checked", String(v === value));
    });
  }

  stars.forEach(starEl => {
    const v = Number(starEl.dataset.value);
    starEl.addEventListener("click", () => {
      state.answers.satisfaction = v;
      paintStars(v);
      starCaption.textContent = starLabels[v];
      starCaption.classList.add("is-set");
      clearError();
    });
    starEl.addEventListener("mouseenter", () => paintStars(state.answers.satisfaction, v));
    starEl.addEventListener("mouseleave", () => paintStars(state.answers.satisfaction));
  });

  /* ---------------------------------------------------------------------
     Q2–Q4: Chip multi-select
  --------------------------------------------------------------------- */
  document.querySelectorAll(".chip-group").forEach(group => {
    const key = group.dataset.group;
    group.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const value = chip.dataset.value;
        const list = state.answers[key];
        const pos = list.indexOf(value);
        if (pos === -1) {
          list.push(value);
          chip.classList.add("is-selected");
        } else {
          list.splice(pos, 1);
          chip.classList.remove("is-selected");
        }
        clearError();
      });
    });
  });

  /* ---------------------------------------------------------------------
     Q5: Free text
  --------------------------------------------------------------------- */
  freeText.addEventListener("input", () => {
    state.answers.freeText = freeText.value;
    freeTextCount.textContent = String(freeText.value.length);
  });

  /* ---------------------------------------------------------------------
     Validation per question
  --------------------------------------------------------------------- */
  function validateCurrent() {
    const q = questions[state.currentIndex];
    const key = q.dataset.question;
    const required = q.dataset.required === "true";
    if (!required) return true;

    switch (key) {
      case "1":
        if (!state.answers.satisfaction) {
          showError("満足度を選択してください");
          return false;
        }
        return true;
      case "2":
        if (state.answers.goodPoints.length === 0) {
          showError("1つ以上選択してください");
          return false;
        }
        return true;
      case "3":
        if (state.answers.reason.length === 0) {
          showError("1つ以上選択してください");
          return false;
        }
        return true;
      case "4":
        if (state.answers.futureEvents.length === 0) {
          showError("1つ以上選択してください");
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  /* ---------------------------------------------------------------------
     Next / Back navigation
  --------------------------------------------------------------------- */
  btnNext.addEventListener("click", () => {
    if (state.isSubmitting) return;
    if (!validateCurrent()) return;

    if (state.currentIndex === state.total - 1) {
      submitSurvey();
      return;
    }
    state.currentIndex += 1;
    renderQuestion(state.currentIndex);
  });

  btnBack.addEventListener("click", () => {
    if (state.isSubmitting) return;
    if (state.currentIndex === 0) return;
    state.currentIndex -= 1;
    renderQuestion(state.currentIndex);
  });

  /* ---------------------------------------------------------------------
     Overlay / toast helpers
  --------------------------------------------------------------------- */
  function setOverlay(active, text) {
    overlay.classList.toggle("is-active", active);
    overlay.setAttribute("aria-hidden", String(!active));
    if (text) overlayText.textContent = text;
  }

  let toastTimer = null;
  function showToast(msg) {
    toastText.textContent = msg;
    toast.classList.add("is-active");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-active"), 6000);
  }
  toastRetry.addEventListener("click", () => {
    toast.classList.remove("is-active");
    submitSurvey();
  });

  /* ---------------------------------------------------------------------
     Submission — 二重送信防止 + 方式振り分け
  --------------------------------------------------------------------- */
  function submitSurvey() {
    if (state.isSubmitting) return; // 二重送信防止

    if (!navigator.onLine) {
      showToast("通信環境をご確認のうえ、もう一度お試しください。");
      return;
    }

    state.isSubmitting = true;
    btnNext.disabled = true;
    btnBack.classList.add("is-hidden");
    setOverlay(true, "送信しています…");

    if (CONFIG.SUBMIT_METHOD === "gas") {
      submitViaGAS();
    } else {
      submitViaGoogleForm();
    }
  }

  function onSubmitSuccess() {
    setOverlay(false);
    state.isSubmitting = false;
    btnNext.disabled = false;
    showScreen(screenComplete);
  }

  function onSubmitError() {
    setOverlay(false);
    state.isSubmitting = false;
    btnNext.disabled = false;
    btnBack.classList.toggle("is-hidden", state.currentIndex === 0);
    showToast("送信に失敗しました。お手数ですが、もう一度お試しください。");
  }

  // -- 方式A: Googleフォームへ hidden iframe 経由でPOST（表側は完全オリジナルUI） --
  function submitViaGoogleForm() {
    try {
      const form = document.createElement("form");
      form.action = CONFIG.GOOGLE_FORM_ACTION_URL;
      form.method = "POST";
      form.target = "hidden-submit-frame";
      form.style.display = "none";

      appendField(form, CONFIG.ENTRY_IDS.satisfaction, String(state.answers.satisfaction));
      state.answers.goodPoints.forEach(v => appendField(form, CONFIG.ENTRY_IDS.goodPoints, v));
      state.answers.reason.forEach(v => appendField(form, CONFIG.ENTRY_IDS.reason, v));
      state.answers.futureEvents.forEach(v => appendField(form, CONFIG.ENTRY_IDS.futureEvents, v));
      appendField(form, CONFIG.ENTRY_IDS.freeText, state.answers.freeText);

      document.body.appendChild(form);

      // Googleフォームへのiframe送信はクロスオリジンのためレスポンスを読めない。
      // ネットワークエラーが出ずに一定時間経過したら成功とみなす。
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; onSubmitSuccess(); }
        form.remove();
      }, CONFIG.SUBMIT_TIMEOUT_MS);

      hiddenFrame.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          onSubmitSuccess();
        }
        form.remove();
      };

      form.submit();
    } catch (err) {
      console.error("Unity survey submit error:", err);
      onSubmitError();
    }
  }

  function appendField(form, name, value) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  // -- 方式B: GAS Webアプリへ fetch でPOST -----------------------------------
  function submitViaGAS() {
    const payload = {
      satisfaction: state.answers.satisfaction,
      goodPoints: state.answers.goodPoints,
      reason: state.answers.reason,
      futureEvents: state.answers.futureEvents,
      freeText: state.answers.freeText,
      submittedAt: new Date().toISOString()
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.SUBMIT_TIMEOUT_MS + 4000);

    fetch(CONFIG.GAS_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors", // GAS Webアプリはno-corsで送るのが最も確実（レスポンスは読めないが到達は可能）
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
      .then(() => {
        clearTimeout(timer);
        onSubmitSuccess();
      })
      .catch(err => {
        clearTimeout(timer);
        console.error("Unity survey GAS submit error:", err);
        onSubmitError();
      });
  }

});

/* ==========================================================================
   参考: GAS（Google Apps Script）でスプレッドシートに保存する場合のコード例
   ==========================================================================
   スプレッドシートの「拡張機能」→「Apps Script」に以下を貼り付けてデプロイ
   （SUBMIT_METHOD を "gas" にした場合のみ必要です）
   --------------------------------------------------------------------------

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("回答");
  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    new Date(),
    data.satisfaction,
    (data.goodPoints || []).join(", "),
    (data.reason || []).join(", "),
    (data.futureEvents || []).join(", "),
    data.freeText || ""
  ]);

  return ContentService.createTextOutput(
    JSON.stringify({ result: "success" })
  ).setMimeType(ContentService.MimeType.JSON);
}

   -------------------------------------------------------------------------- */
