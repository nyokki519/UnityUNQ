/**
 * ============================================================================
 * UNITY DROP — バックエンド (Google Apps Script)
 * ============================================================================
 *
 * ★ このファイルは「UNITY DROP専用の新しいスプレッドシート」に紐づけて使います。
 *   既存のアンケート用スプレッドシートとは完全に別物です（絶対に混ぜないでください）。
 *
 * ---- セットアップ手順 ------------------------------------------------------
 * 1. 新しいGoogleスプレッドシートを作成する（例：「UNITY DROP DB」）
 * 2. 「拡張機能」→「Apps Script」を開く
 * 3. デフォルトの Code.gs の中身を全部消して、このファイルの内容を貼り付ける
 * 4. 上部の「プロジェクトの設定」（歯車アイコン）→「スクリプト プロパティ」で
 *    以下を追加：
 *      キー: ADMIN_PASSCODE   値: 好きな管理者用パスコード（例: unity2026admin）
 * 5. エディタ上部の関数選択で「setupSheets」を選び、実行（▶）する
 *    → 初回だけ「承認が必要です」と出るので、自分のGoogleアカウントで承認する
 *    → 実行するとシートに Events / Prizes / Results / PointHistory の
 *      4つのタブが自動作成されます
 * 6. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      実行するユーザー：自分
 *      アクセスできるユーザー：全員
 * 7. 発行されたウェブアプリのURLを、フロントエンド（script.js）の
 *    CONFIG.API_BASE_URL に貼り付ける
 *
 * ---- 設計メモ ---------------------------------------------------------------
 * ・抽選は必ずこのサーバー側コードで確定します（ブラウザ側では一切決定しません）
 * ・LockService で排他制御し、同時アクセスでも景品が二重当選しないようにしています
 * ・「1イベント1回」は端末ごとに発行する deviceId を主な技術的な歯止めとして使います
 *   （名前だけでは正式な本人認証にならないため、名前の重複はあくまで警告に留めます）
 * ============================================================================
 */

const SHEET_NAMES = {
  EVENTS: "Events",
  PRIZES: "Prizes",
  RESULTS: "Results",
  POINT_HISTORY: "PointHistory"
};

const EVENT_STATUS = {
  PREP: "準備中",
  LIVE: "開催中",
  CLOSED: "終了"
};

/* ============================================================================
   初期セットアップ（初回に1回だけ手動実行）
   ========================================================================== */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const defs = {
    [SHEET_NAMES.EVENTS]: ["event_id", "event_name", "event_date", "expected_count", "status", "created_at"],
    [SHEET_NAMES.PRIZES]: ["prize_id", "event_id", "rank", "prize_name", "quantity", "remaining_quantity", "points", "description", "image", "rarity", "effect_level"],
    [SHEET_NAMES.RESULTS]: ["result_id", "event_id", "device_id", "participant_name", "prize_id", "rank", "prize_name", "points", "created_at"],
    [SHEET_NAMES.POINT_HISTORY]: ["history_id", "event_id", "device_id", "participant_name", "points", "type", "created_at"]
  };

  Object.entries(defs).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  });

  Logger.log("セットアップ完了。Events / Prizes / Results / PointHistory を作成しました。");
}

/* ============================================================================
   エントリーポイント
   ========================================================================== */
function doGet(e) {
  return handleRequest(e, "GET");
}
function doPost(e) {
  const params = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  return handleRequest({ parameter: params }, "POST");
}

