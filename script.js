/* ==========================================================================
   Unity イベントアンケート — script.js
   Googleフォーム連携 + UNITY DROP
   ========================================================================== */

const CONFIG = {
  GOOGLE_FORM_ACTION_URL: "https://docs.google.com/forms/d/e/1FAIpQLSdGJYCsiK7BvL0WdmQLZ4GWwv121g6UvAB5nGTCeAC4L6Msbg/formResponse",

  ENTRY_IDS: {
    satisfaction:  "entry.981625418",
    goodPoints:    "entry.843466021",
    reason:        "entry.616791735",
    futureEvents:  "entry.768694423",
    freeText:      "entry.1967207820"
  },

  // 送信後、成功したとみなすまでの待機時間（ミリ秒）
  SUBMIT_TIMEOUT_MS: 4000,

  // UNITY DROP
  UNITY_DROP_URL: "https://nyokki519.github.io/Unity-DROP/"
};


/* ==========================================================================
   ここから下はロジックです（通常は変更不要）
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

  /* ---------------------------------------------------------------------
     State
  --------------------------------------------------------------------- */

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

  const RING_CIRCUMFERENCE =
    2 * Math.PI * 24;


  /* ---------------------------------------------------------------------
     DOM refs
  --------------------------------------------------------------------- */

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


  const starLabels = [
    "",
    "うーん、いまいち",
    "普通でした",
    "良かったです",
    "とても良かったです",
    "最高でした！"
  ];


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


  /* ---------------------------------------------------------------------
     UNITY DROP
  --------------------------------------------------------------------- */

  const dropCta =
    document.getElementById("drop-cta");

  const dropCtaLink =
    document.getElementById("drop-cta-link");


  function setupDropCta() {

    if (!dropCta || !dropCtaLink) return;

    // イベントIDなどは一切使用せず、
    // 常に共通のUNITY DROPへリンク
    dropCtaLink.href =
      CONFIG.UNITY_DROP_URL;

    dropCta.hidden = false;

  }


  /* ---------------------------------------------------------------------
     Screen navigation
  --------------------------------------------------------------------- */

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


  btnStart.addEventListener(
    "click",
    () => {

      showScreen(
        screenSurvey
      );

      renderQuestion(0);

    }
  );


  /* ---------------------------------------------------------------------
     Progress ring / label
  --------------------------------------------------------------------- */

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


  /* ---------------------------------------------------------------------
     Render question
  --------------------------------------------------------------------- */

  function renderQuestion(index) {

    questions.forEach(
      question => {

        question.classList.remove(
          "is-active"
        );

      }
    );


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


  function clearError() {

    qError.textContent =
      "";

  }


  function showError(msg) {

    qError.textContent =
      msg;

  }


  /* ---------------------------------------------------------------------
     Q1 Star rating
  --------------------------------------------------------------------- */

  function paintStars(
    value,
    hoverValue
  ) {

    const active =
      hoverValue || value;


    stars.forEach(
      starEl => {

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

      }
    );

  }


  stars.forEach(
    starEl => {

      const v =
        Number(
          starEl.dataset.value
        );


      starEl.addEventListener(
        "click",
        () => {

          state.answers.satisfaction =
            v;


          paintStars(
            v
          );


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

    }
  );


  /* ---------------------------------------------------------------------
     Q2〜Q4 Chip multi-select
  --------------------------------------------------------------------- */

  document
    .querySelectorAll(".chip-group")
    .forEach(
      group => {

        const key =
          group.dataset.group;


        group
          .querySelectorAll(".chip")
          .forEach(
            chip => {

              chip.addEventListener(
                "click",
                () => {

                  const value =
                    chip.dataset.value;


                  const list =
                    state.answers[key];


                  const pos =
                    list.indexOf(
                      value
                    );


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

            }
          );

      }
    );


  /* ---------------------------------------------------------------------
     Q5 Free text
  --------------------------------------------------------------------- */

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


  /* ---------------------------------------------------------------------
     Validation
  --------------------------------------------------------------------- */

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


    if (!required) return true;


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


  /* ---------------------------------------------------------------------
     Next
  --------------------------------------------------------------------- */

  btnNext.addEventListener(
    "click",
    () => {

      if (
        state.isSubmitting
      ) return;


      if (
        !validateCurrent()
      ) return;


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


  /* ---------------------------------------------------------------------
     Back
  --------------------------------------------------------------------- */

  btnBack.addEventListener(
    "click",
    () => {

      if (
        state.isSubmitting
      ) return;


      if (
        state.currentIndex === 0
      ) return;


      state.currentIndex -= 1;


      renderQuestion(
        state.currentIndex
      );

    }
  );


  /* ---------------------------------------------------------------------
     Overlay
  --------------------------------------------------------------------- */

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
      String(
        !active
      )
    );


    if (text) {

      overlayText.textContent =
        text;

    }

  }


  /* ---------------------------------------------------------------------
     Toast
  --------------------------------------------------------------------- */

  let toastTimer = null;


  function showToast(msg) {

    toastText.textContent =
      msg;


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


  /* ---------------------------------------------------------------------
     Submit
  --------------------------------------------------------------------- */

  function submitSurvey() {

    if (
      state.isSubmitting
    ) return;


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


  /* ---------------------------------------------------------------------
     Submit success
  --------------------------------------------------------------------- */

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


    // 完了画面でUNITY DROPを表示
    setupDropCta();

  }


  /* ---------------------------------------------------------------------
     Submit error
  --------------------------------------------------------------------- */

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


  /* ---------------------------------------------------------------------
     Google Form submit
  --------------------------------------------------------------------- */

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


      appendField(
        form,
        CONFIG.ENTRY_IDS.satisfaction,
        String(
          state.answers.satisfaction
        )
      );


      state.answers.goodPoints.forEach(
        v => {

          appendField(
            form,
            CONFIG.ENTRY_IDS.goodPoints,
            v
          );

        }
      );


      state.answers.reason.forEach(
        v => {

          appendField(
            form,
            CONFIG.ENTRY_IDS.reason,
            v
          );

        }
      );


      state.answers.futureEvents.forEach(
        v => {

          appendField(
            form,
            CONFIG.ENTRY_IDS.futureEvents,
            v
          );

        }
      );


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


  /* ---------------------------------------------------------------------
     Hidden form field
  --------------------------------------------------------------------- */

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
