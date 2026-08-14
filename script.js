/* ==========================================================================
   Unity イベントアンケート — script.js 完全版

   【仕様】
   ・Googleフォームへ回答を送信
   ・回答完了後にUNITY DROPを表示
   ・UNITY DROPのイベントIDは「日付」
   ・URLに ?event=YYYYMMDD があれば、そのIDを優先
   ・eventが無ければ日本時間の「今日の日付」を自動使用
   ・イベント内容には一切依存しない
   ========================================================================== */


const CONFIG = {

  /* ------------------------------------------------------------------------
     Googleフォーム
     ------------------------------------------------------------------------ */

  GOOGLE_FORM_ACTION_URL:
    "https://docs.google.com/forms/d/e/1FAIpQLSdGJYCsiK7BvL0WdmQLZ4GWwv121g6UvAB5nGTCeAC4L6Msbg/formResponse",

  ENTRY_IDS: {
    satisfaction: "entry.981625418",
    goodPoints: "entry.843466021",
    reason: "entry.616791735",
    futureEvents: "entry.768694423",
    freeText: "entry.1967207820"
  },

  /* Googleフォーム送信待機時間 */
  SUBMIT_TIMEOUT_MS: 4000,


  /* ------------------------------------------------------------------------
     UNITY DROP
     ------------------------------------------------------------------------ */

  UNITY_DROP_URL:
    "https://nyokki519.github.io/Unity-DROP/"
};


