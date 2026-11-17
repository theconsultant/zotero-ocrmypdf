import { config } from "../package.json";
import { ocrArgs, ocrOutputPath } from "./utils/ocrPlan";

const MENU_ITEM_ID = "zotero-ocrmypdf-item";
const SETTINGS_ITEM_ID = "zotero-ocrmypdf-settings-item";
const SETTINGS_SEP_ID = "zotero-ocrmypdf-settings-sep";
const TOOLBAR_BUTTON_ID = "zotero-ocrmypdf-tb-ocr";
const ICON_URI = `chrome://${config.addonRef}/content/icons/favicon.svg`;

// Per-window listeners, so each window is registered once (bootstrap calls
// onMainWindowLoad for existing windows too) and can be cleaned up on unload.
const registeredWindows = new Map<any, (e: Event) => void>();

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  // Register menu on ALL currently open windows (official template pattern)
  const windows = Zotero.getMainWindows();
  Zotero.debug(`[${config.addonName}] onStartup: found ${windows.length} open windows`);
  for (const win of windows) {
    registerWindow(win);
  }

  addon.data.initialized = true;
  Zotero.debug(`[${config.addonName}] Startup complete, registered ${windows.length} windows`);
}

// onMainWindowLoad is called by bootstrap for new windows AND existing windows on startup.
// Only register if not already registered to avoid double-registration.
async function onMainWindowLoad(win: any) {
  registerWindow(win);
}

async function onMainWindowUnload(win: any) {
  unregisterWindow(win);
}