function handleRequest(e, method) {
  const action = (e.parameter && e.parameter.action) || "";
  try {
    let result;
    switch (action) {
      // ---- 参加者向け（認証不要） ----
      case "getEvent": result = actionGetEvent(e.parameter); break;
      case "checkName": result = actionCheckName(e.parameter); break;
      case "openDrop": result = actionOpenDrop(e.parameter); break;

      // ---- 管理者向け（パスコード必須） ----
      case "adminListEvents": result = withAdmin(e.parameter, actionAdminListEvents); break;
      case "adminCreateEvent": result = withAdmin(e.parameter, actionAdminCreateEvent); break;
      case "adminUpdateEventStatus": result = withAdmin(e.parameter, actionAdminUpdateEventStatus); break;
      case "adminGetPrizes": result = withAdmin(e.parameter, actionAdminGetPrizes); break;
      case "adminSavePrizes": result = withAdmin(e.parameter, actionAdminSavePrizes); break;
      case "adminCopyPrizes": result = withAdmin(e.parameter, actionAdminCopyPrizes); break;
      case "adminGetResults": result = withAdmin(e.parameter, actionAdminGetResults); break;

      default: throw new ApiError("不明なアクションです: " + action);
    }
    return jsonOutput({ ok: true, data: result });
  } catch (err) {
    return jsonOutput({ ok: false, error: (err && err.message) || String(err) });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ApiError(message) {
  this.message = message;
}
ApiError.prototype = Object.create(Error.prototype);

function withAdmin(params, fn) {
  const passcode = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSCODE");
  if (!passcode || params.pass !== passcode) {
    throw new ApiError("管理者パスコードが正しくありません。");
  }
  return fn(params);
}

/* ============================================================================
   シート操作ヘルパー
   ========================================================================== */
function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new ApiError(`シート「${name}」が見つかりません。先にsetupSheetsを実行してください。`);
  return sheet;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== "" && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function findRowIndexById(sheet, idColName, idValue) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf(idColName);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(idValue)) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function nowIso() {
  return new Date().toISOString();
}

/* ============================================================================
   参加者向けアクション
   ========================================================================== */
function actionGetEvent(params) {
  const eventId = requireParam(params, "eventId");
  const events = sheetToObjects(getSheet(SHEET_NAMES.EVENTS));
  const event = events.find(ev => String(ev.event_id) === String(eventId));
  if (!event) throw new ApiError("イベントが見つかりません。");
  return {
    eventId: event.event_id,
    eventName: event.event_name,
    eventDate: event.event_date,
    status: event.status
  };
}

function actionCheckName(params) {
  const eventId = requireParam(params, "eventId");
  const name = requireParam(params, "name").trim();
  const results = sheetToObjects(getSheet(SHEET_NAMES.RESULTS));
  const duplicate = results.some(r => String(r.event_id) === String(eventId) && String(r.participant_name).trim() === name);
  return { duplicate };
}

function actionOpenDrop(params) {
  const eventId = requireParam(params, "eventId");
  const name = requireParam(params, "name").trim();
  const deviceId = requireParam(params, "deviceId");

  if (!name) throw new ApiError("名前を入力してください。");

  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(15000);
  if (!gotLock) throw new ApiError("混み合っています。少し待ってからもう一度お試しください。");

  try {
    // --- イベント確認 ---
    const eventSheet = getSheet(SHEET_NAMES.EVENTS);
    const events = sheetToObjects(eventSheet);
    const event = events.find(ev => String(ev.event_id) === String(eventId));
    if (!event) throw new ApiError("存在しないイベントです。");
    if (event.status !== EVENT_STATUS.LIVE) {
      throw new ApiError("このイベントのDROPは現在ご利用いただけません（開催中のイベントのみ参加できます）。");
    }

    // --- 同一端末での重複DROP確認 ---
    const resultSheet = getSheet(SHEET_NAMES.RESULTS);
    const results = sheetToObjects(resultSheet);
    const already = results.find(r => String(r.event_id) === String(eventId) && String(r.device_id) === String(deviceId));
    if (already) {
      throw new ApiError("この端末では、このイベントのDROPはすでに完了しています。");
    }

    // --- 景品プール構築（残数のあるものだけ） ---
    const prizeSheet = getSheet(SHEET_NAMES.PRIZES);
    const allPrizes = sheetToObjects(prizeSheet).filter(p => String(p.event_id) === String(eventId));
    if (allPrizes.length === 0) throw new ApiError("このイベントには景品が設定されていません。");

    const pool = [];
    allPrizes.forEach(p => {
      const remaining = Number(p.remaining_quantity) || 0;
      for (let i = 0; i < remaining; i++) pool.push(p);
    });
    if (pool.length === 0) throw new ApiError("残念ながら、景品はすべて出尽くしました。");

    // --- 抽選 ---
    const winner = pool[Math.floor(Math.random() * pool.length)];

    // --- 景品残数を1減らす ---
    const prizeRow = findRowIndexById(prizeSheet, "prize_id", winner.prize_id);
    const headers = prizeSheet.getRange(1, 1, 1, prizeSheet.getLastColumn()).getValues()[0];
    const remainingCol = headers.indexOf("remaining_quantity") + 1;
    const currentRemaining = prizeSheet.getRange(prizeRow, remainingCol).getValue();
    prizeSheet.getRange(prizeRow, remainingCol).setValue(Number(currentRemaining) - 1);

    // --- 結果を保存 ---
    const resultId = newId("res");
    const createdAt = nowIso();
    resultSheet.appendRow([
      resultId, eventId, deviceId, name, winner.prize_id, winner.rank, winner.prize_name, winner.points, createdAt
    ]);

    // --- ポイント履歴を保存 ---
    getSheet(SHEET_NAMES.POINT_HISTORY).appendRow([
      newId("pt"), eventId, deviceId, name, winner.points, "drop_win", createdAt
    ]);

    return {
      resultId,
      rank: winner.rank,
      prizeName: winner.prize_name,
      points: Number(winner.points) || 0,
      description: winner.description || "",
      rarity: winner.rarity || "",
      effectLevel: winner.effect_level || "",
      participantName: name
    };
  } finally {
    lock.releaseLock();
  }
}

function requireParam(params, key) {
  const v = params && params[key];
  if (v === undefined || v === null || String(v).trim() === "") {
    throw new ApiError(`パラメータ「${key}」が不足しています。`);
  }
  return String(v);
}

/* ============================================================================
   管理者向けアクション
   ========================================================================== */
function actionAdminListEvents() {
  const events = sheetToObjects(getSheet(SHEET_NAMES.EVENTS));
  const prizes = sheetToObjects(getSheet(SHEET_NAMES.PRIZES));
  return events.map(ev => {
    const evPrizes = prizes.filter(p => String(p.event_id) === String(ev.event_id));
    const totalPrizes = evPrizes.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
    return { ...ev, totalPrizes };
  }).sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
}

function actionAdminCreateEvent(params) {
  const eventName = requireParam(params, "eventName");
  const eventDate = requireParam(params, "eventDate");
  const expectedCount = Number(params.expectedCount) || 0;

  const eventId = newId("evt");
  getSheet(SHEET_NAMES.EVENTS).appendRow([eventId, eventName, eventDate, expectedCount, EVENT_STATUS.PREP, nowIso()]);
  return { eventId };
}

function actionAdminUpdateEventStatus(params) {
  const eventId = requireParam(params, "eventId");
  const status = requireParam(params, "status");
  if (!Object.values(EVENT_STATUS).includes(status)) throw new ApiError("不正なステータスです。");

  const sheet = getSheet(SHEET_NAMES.EVENTS);
  const row = findRowIndexById(sheet, "event_id", eventId);
  if (row === -1) throw new ApiError("イベントが見つかりません。");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusCol = headers.indexOf("status") + 1;
  sheet.getRange(row, statusCol).setValue(status);
  return { ok: true };
}

function actionAdminGetPrizes(params) {
  const eventId = requireParam(params, "eventId");
  const prizes = sheetToObjects(getSheet(SHEET_NAMES.PRIZES))
    .filter(p => String(p.event_id) === String(eventId))
    .sort((a, b) => Number(a.rank) - Number(b.rank));
  return { prizes };
}

function actionAdminSavePrizes(params) {
  const eventId = requireParam(params, "eventId");
  const prizesInput = params.prizes; // 配列（POST bodyはJSONなのでそのままオブジェクト）
  if (!Array.isArray(prizesInput)) throw new ApiError("prizesが不正な形式です。");

  const eventSheet = getSheet(SHEET_NAMES.EVENTS);
  const events = sheetToObjects(eventSheet);
  const event = events.find(ev => String(ev.event_id) === String(eventId));
  if (!event) throw new ApiError("イベントが見つかりません。");
  if (event.status !== EVENT_STATUS.PREP) {
    throw new ApiError("「準備中」のイベントのみ景品設定を変更できます。");
  }

  const prizeSheet = getSheet(SHEET_NAMES.PRIZES);
  const values = prizeSheet.getDataRange().getValues();
  const headers = values[0];
  const eventIdCol = headers.indexOf("event_id");

  // 既存の当イベント分の行を削除（下から）
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][eventIdCol]) === String(eventId)) {
      prizeSheet.deleteRow(i + 1);
    }
  }

  // 新規追加
  prizesInput.forEach(p => {
    const quantity = Number(p.quantity) || 0;
    prizeSheet.appendRow([
      newId("prz"), eventId, Number(p.rank), p.prizeName || "", quantity, quantity,
      Number(p.points) || 0, p.description || "", p.image || "", p.rarity || "", p.effectLevel || ""
    ]);
  });

  return { ok: true, count: prizesInput.length };
}

