/**
 * TFEX Trading Journal — Google Apps Script Backend
 *
 * วิธีใช้:
 * 1. สร้าง Google Sheet ใหม่
 * 2. ไปที่ Extensions > Apps Script
 * 3. ลบ code เดิมแล้ววาง code นี้ทั้งหมด
 * 4. กด Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy URL ที่ได้ไปใส่ในแอป (Settings)
 *
 * Sheet จะถูกสร้างอัตโนมัติเมื่อมีการเรียกใช้ครั้งแรก
 */

const SHEET_NAME = "Trades";
const SETTINGS_SHEET = "Settings";

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Set headers
    const headers = [
      "ID",
      "Date",
      "Symbol",
      "Side",
      "Entry Price",
      "Exit Price",
      "Contracts",
      "P&L (Points)",
      "P&L (Baht)",
      "Commission",
      "Net P&L",
      "Strategy",
      "Notes",
      "Screenshot URL",
      "Created At",
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet
      .getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#1a1a2e")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function doGet(e) {
  try {
    const action = e.parameter.action || "getAll";

    if (action === "getAll") {
      return getAllTrades();
    } else if (action === "getSettings") {
      return getSettings();
    }

    return createJsonResponse({ error: "Unknown action" });
  } catch (error) {
    return createJsonResponse({ error: error.toString() });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || "add";

    if (action === "add") {
      return addTrade(data);
    } else if (action === "delete") {
      return deleteTrade(data.id);
    } else if (action === "update") {
      return updateTrade(data);
    } else if (action === "saveSettings") {
      return saveSettings(data.settings);
    }

    return createJsonResponse({ error: "Unknown action" });
  } catch (error) {
    return createJsonResponse({ error: error.toString() });
  }
}

function getAllTrades() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return createJsonResponse({ trades: [] });
  }

  const headers = data[0];
  const trades = [];

  for (let i = 1; i < data.length; i++) {
    const trade = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      let value = data[i][j];
      // Format date
      if (key === "Date" && value instanceof Date) {
        value = Utilities.formatDate(
          value,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd",
        );
      }
      if (key === "Created At" && value instanceof Date) {
        value = Utilities.formatDate(
          value,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd HH:mm:ss",
        );
      }
      trade[key] = value;
    }
    trades.push(trade);
  }

  return createJsonResponse({ trades: trades });
}

function addTrade(data) {
  const sheet = getOrCreateSheet();
  const id = Utilities.getUuid();

  const pnlPoints = calculatePnlPoints(
    data.side,
    data.entryPrice,
    data.exitPrice,
    data.contracts,
  );
  const pnlBaht = pnlPoints * (data.pointMultiplier || 200);
  const commission = data.commission || 0;
  const netPnl = pnlBaht - commission;

  const row = [
    id,
    data.date,
    data.symbol,
    data.side,
    data.entryPrice,
    data.exitPrice,
    data.contracts,
    pnlPoints,
    pnlBaht,
    commission,
    netPnl,
    data.strategy || "",
    data.notes || "",
    data.screenshotUrl || "",
    new Date(),
  ];

  sheet.appendRow(row);

  return createJsonResponse({ success: true, id: id, netPnl: netPnl });
}

function deleteTrade(id) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return createJsonResponse({ success: true });
    }
  }

  return createJsonResponse({ error: "Trade not found" });
}

function updateTrade(data) {
  const sheet = getOrCreateSheet();
  const allData = sheet.getDataRange().getValues();

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.id) {
      const pnlPoints = calculatePnlPoints(
        data.side,
        data.entryPrice,
        data.exitPrice,
        data.contracts,
      );
      const pnlBaht = pnlPoints * (data.pointMultiplier || 200);
      const commission = data.commission || 0;
      const netPnl = pnlBaht - commission;

      const row = [
        data.id,
        data.date,
        data.symbol,
        data.side,
        data.entryPrice,
        data.exitPrice,
        data.contracts,
        pnlPoints,
        pnlBaht,
        commission,
        netPnl,
        data.strategy || "",
        data.notes || "",
        data.screenshotUrl || "",
        allData[i][14], // keep original created at
      ];

      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return createJsonResponse({ success: true });
    }
  }

  return createJsonResponse({ error: "Trade not found" });
}

function getSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET);

  if (!sheet) {
    return createJsonResponse({ settings: {} });
  }

  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 0; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }

  return createJsonResponse({ settings: settings });
}

function saveSettings(settings) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET);
  }

  sheet.clear();
  const rows = Object.entries(settings);
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  }

  return createJsonResponse({ success: true });
}

function calculatePnlPoints(side, entryPrice, exitPrice, contracts) {
  const entry = parseFloat(entryPrice);
  const exit = parseFloat(exitPrice);
  const qty = parseInt(contracts);

  if (side === "Long") {
    return (exit - entry) * qty;
  } else {
    return (entry - exit) * qty;
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
