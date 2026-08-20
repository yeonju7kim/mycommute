(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CommuteLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const QR_CODES = Object.freeze({
    checkin: "MYCOMMUTE:CHECKIN:v1:LAB",
    checkout: "MYCOMMUTE:CHECKOUT:v1:LAB",
    gym: "MYCOMMUTE:GYM:v1:LAB"
  });

  const DEFAULT_SETTINGS = Object.freeze({
    checkinTime: "09:00",
    checkoutTime: "20:00",
    checkinFine: 10000,
    checkoutFine: 10000,
    gymCredit: 10000,
    activeDays: [1, 2, 3, 4, 5, 6, 7]
  });

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function timeText(date = new Date()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function minutes(value) {
    const [hour, minute] = String(value || "00:00").split(":").map(Number);
    return (hour * 60) + minute;
  }

  function typeForCode(code) {
    return Object.keys(QR_CODES).find((type) => QR_CODES[type] === code) || null;
  }

  function dayNumber(date = new Date()) {
    return date.getDay() === 0 ? 7 : date.getDay();
  }

  function isActiveDate(date, settings = DEFAULT_SETTINGS) {
    return settings.activeDays.includes(dayNumber(date));
  }

  function scanResult({ type, now = new Date(), settings = DEFAULT_SETTINGS, existing = null }) {
    if (!type || !QR_CODES[type]) return { outcome: "unknown" };
    if (existing) return { outcome: "duplicate", record: existing };
    if (type === "gym") {
      return {
        outcome: "gym",
        record: { date: dateKey(now), type, status: "credit", time: timeText(now), amount: settings.gymCredit }
      };
    }
    if (!isActiveDate(now, settings)) return { outcome: "inactive" };
    const deadline = type === "checkin" ? settings.checkinTime : settings.checkoutTime;
    const amount = type === "checkin" ? settings.checkinFine : settings.checkoutFine;
    const late = (now.getHours() * 60 + now.getMinutes()) > minutes(deadline);
    return {
      outcome: late ? "late" : "success",
      record: {
        date: dateKey(now),
        type,
        status: late ? "failed" : "success",
        time: timeText(now),
        amount: late ? amount : 0
      }
    };
  }

  function monthKey(date = new Date()) {
    return dateKey(date).slice(0, 7);
  }

  function summarize(records, month = monthKey()) {
    const scoped = records.filter((record) => record.date.startsWith(month));
    const attendance = scoped.filter((record) => record.type === "checkin" || record.type === "checkout");
    const lost = attendance.reduce((sum, record) => sum + (record.status === "failed" ? Number(record.amount) : 0), 0);
    const earned = scoped.filter((record) => record.type === "gym").reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const statsFor = (type) => {
      const items = attendance.filter((record) => record.type === type && record.status !== "excused");
      const success = items.filter((record) => record.status === "success").length;
      return { total: items.length, success, rate: items.length ? Math.round((success / items.length) * 100) : 0 };
    };
    return {
      lost,
      earned,
      gymCount: scoped.filter((record) => record.type === "gym").length,
      checkin: statsFor("checkin"),
      checkout: statsFor("checkout")
    };
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("ko-KR")}원`;
  }

  return { QR_CODES, DEFAULT_SETTINGS, dateKey, timeText, minutes, typeForCode, dayNumber, isActiveDate, scanResult, monthKey, summarize, formatMoney };
});
