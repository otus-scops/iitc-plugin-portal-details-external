// ==UserScript==
// @id             iitc-plugin-portal-details-external@otusscops
// @name           IITC Plugin: Portal Details External Window
// @category       Portal Info
// @version        0.1.4.202603160940
// @namespace      iitc-plugin-portal-details-external
// @description    ポータル詳細情報を別ウィンドウで常時表示し、動的更新・クリック・フォーム入力のリアルタイム伝播に対応します。
// @downloadURL    
// @updateURL      
// @include        https://*.ingress.com/*
// @include        http://*.ingress.com/*
// @match          https://*.ingress.com/*
// @match          http://*.ingress.com/*
// @grant          none
// ==/UserScript==

/**
 * Copyright 2026 otusscops
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * ...
 */

(function () {
  "use strict";

  const wrapper = function (plugin_info) {
    if (typeof window.plugin !== "function") {
      window.plugin = function () {};
    }

    plugin_info.buildName = "iitc-ja-otusscops";
    plugin_info.dateTimeVersion = "202603160940";
    plugin_info.pluginId = "portal-details-external";

    // PLUGIN START ////////////////////////////////////////////////////////

    if (typeof window.plugin.portalDetailsExternal === "undefined") {
      window.plugin.portalDetailsExternal = {};
    }
    const self = window.plugin.portalDetailsExternal;

    let childWindow = null;
    let observer = null;
    let syncTimer = null;

    /**
     * 要素からルート(#portaldetails)までのインデックス経路を取得するヘルパー関数
     */
    self.getElementPath = function (element, root) {
      const path = [];
      let current = element;
      while (current && current !== root && current.tagName !== "BODY") {
        const index = Array.prototype.indexOf.call(current.parentNode.children, current);
        path.unshift(index);
        current = current.parentNode;
      }
      return current === root ? path : null;
    };

    /**
     * インデックス経路から要素を特定するヘルパー関数
     */
    self.getElementByPath = function (path, root) {
      let current = root;
      for (const index of path) {
        if (current && current.children[index]) {
          current = current.children[index];
        } else {
          return null;
        }
      }
      return current;
    };

    self.setupChildWindow = function () {
      if (!childWindow || childWindow.closed) {
        childWindow = window.open("", "iitc_portal_details", "width=450,height=800,menubar=no,toolbar=no,location=no,status=no");
        if (childWindow) {
          self.preRenderChild(childWindow);
        } else {
          console.warn("[PortalDetailsExternal] ポップアップがブロックされました。");
        }
      } else {
        childWindow.focus();
      }
    };

    self.preRenderChild = function (win) {
      const doc = win.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>IITC Portal Details</title>
          </head>
          <body style="background-color: #0e3d4e; margin: 0; padding: 0;">
            <div id="sidebar" style="width: 100%; height: 100vh; overflow-y: auto; overflow-x: hidden; background: transparent;">
              <div id="portaldetails" style="display: block !important; padding: 8px;">
                <div style="color: #ffce00; text-align: center; margin-top: 20px;">ポータルを選択してください。</div>
              </div>
            </div>
          </body>
        </html>
      `);
      doc.close();

      const head = doc.getElementsByTagName("head")[0];
      const parentStyles = document.querySelectorAll("link[rel='stylesheet'], style");
      
      parentStyles.forEach(styleNode => {
        if (styleNode.id === "portal-details-ext-hide-css") return;
        const clone = styleNode.cloneNode(true);
        head.appendChild(clone);
      });

      const childRoot = win.document.getElementById("portaldetails");

      // === クリックイベントの伝播 ===
      win.document.addEventListener("click", function (event) {
        const path = self.getElementPath(event.target, childRoot);
        if (path) {
          const parentTarget = self.getElementByPath(path, document.getElementById("portaldetails"));
          if (parentTarget && event.target.tagName !== "INPUT" && event.target.tagName !== "TEXTAREA" && event.target.tagName !== "SELECT") {
            event.preventDefault();
            parentTarget.click();
          }
        }
      });

      // === フォーム入力（テキスト、チェックボックス等）の伝播 ===
      const handleInput = function (event) {
        const target = event.target;
        // 入力要素以外は無視
        if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

        const path = self.getElementPath(target, childRoot);
        if (!path) return;

        const parentTarget = self.getElementByPath(path, document.getElementById("portaldetails"));
        if (parentTarget) {
          // 値の同期
          if (target.type === "checkbox" || target.type === "radio") {
            parentTarget.checked = target.checked;
          } else {
            parentTarget.value = target.value;
          }

          // 親側の外部プラグインに「変更された」ことを検知させるため、イベントを強制発火
          parentTarget.dispatchEvent(new Event('input', { bubbles: true }));
          parentTarget.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      // inputはテキスト入力のリアルタイム反映、changeはセレクトボックス等の確定用
      win.document.addEventListener("input", handleInput);
      win.document.addEventListener("change", handleInput);
    };

    /**
     * 親ウィンドウのポータル詳細HTMLを子ウィンドウへ同期する
     * ※入力中のフォーカスとカーソル位置を保護する
     */
    self.syncDOM = function () {
      if (!childWindow || childWindow.closed) return;
      const source = document.getElementById("portaldetails");
      const target = childWindow.document.getElementById("portaldetails");
      
      if (source && target) {
        // --- フォーカス状態の退避 ---
        let activePath = null;
        let selectionStart = 0;
        let selectionEnd = 0;
        const activeEl = childWindow.document.activeElement;
        
        // 入力欄にフォーカスが当たっているか確認
        if (activeEl && ["INPUT", "TEXTAREA"].includes(activeEl.tagName)) {
          activePath = self.getElementPath(activeEl, target);
          if (activePath) {
            try {
              selectionStart = activeEl.selectionStart || 0;
              selectionEnd = activeEl.selectionEnd || 0;
            } catch (e) {
              // 一部のinput type(number等)はselection取得でエラーになるため無視
            }
          }
        }

        // --- DOMの同期実行 ---
        target.innerHTML = source.innerHTML;

        // --- フォーカス状態の復元 ---
        if (activePath) {
          const restoredEl = self.getElementByPath(activePath, target);
          if (restoredEl) {
            restoredEl.focus();
            try {
              // カーソル位置を元の場所にセット
              restoredEl.setSelectionRange(selectionStart, selectionEnd);
            } catch (e) {}
          }
        }
      }
    };

    self.setupObserver = function () {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return;

      observer = new MutationObserver((mutations) => {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(self.syncDOM, 50);
      });

      observer.observe(sidebar, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    };

    self.onPortalDetailsUpdated = function (data) {
      if (!childWindow || childWindow.closed) {
        self.setupChildWindow();
      }
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(self.syncDOM, 50);
    };

    self.start = function () {
      window.addHook("portalDetailsUpdated", self.onPortalDetailsUpdated);
      self.setupObserver();

      $("#toolbox").append(
        ' <a onclick="window.plugin.portalDetailsExternal.setupChildWindow();" title="詳細ウィンドウを強制表示します">詳細ウィンドウ強制表示</a>'
      );

      const css = `
        #portaldetails { display: none !important; }
        #updatestatus { bottom: 0 !important; }
      `;
      $("<style>")
        .prop("type", "text/css")
        .prop("id", "portal-details-ext-hide-css")
        .html(css)
        .appendTo("head");

      setTimeout(self.setupChildWindow, 1000);
      console.log("[PortalDetailsExternal] Started with Event & Input Propagation");
    };

    const setup = self.start;

    // PLUGIN END //////////////////////////////////////////////////////////

    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === "function") {
      setup();
    }
  };

  const script = document.createElement("script");
  const info = {};
  if (typeof GM_info !== "undefined" && GM_info && GM_info.script) {
    info.script = {
      version: GM_info.script.version,
      name: GM_info.script.name,
      description: GM_info.script.description,
    };
  }
  script.appendChild(
    document.createTextNode(`(${wrapper})(${JSON.stringify(info)});`)
  );
  (document.body || document.head || document.documentElement).appendChild(
    script
  );
})();