/* ==========================================================================
   DOM READY
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {


  /* =========================================================================
     STATE
     ========================================================================= */

  const state = {

    currentIndex: 0,

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


  /* =========================================================================
     DOM
     ========================================================================= */

  const screenIntro =
    document.getElementById("screen-intro");

  const screenSurvey =
    document.getElementById("screen-survey");

  const screenComplete =
    document.getElementById("screen-complete");


  const btnStart =
    document.getElementById("btn-start");

  const btnNext =
    document.getElementById("btn-next");

  const btnNextLabel =
    document.getElementById("btn-next-label");

  const btnBack =
    document.getElementById("btn-back");


  const questions =
    Array.from(
      document.querySelectorAll(".question")
    );


  const qError =
    document.getElementById("q-error");


  const progressLabel =
    document.getElementById("progress-label");

  const progressRingBar =
    document.getElementById("progress-ring-bar");


  const starRating =
    document.getElementById("star-rating");

  const stars =
    Array.from(
      starRating.querySelectorAll(".star")
    );

  const starCaption =
    document.getElementById("star-caption");


  const freeText =
    document.getElementById("free-text");

  const freeTextCount =
    document.getElementById("free-text-count");


  const overlay =
    document.getElementById("overlay");

  const overlayText =
    document.getElementById("overlay-text");


  const toast =
    document.getElementById("toast");

  const toastText =
    document.getElementById("toast-text");

  const toastRetry =
    document.getElementById("toast-retry");


  const hiddenFrame =
    document.getElementById("hidden-submit-frame");


  /* =========================================================================
     UNITY DROP DOM
     ========================================================================= */

  const dropCta =
    document.getElementById("drop-cta");

  const dropCtaLink =
    document.getElementById("drop-cta-link");


  /* =========================================================================
     UNITY DROP EVENT ID
     
     優先順位：

     ① URLに ?event=20260816 がある
        ↓
        20260816を使用

     ② URLにeventがない
        ↓
        日本時間の今日の日付を使用

     例：

     2026年8月14日
     ↓
     20260814
     ========================================================================= */

  function getEventId() {

    const params =
      new URLSearchParams(
        window.location.search
      );


    /* -----------------------------------------------------------------------
       URLにeventが指定されている場合
       ----------------------------------------------------------------------- */

    const urlEventId =
      params.get("event");


    if (
      urlEventId &&
      /^\d{8}$/.test(urlEventId)
    ) {

      return urlEventId;
    }


    /* -----------------------------------------------------------------------
       eventが無い場合
       日本時間の日付を自動生成
       ----------------------------------------------------------------------- */

    const now =
      new Date();


    const japanDate =
      new Date(
        now.toLocaleString(
          "en-US",
          {
            timeZone: "Asia/Tokyo"
          }
        )
      );


    const year =
      japanDate.getFullYear();


    const month =
      String(
        japanDate.getMonth() + 1
      ).padStart(2, "0");


    const day =
      String(
        japanDate.getDate()
      ).padStart(2, "0");


    return `${year}${month}${day}`;
  }


  /* =========================================================================
     UNITY DROP CTA設定
     ========================================================================= */

  function setupDropCta() {

    if (
      !dropCta ||
      !dropCtaLink
    ) {

      console.warn(
        "UNITY DROP CTA elements not found."
      );

      return;
    }


    const eventId =
      getEventId();


    /* -----------------------------------------------------------------------
       DROP URLを生成
       ----------------------------------------------------------------------- */

    const dropUrl =
      new URL(
        CONFIG.UNITY_DROP_URL
      );


    /* -----------------------------------------------------------------------
       日付イベントIDを渡す
       ----------------------------------------------------------------------- */

    dropUrl.searchParams.set(
      "event",
      eventId
    );


    /* -----------------------------------------------------------------------
       ボタンへURL設定
       ----------------------------------------------------------------------- */

    dropCtaLink.href =
      dropUrl.toString();


    dropCtaLink.target =
      "_self";


    /* -----------------------------------------------------------------------
       DROP案内を表示
       ----------------------------------------------------------------------- */

    dropCta.hidden =
      false;


    console.log(
      "UNITY DROP event ID:",
      eventId
    );


    console.log(
      "UNITY DROP URL:",
      dropCtaLink.href
    );
  }


  /* =========================================================================
     SCREEN
     ========================================================================= */

  function showScreen(el) {

    [
      screenIntro,
      screenSurvey,
      screenComplete
    ].forEach(screen => {

      screen.classList.remove(
        "is-active"
      );
    });


    el.classList.add(
      "is-active"
    );


    window.scrollTo(
      0,
      0
    );
  }


  /* =========================================================================
     START
     ========================================================================= */

  btnStart.addEventListener(
    "click",
    () => {

      showScreen(
        screenSurvey
      );

      renderQuestion(0);
    }
  );


  /* =========================================================================
     PROGRESS
     ========================================================================= */

  const RING_CIRCUMFERENCE =
    2 * Math.PI * 24;


  function updateProgress(index) {

    const num =
      index + 1;


    progressLabel.innerHTML =
      String(num).padStart(2, "0") +
      '<span class="progress-ring-slash">/0' +
      state.total +
      "</span>";


    const ratio =
      num / state.total;


    const offset =
      RING_CIRCUMFERENCE *
      (1 - ratio);


    progressRingBar.style.strokeDashoffset =
      String(offset);
  }


  /* =========================================================================
     QUESTION RENDER
     ========================================================================= */

  function renderQuestion(index) {

    questions.forEach(question => {

      question.classList.remove(
        "is-active"
      );
    });


    const target =
      questions[index];


    target.classList.add(
      "is-active"
    );


    updateProgress(
      index
    );


    clearError();


    btnBack.classList.toggle(
      "is-hidden",
      index === 0
    );


    btnNextLabel.textContent =
      index === state.total - 1
        ? "回答を送信する"
        : "次へ";
  }


  /* =========================================================================
     ERROR
     ========================================================================= */

  function clearError() {

    qError.textContent =
      "";
  }


  function showError(message) {

    qError.textContent =
      message;
  }


  /* =========================================================================
     Q1 STAR
     ========================================================================= */

  const starLabels = [

    "",

    "うーん、いまいち",

    "普通でした",

    "良かったです",

    "とても良かったです",

    "最高でした！"
  ];


  function paintStars(
    value,
    hoverValue
  ) {

    const active =
      hoverValue ||
      value;


    stars.forEach(starEl => {

      const v =
        Number(
          starEl.dataset.value
        );


      starEl.classList.toggle(
        "is-filled",
        v <= active
      );


      starEl.setAttribute(
        "aria-checked",
        String(
          v === value
        )
      );
    });
  }


  stars.forEach(starEl => {

    const v =
      Number(
        starEl.dataset.value
      );


    starEl.addEventListener(
      "click",
      () => {

        state.answers.satisfaction =
          v;


        paintStars(v);


        starCaption.textContent =
          starLabels[v];


        starCaption.classList.add(
          "is-set"
        );


        clearError();
      }
    );


    starEl.addEventListener(
      "mouseenter",
      () => {

        paintStars(
          state.answers.satisfaction,
          v
        );
      }
    );


    starEl.addEventListener(
      "mouseleave",
      () => {

        paintStars(
          state.answers.satisfaction
        );
      }
    );
  });


  /* =========================================================================
     Q2〜Q4 CHIP
     ========================================================================= */

  document
    .querySelectorAll(".chip-group")
    .forEach(group => {

      const key =
        group.dataset.group;


      group
        .querySelectorAll(".chip")
        .forEach(chip => {

          chip.addEventListener(
            "click",
            () => {

              const value =
                chip.dataset.value;


              const list =
                state.answers[key];


              const pos =
                list.indexOf(value);


              if (pos === -1) {

                list.push(
                  value
                );


                chip.classList.add(
                  "is-selected"
                );

              } else {

                list.splice(
                  pos,
                  1
                );


                chip.classList.remove(
                  "is-selected"
                );
              }


              clearError();
            }
          );
        });
    });


  /* =========================================================================
     Q5 FREE TEXT
     ========================================================================= */

  freeText.addEventListener(
    "input",
    () => {

      state.answers.freeText =
        freeText.value;


      freeTextCount.textContent =
        String(
          freeText.value.length
        );
    }
  );


  /* =========================================================================
     VALIDATION
     ========================================================================= */

  function validateCurrent() {

    const q =
      questions[
        state.currentIndex
      ];


    const key =
      q.dataset.question;


    const required =
      q.dataset.required ===
      "true";


    if (!required) {

      return true;
    }


    switch (key) {

      case "1":

        if (
          !state.answers.satisfaction
        ) {

          showError(
            "満足度を選択してください"
          );

          return false;
        }

        return true;


      case "2":

        if (
          state.answers.goodPoints.length === 0
        ) {

          showError(
            "1つ以上選択してください"
          );

          return false;
        }

        return true;


      case "3":

        if (
          state.answers.reason.length === 0
        ) {

          showError(
            "1つ以上選択してください"
          );

          return false;
        }

        return true;


      case "4":

        if (
          state.answers.futureEvents.length === 0
        ) {

          showError(
            "1つ以上選択してください"
          );

          return false;
        }

        return true;


      default:

        return true;
    }
  }


  /* =========================================================================
     NEXT
     ========================================================================= */

  btnNext.addEventListener(
    "click",
    () => {

      if (
        state.isSubmitting
      ) {

        return;
      }


      if (
        !validateCurrent()
      ) {

        return;
      }


      if (
        state.currentIndex ===
        state.total - 1
      ) {

        submitSurvey();

        return;
      }


      state.currentIndex += 1;


      renderQuestion(
        state.currentIndex
      );
    }
  );


  /* =========================================================================
     BACK
     ========================================================================= */

  btnBack.addEventListener(
    "click",
    () => {

      if (
        state.isSubmitting
      ) {

        return;
      }


      if (
        state.currentIndex === 0
      ) {

        return;
      }


      state.currentIndex -= 1;


      renderQuestion(
        state.currentIndex
      );
    }
  );


  /* =========================================================================
     OVERLAY
     ========================================================================= */

  function setOverlay(
    active,
    text
  ) {

    overlay.classList.toggle(
      "is-active",
      active
    );


    overlay.setAttribute(
      "aria-hidden",
      String(!active)
    );


    if (text) {

      overlayText.textContent =
        text;
    }
  }


  /* =========================================================================
     TOAST
     ========================================================================= */

  let toastTimer = null;


  function showToast(message) {

    toastText.textContent =
      message;


    toast.classList.add(
      "is-active"
    );


    clearTimeout(
      toastTimer
    );


    toastTimer =
      setTimeout(
        () => {

          toast.classList.remove(
            "is-active"
          );

        },
        6000
      );
  }


  toastRetry.addEventListener(
    "click",
    () => {

      toast.classList.remove(
        "is-active"
      );


      submitSurvey();
    }
  );


  /* =========================================================================
     SUBMIT SURVEY
     ========================================================================= */

  function submitSurvey() {

    if (
      state.isSubmitting
    ) {

      return;
    }


    if (
      !navigator.onLine
    ) {

      showToast(
        "通信環境をご確認のうえ、もう一度お試しください。"
      );

      return;
    }


    state.isSubmitting =
      true;


    btnNext.disabled =
      true;


    btnBack.classList.add(
      "is-hidden"
    );


    setOverlay(
      true,
      "送信しています…"
    );


    submitViaGoogleForm();
  }


  /* =========================================================================
     SUBMIT SUCCESS
     ========================================================================= */

  function onSubmitSuccess() {

    setOverlay(
      false
    );


    state.isSubmitting =
      false;


    btnNext.disabled =
      false;


    showScreen(
      screenComplete
    );


    /* -----------------------------------------------------------------------
       ここで必ずDROPを設定
       ----------------------------------------------------------------------- */

    setupDropCta();
  }


  /* =========================================================================
     SUBMIT ERROR
     ========================================================================= */

  function onSubmitError() {

    setOverlay(
      false
    );


    state.isSubmitting =
      false;


    btnNext.disabled =
      false;


    btnBack.classList.toggle(
      "is-hidden",
      state.currentIndex === 0
    );


    showToast(
      "送信に失敗しました。お手数ですが、もう一度お試しください。"
    );
  }


  /* =========================================================================
     GOOGLE FORM SUBMIT
     ========================================================================= */

  function submitViaGoogleForm() {

    try {

      const form =
        document.createElement(
          "form"
        );


      form.action =
        CONFIG.GOOGLE_FORM_ACTION_URL;


      form.method =
        "POST";


      form.target =
        "hidden-submit-frame";


      form.style.display =
        "none";


      /* Q1 */

      appendField(
        form,
        CONFIG.ENTRY_IDS.satisfaction,
        String(
          state.answers.satisfaction
        )
      );


      /* Q2 */

      state.answers.goodPoints.forEach(
        value => {

          appendField(
            form,
            CONFIG.ENTRY_IDS.goodPoints,
            value
          );
        }
      );


      /* Q3 */

      state.answers.reason.forEach(
        value => {

          appendField(
            form,
            CONFIG.ENTRY_IDS.reason,
            value
          );
        }
      );


      /* Q4 */

      state.answers.futureEvents.forEach(
        value => {

          appendField(
            form,
            CONFIG.ENTRY_IDS.futureEvents,
            value
          );
        }
      );


      /* Q5 */

      appendField(
        form,
        CONFIG.ENTRY_IDS.freeText,
        state.answers.freeText
      );


      document.body.appendChild(
        form
      );


      let settled =
        false;


      const timer =
        setTimeout(
          () => {

            if (!settled) {

              settled =
                true;


              onSubmitSuccess();
            }


            form.remove();

          },
          CONFIG.SUBMIT_TIMEOUT_MS
        );


      hiddenFrame.onload =
        () => {

          if (!settled) {

            settled =
              true;


            clearTimeout(
              timer
            );


            onSubmitSuccess();
          }


          form.remove();
        };


      form.submit();


    } catch (err) {

      console.error(
        "Unity survey submit error:",
        err
      );


      onSubmitError();
    }
  }


  /* =========================================================================
     HIDDEN FORM FIELD
     ========================================================================= */

  function appendField(
    form,
    name,
    value
  ) {

    const input =
      document.createElement(
        "input"
      );


    input.type =
      "hidden";


    input.name =
      name;


    input.value =
      value;


    form.appendChild(
      input
    );
  }


});
