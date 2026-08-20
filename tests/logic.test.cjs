const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../www/logic.js");

const settings = { ...logic.DEFAULT_SETTINGS, activeDays: [1, 2, 3, 4, 5, 6, 7] };

test("three QR codes map to three different record types", () => {
  assert.equal(new Set(Object.values(logic.QR_CODES)).size, 3);
  assert.equal(logic.typeForCode(logic.QR_CODES.checkin), "checkin");
  assert.equal(logic.typeForCode(logic.QR_CODES.checkout), "checkout");
  assert.equal(logic.typeForCode(logic.QR_CODES.gym), "gym");
});

test("check-in before 09:00 succeeds and a late scan fails", () => {
  const success = logic.scanResult({ type: "checkin", now: new Date(2026, 7, 17, 8, 59), settings });
  const failure = logic.scanResult({ type: "checkin", now: new Date(2026, 7, 17, 9, 1), settings });
  assert.equal(success.record.status, "success");
  assert.equal(failure.record.status, "failed");
  assert.equal(failure.record.amount, 10000);
});

test("checkout at 20:00 succeeds and after 20:00 fails", () => {
  const success = logic.scanResult({ type: "checkout", now: new Date(2026, 7, 17, 20, 0), settings });
  const failure = logic.scanResult({ type: "checkout", now: new Date(2026, 7, 17, 20, 1), settings });
  assert.equal(success.record.status, "success");
  assert.equal(failure.record.status, "failed");
});

test("attendance rules apply on weekends too", () => {
  const sunday = logic.scanResult({ type: "checkin", now: new Date(2026, 7, 23, 8, 30), settings });
  assert.equal(sunday.record.status, "success");
});

test("gym credit is limited by the existing daily record", () => {
  const first = logic.scanResult({ type: "gym", now: new Date(2026, 7, 17, 18, 0), settings });
  const duplicate = logic.scanResult({ type: "gym", now: new Date(2026, 7, 17, 19, 0), settings, existing: first.record });
  assert.equal(first.record.amount, 10000);
  assert.equal(duplicate.outcome, "duplicate");
});

test("monthly lost and earned money stay separate", () => {
  const records = [
    { date: "2026-08-03", type: "checkin", status: "failed", amount: 10000 },
    { date: "2026-08-03", type: "checkout", status: "failed", amount: 10000 },
    { date: "2026-08-04", type: "gym", status: "credit", amount: 10000 },
    { date: "2026-08-05", type: "gym", status: "credit", amount: 10000 },
    { date: "2026-08-06", type: "gym", status: "credit", amount: 10000 }
  ];
  const summary = logic.summarize(records, "2026-08");
  assert.equal(summary.lost, 20000);
  assert.equal(summary.earned, 30000);
});

test("excused attendance is neither lost money nor a failed rate attempt", () => {
  const records = [
    { date: "2026-08-03", type: "checkin", status: "success", amount: 0 },
    { date: "2026-08-04", type: "checkin", status: "excused", amount: 0, reason: "휴가" }
  ];
  const summary = logic.summarize(records, "2026-08");
  assert.equal(summary.lost, 0);
  assert.equal(summary.checkin.total, 1);
  assert.equal(summary.checkin.rate, 100);
});