function actionAdminCopyPrizes(params) {
  const fromEventId = requireParam(params, "fromEventId");
  const toEventId = requireParam(params, "toEventId");

  const eventSheet = getSheet(SHEET_NAMES.EVENTS);
  const events = sheetToObjects(eventSheet);
  const toEvent = events.find(ev => String(ev.event_id) === String(toEventId));
  if (!toEvent) throw new ApiError("コピー先イベントが見つかりません。");
  if (toEvent.status !== EVENT_STATUS.PREP) {
    throw new ApiError("「準備中」のイベントにのみコピーできます。");
  }

  const sourcePrizes = sheetToObjects(getSheet(SHEET_NAMES.PRIZES))
    .filter(p => String(p.event_id) === String(fromEventId));
  if (sourcePrizes.length === 0) throw new ApiError("コピー元に景品設定がありません。");

  const prizesForSave = sourcePrizes.map(p => ({
    rank: p.rank, prizeName: p.prize_name, quantity: p.quantity, points: p.points,
    description: p.description, image: p.image, rarity: p.rarity, effectLevel: p.effect_level
  }));

  return actionAdminSavePrizes({ eventId: toEventId, prizes: prizesForSave });
}

function actionAdminGetResults(params) {
  const eventId = requireParam(params, "eventId");
  const results = sheetToObjects(getSheet(SHEET_NAMES.RESULTS))
    .filter(r => String(r.event_id) === String(eventId))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const prizes = sheetToObjects(getSheet(SHEET_NAMES.PRIZES))
    .filter(p => String(p.event_id) === String(eventId))
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map(p => ({
      rank: p.rank, prizeName: p.prize_name,
      quantity: Number(p.quantity) || 0, remaining: Number(p.remaining_quantity) || 0
    }));

  return { results, prizes };
}
