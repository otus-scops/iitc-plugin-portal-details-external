// ==UserScript==
// @id             iitc-plugin-portal-details-external@otusscops
// @name           IITC Plugin: Portal Details External Window
// @category       Portal Info
// @version        0.3.2.202603280730
// @namespace      iitc-plugin-portal-details-external
// @description    ポータル詳細情報を別ウィンドウで表示します。タイトルバーのアイコンから表示モードを直感的に切り替えられます。
// @downloadURL    https://github.com/otus-scops/iitc-plugin-portal-details-external/raw/refs/heads/main/iitc-plugin-portal-details-external.user.js
// @updateURL      https://github.com/otus-scops/iitc-plugin-portal-details-external/raw/refs/heads/main/iitc-plugin-portal-details-external.user.js
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
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function () {
  "use strict";

  const wrapper = function (plugin_info) {
    if (typeof window.plugin !== "function") {
      window.plugin = function () {};
    }

    plugin_info.buildName = "iitc-ja-otusscops";
    plugin_info.dateTimeVersion = "202603280730";
    plugin_info.pluginId = "portal-details-external";

    // PLUGIN START ////////////////////////////////////////////////////////

    if (typeof window.plugin.portalDetailsExternal === "undefined") {
      window.plugin.portalDetailsExternal = {};
    }
    const self = window.plugin.portalDetailsExternal;

    const STORAGE_KEY = "portal-details-external-option";
    let childWindow = null;
    let observer = null;
    let syncTimer = null;

    const DEFAULT_OPTIONS = {
      popoutMode: true // デフォルトはポップアウトON
    };
    let OptionData = { ...DEFAULT_OPTIONS };

    self.loadOption = function () {
      try {
        const stream = localStorage.getItem(STORAGE_KEY);
        if (stream) {
          OptionData = { ...DEFAULT_OPTIONS, ...JSON.parse(stream) };
        }
      } catch (e) {
        console.error("[PortalDetailsExternal] Load settings failed:", e);
      }
    };

    self.saveOption = function () {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(OptionData));
    };

    self.getElementPath = function (element, root) {
      const path = [];
      let current = element;
      while (current && current !== root && current.tagName !== "BODY") {
        if (!current.parentNode || !current.parentNode.children) return null;
        const index = Array.prototype.indexOf.call(current.parentNode.children, current);
        if (index === -1) return null;
        path.unshift(index);
        current = current.parentNode;
      }
      return current === root ? path : null;
    };

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

    /**
     * 切り替え用アイコンをポータルタイトル内に注入・更新する
     */
    self.addToggleIcon = function () {
      const details = document.getElementById("portaldetails");
      if (!details) return;

      let icon = document.getElementById("pd-ext-toggle-icon");
      const isPopout = OptionData.popoutMode;

      const expectedTitle = isPopout ? "標準表示に戻す" : "ポップアウト表示にする";
      const svgTransform = isPopout ? 'transform: rotate(180deg); transform-origin: center;' : '';
      const svgContent = `<svg viewBox="0 0 24 24" style="width: 100%; height: 100%; fill: currentColor; ${svgTransform}"><path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" /></svg>`;

      if (!icon) {
        icon = document.createElement("div");
        icon.id = "pd-ext-toggle-icon";
        
        icon.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.toggleMode();
        };

        const titleEl = details.querySelector(".title");
        if (titleEl) {
          titleEl.appendChild(icon);
        } else {
          details.insertBefore(icon, details.firstChild);
        }
      }

      // 無限ループ（MutationObserverの連続発火）を防ぐため、状態が変わった時のみDOMを更新する
      if (icon.getAttribute("data-popout-state") !== String(isPopout)) {
        icon.title = expectedTitle;
        icon.innerHTML = svgContent;
        icon.setAttribute("data-popout-state", String(isPopout));
      }
    };

    self.setupChildWindow = function () {
      if (!OptionData.popoutMode) return;

      if (!childWindow || childWindow.closed) {
        childWindow = window.open("", "iitc_portal_details", "width=450,height=800,menubar=no,toolbar=no,location=no,status=no");
        if (childWindow) {
          self.preRenderChild(childWindow);
          self.syncDOM();
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

      win.addEventListener("beforeunload", function () {
        if (OptionData.popoutMode) {
          self.setMode(false);
        }
      });

      win.document.addEventListener("click", function (event) {
        let current = event.target;
        
        while (current && current !== doc.body && current !== doc) {
          if (current.id === "pd-ext-toggle-icon") {
            event.preventDefault();
            event.stopPropagation();
            if (window.opener && window.opener.plugin && window.opener.plugin.portalDetailsExternal) {
               window.opener.plugin.portalDetailsExternal.toggleMode();
            } else {
               win.close(); 
            }
            return;
          }
          current = current.parentNode;
        }

        const path = self.getElementPath(event.target, childRoot);
        if (path) {
          const parentTarget = self.getElementByPath(path, document.getElementById("portaldetails"));
          if (parentTarget && event.target.tagName !== "INPUT" && event.target.tagName !== "TEXTAREA" && event.target.tagName !== "SELECT") {
            event.preventDefault();
            parentTarget.click();
          }
        }
      });

      const handleInput = function (event) {
        const target = event.target;
        if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

        const path = self.getElementPath(target, childRoot);
        if (!path) return;

        const parentTarget = self.getElementByPath(path, document.getElementById("portaldetails"));
        if (parentTarget) {
          if (target.type === "checkbox" || target.type === "radio") {
            parentTarget.checked = target.checked;
          } else {
            parentTarget.value = target.value;
          }
          parentTarget.dispatchEvent(new Event('input', { bubbles: true }));
          parentTarget.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      win.document.addEventListener("input", handleInput);
      win.document.addEventListener("change", handleInput);
    };

    self.syncDOM = function () {
      if (!OptionData.popoutMode || !childWindow || childWindow.closed) return;
      
      const source = document.getElementById("portaldetails");
      const target = childWindow.document.getElementById("portaldetails");
      
      if (source && target) {
        let activePath = null;
        let selectionStart = 0;
        let selectionEnd = 0;
        const activeEl = childWindow.document.activeElement;
        
        if (activeEl && ["INPUT", "TEXTAREA"].includes(activeEl.tagName)) {
          activePath = self.getElementPath(activeEl, target);
          if (activePath) {
            try {
              selectionStart = activeEl.selectionStart || 0;
              selectionEnd = activeEl.selectionEnd || 0;
            } catch (e) {}
          }
        }

        target.innerHTML = source.innerHTML;

        if (activePath) {
          const restoredEl = self.getElementByPath(activePath, target);
          if (restoredEl) {
            restoredEl.focus();
            try {
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
        self.addToggleIcon();

        if (!OptionData.popoutMode) return;
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
      self.addToggleIcon();

      if (!OptionData.popoutMode) return;
      
      if (!childWindow || childWindow.closed) {
        self.setupChildWindow();
      }
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(self.syncDOM, 50);
    };

    self.setMode = function (state) {
      OptionData.popoutMode = state;
      self.saveOption();
      self.applyMode();
    };

    self.toggleMode = function () {
      self.setMode(!OptionData.popoutMode);
    };

    self.applyMode = function () {
      self.addToggleIcon();

      if (OptionData.popoutMode) {
        if (!document.getElementById("portal-details-ext-hide-css")) {
          const hideCss = `
            #portaldetails { display: none !important; }
            #updatestatus { bottom: 0 !important; }
          `;
          $("<style>").prop("type", "text/css").prop("id", "portal-details-ext-hide-css").html(hideCss).appendTo("head");
        }
        self.setupChildWindow();
      } else {
        $("#portal-details-ext-hide-css").remove();
        if (childWindow && !childWindow.closed) {
          childWindow.close();
        }
      }
    };

    self.start = function () {
      self.loadOption();
      
      const iconCss = `
        #portaldetails .title { position: relative; }
        #pd-ext-toggle-icon {
          position: absolute;
          top: 4px;
          right: 26px; /* 閉じるボタンの左隣へ配置 */
          width: 20px;
          height: 20px;
          cursor: pointer;
          color: #ffce00;
          z-index: 10;
          opacity: 0.7;
          transition: opacity 0.2s;
        }
        #pd-ext-toggle-icon:hover {
          opacity: 1.0;
        }
        #pd-ext-toggle-icon svg {
          transition: transform 0.3s ease; 
        }
      `;
      $("<style>").prop("type", "text/css").html(iconCss).appendTo("head");

      window.addHook("portalDetailsUpdated", self.onPortalDetailsUpdated);
      self.setupObserver();

      setTimeout(self.applyMode, 1000);
      
      console.log("[PortalDetailsExternal] Started. Popout Mode:", OptionData.popoutMode);
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
