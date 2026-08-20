(function () {
  "use strict";

  const L = globalThis.CommuteLogic;
  const STORAGE_KEY = "time-is-money-state-v1";
  const typeLabels = { checkin: "출근", checkout: "퇴근", gym: "헬스장" };
  let state = null;
  let historyCursor = new Date();
  let toastTimer = null;
  let pendingNativeScan = null;

  function nativeBridge() {
    return globalThis.TimeMoneyNative || null;
  }

  function parseNativeResult(value) {
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  globalThis.__timeMoneyNativeScanResult = (result) => {
    if (!pendingNativeScan) return;
    const resolve = pendingNativeScan;
    pendingNativeScan = null;
    resolve(parseNativeResult(result));
  };

  function scanWithNative(bridge) {
    return new Promise((resolve) => {
      if (pendingNativeScan) {
        resolve({ outcome: "busy" });
        return;
      }
      pendingNativeScan = resolve;
      try {
        bridge.scanQr();
      } catch (error) {
        pendingNativeScan = null;
        resolve({ outcome: "error", message: String(error?.message || error) });
      }
    });
  }

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function parseLocalDate(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function normalizedSettings(settings) {
    return {
      ...L.DEFAULT_SETTINGS,
      ...(settings || {}),
      checkinFine: Number(settings?.checkinFine ?? L.DEFAULT_SETTINGS.checkinFine),
      checkoutFine: Number(settings?.checkoutFine ?? L.DEFAULT_SETTINGS.checkoutFine),
      gymCredit: Number(settings?.gymCredit ?? L.DEFAULT_SETTINGS.gymCredit),
      activeDays: [1, 2, 3, 4, 5, 6, 7]
    };
  }

  function loadFallback() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) return { ...saved, settings: normalizedSettings(saved.settings), records: saved.records || [] };
    } catch (_) {}
    return { settings: normalizedSettings(), records: [], installedAt: Date.now() };
  }

  function saveFallback(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function localDeadline(date, time) {
    const [hour, minute] = time.split(":").map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
  }

  function reconcileFallback(data) {
    const now = new Date();
    const installed = new Date(data.installedAt || Date.now());
    const cursor = new Date(installed.getFullYear(), installed.getMonth(), installed.getDate());
    let guard = 0;
    while (cursor <= now && guard < 740) {
      const date = L.dateKey(cursor);
      for (const type of ["checkin", "checkout"]) {
        const deadlineName = type === "checkin" ? "checkinTime" : "checkoutTime";
        const fineName = type === "checkin" ? "checkinFine" : "checkoutFine";
        const deadline = localDeadline(cursor, data.settings[deadlineName]);
        const beganBeforeDeadline = installed <= deadline;
        const exists = data.records.some((record) => record.date === date && record.type === type);
        if (!exists && beganBeforeDeadline && now > deadline) {
          data.records.push({ date, type, status: "failed", time: "", amount: data.settings[fineName], reason: "" });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
    saveFallback(data);
    return data;
  }

  const service = {
    async getState() {
      const bridge = nativeBridge();
      if (bridge) return parseNativeResult(bridge.getState());
      return reconcileFallback(loadFallback());
    },
    async scan() {
      const bridge = nativeBridge();
      if (bridge) return scanWithNative(bridge);
      return { outcome: "bridge-missing", state: await this.getState() };
    },
    async saveSettings(settings) {
      const bridge = nativeBridge();
      if (bridge) return parseNativeResult(bridge.saveSettings(JSON.stringify(settings)));
      const data = loadFallback();
      data.settings = normalizedSettings(settings);
      saveFallback(data);
      return { state: reconcileFallback(data) };
    },
    async addException(types, reason) {
      const bridge = nativeBridge();
      if (bridge) return parseNativeResult(bridge.addException(JSON.stringify({ types, reason })));
      const data = reconcileFallback(loadFallback());
      const date = L.dateKey();
      const time = L.timeText();
      for (const type of types) {
        data.records = data.records.filter((record) => !(record.date === date && record.type === type));
        data.records.push({ date, type, status: "excused", time, amount: 0, reason });
      }
      saveFallback(data);
      return { state: data };
    }
  };

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2300);
  }

  function recordFor(type, date = L.dateKey()) {
    return state.records.find((record) => record.date === date && record.type === type) || null;
  }

  function renderStatus(type) {
    const record = recordFor(type);
    const stateNode = $(`#${type}-state`);
    const detailNode = $(`#${type}-detail`);
    const badgeNode = $(`#${type}-badge`);
    const deadline = type === "checkin" ? state.settings.checkinTime : state.settings.checkoutTime;
    const fine = type === "checkin" ? state.settings.checkinFine : state.settings.checkoutFine;
    badgeNode.className = "status-badge waiting";
    if (!record) {
      stateNode.textContent = "대기 중";
      detailNode.textContent = `${deadline}까지`;
      badgeNode.textContent = "대기";
      return;
    }
    badgeNode.classList.remove("waiting");
    badgeNode.classList.add(record.status);
    if (record.status === "success") {
      stateNode.textContent = `${record.time} 완료`;
      detailNode.textContent = "시간을 지켰어요";
      badgeNode.textContent = "성공";
    } else if (record.status === "failed") {
      stateNode.textContent = record.time ? `${record.time} 실패` : "미체크 실패";
      detailNode.textContent = `${L.formatMoney(record.amount || fine)} 잃었어요`;
      badgeNode.textContent = "실패";
    } else {
      stateNode.textContent = "예외 처리";
      detailNode.textContent = record.reason || "사유가 기록됐어요";
      badgeNode.textContent = "예외";
    }
  }

  function monthLabel(key) {
    const [year, month] = key.split("-").map(Number);
    return `${year}년 ${month}월`;
  }

  function renderHome() {
    const now = new Date();
    $("#today-date").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(now);
    $("#offday-note").classList.toggle("hidden", L.isActiveDate(now, state.settings));
    renderStatus("checkin");
    renderStatus("checkout");
    const summary = L.summarize(state.records);
    $("#home-month-label").textContent = `${now.getMonth() + 1}월 돈 기록`;
    $("#home-lost").textContent = L.formatMoney(summary.lost);
    $("#home-earned").textContent = L.formatMoney(summary.earned);
  }

  function renderStats() {
    const summary = L.summarize(state.records);
    $("#checkin-rate").textContent = `${summary.checkin.rate}%`;
    $("#checkout-rate").textContent = `${summary.checkout.rate}%`;
    $("#checkin-progress").style.width = `${summary.checkin.rate}%`;
    $("#checkout-progress").style.width = `${summary.checkout.rate}%`;
    $("#checkin-count").textContent = summary.checkin.total ? `${summary.checkin.total}번 중 ${summary.checkin.success}번 성공` : "기록 없음";
    $("#checkout-count").textContent = summary.checkout.total ? `${summary.checkout.total}번 중 ${summary.checkout.success}번 성공` : "기록 없음";
    $("#gym-count").textContent = `${summary.gymCount}회`;
    $("#gym-earned-total").textContent = `${L.formatMoney(summary.earned)} 벌었어요`;
    $("#stats-lost").textContent = L.formatMoney(summary.lost);
    $("#stats-earned").textContent = L.formatMoney(summary.earned);
  }

  function renderHistory() {
    const month = `${historyCursor.getFullYear()}-${String(historyCursor.getMonth() + 1).padStart(2, "0")}`;
    $("#history-month").textContent = monthLabel(month);
    const scoped = state.records.filter((record) => record.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type));
    const list = $("#history-list");
    if (!scoped.length) {
      list.innerHTML = '<div class="empty-state">아직 기록이 없어요.<br />QR을 스캔하면 여기에 차곡차곡 쌓여요.</div>';
      return;
    }
    const groups = Object.groupBy ? Object.groupBy(scoped, (record) => record.date) : scoped.reduce((result, record) => ((result[record.date] ||= []).push(record), result), {});
    list.innerHTML = Object.entries(groups).map(([date, records]) => {
      const parsed = parseLocalDate(date);
      const dateText = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(parsed);
      return `<article class="history-day"><div class="history-date"><strong>${dateText}</strong><span>${date}</span></div>${records.map(historyRecordHtml).join("")}</article>`;
    }).join("");
  }

  function historyRecordHtml(record) {
    const labels = { success: "성공", failed: "실패", credit: "번 돈", excused: "예외" };
    const money = record.status === "failed" ? ` · −${L.formatMoney(record.amount)}` : record.status === "credit" ? ` · +${L.formatMoney(record.amount)}` : "";
    const detail = `${record.time || "미체크"} · ${labels[record.status] || record.status}${money}`;
    const reason = record.status === "excused" && record.reason ? `<small class="reason">사유: ${escapeHtml(record.reason)}</small>` : "";
    return `<div class="history-record ${record.status}"><i></i><span>${typeLabels[record.type]}</span><small>${detail}</small>${reason}</div>`;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
  }

  function renderSettings() {
    $("#checkin-time").value = state.settings.checkinTime;
    $("#checkout-time").value = state.settings.checkoutTime;
    $("#checkin-fine").value = state.settings.checkinFine;
    $("#checkout-fine").value = state.settings.checkoutFine;
    $("#gym-credit").value = state.settings.gymCredit;
  }

  function renderAll() {
    state.settings = normalizedSettings(state.settings);
    state.records ||= [];
    renderHome();
    renderStats();
    renderHistory();
    renderSettings();
  }

  function showScreen(name) {
    $$(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === `screen-${name}`));
    $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "history") renderHistory();
    if (name === "stats") renderStats();
  }

  function scanMessage(result) {
    if (result.outcome === "success") return `${typeLabels[result.record.type]} 성공! 시간을 지켰어요.`;
    if (result.outcome === "late") return `${typeLabels[result.record.type]} 시간이 늦어 ${L.formatMoney(result.record.amount)} 잃었어요.`;
    if (result.outcome === "gym") return `운동 완료! ${L.formatMoney(result.record.amount)} 벌었어요.`;
    if (result.outcome === "duplicate") return "오늘은 이미 기록했어요.";
    if (result.outcome === "inactive") return "오늘은 출퇴근 체크 요일이 아니에요.";
    if (result.outcome === "unknown") return "이 앱에서 만든 QR 코드가 아니에요.";
    if (result.outcome === "cancelled") return "스캔을 취소했어요.";
    if (result.outcome === "bridge-missing") return "앱 연결을 준비하지 못했어요. 앱을 완전히 닫고 다시 열어주세요.";
    if (result.outcome === "busy") return "이미 QR 스캐너가 열려 있어요.";
    if (result.outcome === "error") return "스캐너를 열지 못했어요. Google Play 서비스를 확인해 주세요.";
    return "QR을 확인하지 못했어요. 다시 시도해주세요.";
  }

  async function handleScan() {
    const button = $("#scan-button");
    button.disabled = true;
    try {
      const result = await service.scan();
      if (result.state) state = result.state;
      else state = await service.getState();
      renderAll();
      toast(scanMessage(result));
    } catch (error) {
      if (String(error?.message || error).toLowerCase().includes("cancel")) toast("스캔을 취소했어요.");
      else toast("스캐너를 열지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      button.disabled = false;
    }
  }

  const qrMeta = {
    checkin: { label: "출근 QR", caption: "연구실 들어가는 곳", color: "#177760" },
    checkout: { label: "퇴근 QR", caption: "연구실 나가는 곳", color: "#df6548" },
    gym: { label: "헬스장 QR", caption: "헬스장에 도착해서", color: "#4d67d8" }
  };

  function selectQr(type) {
    const meta = qrMeta[type];
    $$(".qr-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.qr === type));
    $("#qr-label").textContent = meta.label;
    $("#qr-label").style.color = meta.color;
    $("#qr-image").src = `qrs/${type}.png`;
    $("#qr-image").alt = `${meta.label} 코드`;
    $("#qr-caption").textContent = meta.caption;
    $("#qr-share").dataset.qr = type;
  }

  async function shareQr() {
    const type = $("#qr-share").dataset.qr || "checkin";
    try {
      const blob = await (await fetch(`qrs/${type}.png`)).blob();
      const file = new File([blob], `시간이돈이다-${type}.png`, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: qrMeta[type].label, text: "시간이 돈이다 전용 QR 코드", files: [file] });
      } else {
        toast("QR 이미지를 길게 눌러 저장해주세요.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") toast("QR 이미지를 길게 눌러 저장해주세요.");
    }
  }

  async function init() {
    try {
      state = await service.getState();
      renderAll();
    } catch (_) {
      state = reconcileFallback(loadFallback());
      renderAll();
      toast("기기 저장소를 불러오지 못해 임시 모드로 열었어요.");
    }

    $$(".nav-button").forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.screen)));
    $("#scan-button").addEventListener("click", handleScan);
    $("#history-prev").addEventListener("click", () => { historyCursor.setMonth(historyCursor.getMonth() - 1); renderHistory(); });
    $("#history-next").addEventListener("click", () => { historyCursor.setMonth(historyCursor.getMonth() + 1); renderHistory(); });

    $("#settings-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const settings = {
        checkinTime: $("#checkin-time").value,
        checkoutTime: $("#checkout-time").value,
        checkinFine: Number($("#checkin-fine").value),
        checkoutFine: Number($("#checkout-fine").value),
        gymCredit: Number($("#gym-credit").value),
        activeDays: [1, 2, 3, 4, 5, 6, 7]
      };
      try {
        const result = await service.saveSettings(settings);
        state = result.state || await service.getState();
        renderAll();
        toast("설정을 저장했어요.");
      } catch (_) { toast("설정을 저장하지 못했어요."); }
    });

    const qrDialog = $("#qr-dialog");
    [$("#qr-open"), $("#settings-qr-open")].forEach((button) => button.addEventListener("click", () => { selectQr("checkin"); qrDialog.showModal(); }));
    $("#qr-close").addEventListener("click", () => qrDialog.close());
    $$(".qr-tabs button").forEach((button) => button.addEventListener("click", () => selectQr(button.dataset.qr)));
    $("#qr-share").addEventListener("click", shareQr);

    const exceptionDialog = $("#exception-dialog");
    $("#exception-open").addEventListener("click", () => exceptionDialog.showModal());
    $("#exception-close").addEventListener("click", () => exceptionDialog.close());
    $("#exception-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const types = $$("input[name='exception-type']:checked").map((input) => input.value);
      const reason = $("#exception-reason").value.trim();
      if (!types.length) { toast("출근이나 퇴근을 하나 이상 골라주세요."); return; }
      if (!reason) { toast("예외 사유를 적어주세요."); return; }
      try {
        const result = await service.addException(types, reason);
        state = result.state || await service.getState();
        renderAll();
        exceptionDialog.close();
        $("#exception-reason").value = "";
        toast("오늘 예외 사유를 저장했어요.");
      } catch (_) { toast("예외를 저장하지 못했어요."); }
    });

    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "visible") {
        try { state = await service.getState(); renderAll(); } catch (_) {}
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