function onShutdown() {
  for (const win of [...registeredWindows.keys()]) {
    unregisterWindow(win);
  }
  addon.data.alive = false;
  // @ts-expect-error
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(event: string, type: string, ids: Array<string | number>, extraData: any) {
  Zotero.debug(`[${config.addonName}] notify ${event} ${type}`);
}

async function onPrefsEvent(type: string, data: any) {}
function onShortcuts(type: string) {}

function registerWindow(win: any) {
  if (registeredWindows.has(win)) return;
  const doc = win.document;

  const popup = (event: Event) => {
    const popupEl = event.target as Element;

    if (popupEl.id === "zotero-itemmenu" && !doc.getElementById(MENU_ITEM_ID)) {
      const menuitem = (doc as any).createXULElement("menuitem");
      menuitem.setAttribute("id", MENU_ITEM_ID);
      menuitem.setAttribute("label", "Convert to Searchable PDF");
      menuitem.setAttribute("accesskey", "O");
      menuitem.setAttribute("icon", ICON_URI);
      menuitem.addEventListener("command", () => onConvertOCR());
      popupEl.appendChild(menuitem);
    }

    if (popupEl.id === "menu_ToolsPopup" && !doc.getElementById(SETTINGS_ITEM_ID)) {
      const sep = (doc as any).createXULElement("menuseparator");
      sep.id = SETTINGS_SEP_ID;
      const settingsItem = (doc as any).createXULElement("menuitem");
      settingsItem.id = SETTINGS_ITEM_ID;
      settingsItem.setAttribute("label", config.addonName + " Settings");
      settingsItem.setAttribute("accesskey", "S");
      settingsItem.addEventListener("command", () => openSettings());
      popupEl.appendChild(sep);
      popupEl.appendChild(settingsItem);
    }
  };

  doc.addEventListener("popupshowing", popup);
  addToolbarButton(doc);
  registeredWindows.set(win, popup);
}

function addToolbarButton(doc: any) {
  if (doc.getElementById(TOOLBAR_BUTTON_ID)) return;
  const toolbar = doc.getElementById("zotero-items-toolbar");
  if (!toolbar) {
    Zotero.debug(`[${config.addonName}] items toolbar not found; skipping toolbar button`);
    return;
  }
  const button = doc.createXULElement("toolbarbutton");
  button.id = TOOLBAR_BUTTON_ID;
  button.setAttribute("class", "zotero-tb-button");
  button.setAttribute("tabindex", "-1");
  button.setAttribute("tooltiptext", "Convert selected PDFs to searchable PDFs");
  button.style.listStyleImage = `url("${ICON_URI}")`;
  button.addEventListener("command", () => onConvertOCR());
  // Place it with the other item buttons, before the spacer that pushes search right.
  const spacer = toolbar.querySelector(":scope > spacer");
  toolbar.insertBefore(button, spacer || null);
}

function unregisterWindow(win: any) {
  const popup = registeredWindows.get(win);
  if (popup) {
    win.document.removeEventListener("popupshowing", popup);
    registeredWindows.delete(win);
  }
  for (const id of [MENU_ITEM_ID, SETTINGS_ITEM_ID, SETTINGS_SEP_ID, TOOLBAR_BUTTON_ID]) {
    win.document.getElementById(id)?.remove();
  }
}

function openSettings() {
  const PREFIX = "zotero-ocrmypdf.";
  const currentLang = String(Zotero.Prefs.get(PREFIX + "language") || "eng");

  for (const win of Zotero.getMainWindows()) {
    if ((win as any).ZoteroPane) {
      const lang = win.prompt(
        "Language codes for ocrmypdf (e.g. eng, chi_sim+eng, deu+eng):",
        currentLang,
      );
      if (lang !== null) {
        Zotero.Prefs.set(PREFIX + "language", lang.trim() || "eng");
        showProgress("Language saved: " + (lang.trim() || "eng"), "success");
      }
      return;
    }
  }
  showProgress("No Zotero window found", "error");
}

async function onConvertOCR() {
  const ZoteroPane = (Zotero as any).getActiveZoteroPane();
  const items: any[] = ZoteroPane.getSelectedItems();
  const pdfItems = items.filter((item: any) => item.attachmentMIMEType === "application/pdf");

  if (pdfItems.length === 0) {
    showProgress("No PDF items selected", "warning");
    return;
  }

  const ocrPath = Zotero.Prefs.get("zotero-ocrmypdf.ocrpath") || await detectOcrPath();
  const language = Zotero.Prefs.get("zotero-ocrmypdf.language") || "eng";
  const deskew = Zotero.Prefs.get("zotero-ocrmypdf.deskew") !== false;

  const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");

  for (const item of pdfItems) {
    const inputPath = item.getFilePath();
    if (!inputPath) continue;
    const outputPath = ocrOutputPath(inputPath);
    const args = ocrArgs(inputPath, outputPath, String(language), deskew);

    showProgress(`OCR: ${item.getDisplayTitle()}`, "default");

    try {
      Zotero.debug(`[${config.addonName}] Running: ${ocrPath} ${args.join(" ")}`);

      // Run through a login shell so ocrmypdf sees the same environment as the terminal
      const shell = Zotero.isWin ? "cmd" : (Zotero.isMac ? "/bin/zsh" : "/bin/bash");
      const cmdStr = [ocrPath, ...args].map((a) => `"${a}"`).join(" ");
      const shellArgs = Zotero.isWin
        ? ["/c", cmdStr]
        : ["-l", "-c", cmdStr];

      const proc = await Subprocess.call({
        command: shell,
        arguments: shellArgs,
        stdout: "pipe",
        stderr: "stdout",
        stdin: "close",
      });

      let output = "";
      let chunk;
      while ((chunk = await proc.stdout.readString())) {
        output += chunk;
      }
      const { exitCode } = await proc.wait();

      if (exitCode === 0) {
        // Zotero 7+: use attachmentPath setter to point the attachment to the new file
        item.attachmentPath = outputPath;
        await item.saveTx();
        showProgress(`OCR done: ${item.getDisplayTitle()}`, "success");
      } else {
        Zotero.debug(`[${config.addonName}] ocrmypdf stderr+stdout: ${output}`);
        showProgress(`OCR failed (exit ${exitCode}): ${output.substring(0, 200)}`, "error");
      }
    } catch (e: any) {
      Zotero.debug(`[${config.addonName}] ocrmypdf error: ${e.message}`);
      showProgress(`Error: ${e.message}`, "error");
    }
  }
}

function showProgress(text: string, type: "default" | "success" | "error" | "warning" = "default") {
  new (addon.data.ztoolkit.ProgressWindow as any)(config.addonName, { closeOnClick: true })
    .createLine({ text, type })
    .show();
}

async function detectOcrPath(): Promise<string> {
  const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");

  try {
    // Use login shell to match user's terminal environment (PATH, aliases, etc.)
    const shell = Zotero.isWin ? "cmd" : (Zotero.isMac ? "/bin/zsh" : "/bin/bash");
    const shellArgs = Zotero.isWin
      ? ["/c", "where ocrmypdf"]
      : ["-l", "-c", "which ocrmypdf 2>/dev/null || type ocrmypdf 2>/dev/null"];

    // Subprocess.env REPLACES the entire environment — include all needed vars
    const env: Record<string, string> = {
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      HOME: Services.env.get("HOME") || "",
      USER: Services.env.get("USER") || "",
      LANG: "en_US.UTF-8",
    };

    const proc = await Subprocess.call({
      command: shell,
      arguments: shellArgs,
      stdout: "pipe",
      stderr: "pipe",
      // Don't wait for stdin — close it immediately
      stdin: "close",
      env,
    });
    let output = "";
    let chunk;
    while ((chunk = await proc.stdout.readString())) {
      output += chunk;
    }
    await proc.wait();

    if (Zotero.isWin) {
      // `where` outputs path on each line — take first
      const path = output.split("\n")[0].trim();
      return path || "ocrmypdf";
    }

    // `which` or `type` output: /path/to/ocrmypdf or "ocrmypdf is /path/to/ocrmypdf"
    const line = output.split("\n")[0].trim();
    const match = line.match(/\/[\S]+$/);
    return match ? match[0] : "ocrmypdf";
  } catch {
    return "ocrmypdf";
  }
}

export default { onStartup, onShutdown, onMainWindowLoad, onMainWindowUnload, onNotify, onPrefsEvent, onShortcuts };
