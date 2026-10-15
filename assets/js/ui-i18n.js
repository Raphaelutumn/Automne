/*!
 * UI 语言切换（中文 / English / Français）
 *
 * 词表来自 data/ui.yaml，由 Hugo 在构建时注入到下面的 DICT 里（单一事实来源）。
 * 页面上凡是带 data-i18n（纯文本）/ data-i18n-html（含链接等 HTML）/
 * data-i18n-placeholder / data-i18n-aria-label / data-i18n-title / data-i18n-alt
 * 的元素，都会按当前语言替换文案；
 * 带数字的文案用 data-i18n-vars='{"count":3}' 传参。
 *
 * 各页面顶部的一级/二级标题与副标题（page.<栏目>.title / .description）
 * 按当前路径自动匹配，词条写在 data/ui.yaml 的 page.* 下。
 *
 * 页面脚本需要动态生成文案时，用 window.uiT(key, vars)，
 * 并在 "ui-lang-change" 事件里重新渲染。
 *
 * 注意：只翻译界面，文章与相册等内容保持原样。语言偏好只存在浏览器 localStorage。
 */
(function () {
  "use strict";

  var DICT = {{ hugo.Data.ui | jsonify }};
  var BASE_PATH = "{{ site.Home.RelPermalink }}";
  var STORAGE_KEY = "ui-lang";
  var DEFAULT_LANG = "zh";
  var HTML_LANG = { zh: "zh-CN", en: "en", fr: "fr" };
  var PENDING_CLASS = "i18n-pending";
  var PENDING_PAGE_CLASS = "i18n-pending-page";

  /* 属性类文案：元素属性 -> 要替换的属性名 */
  var ATTR_KEYS = {
    "data-i18n-placeholder": "placeholder",
    "data-i18n-aria-label": "aria-label",
    "data-i18n-title": "title",
    "data-i18n-alt": "alt"
  };

  /* 主题自带的文案（PaperMod 模板里写死的部分），按选择器就地替换。
     选择器万一随主题升级失效，最坏情况只是这几处文字保持原文。 */
  var PATCHES = [
    { sel: "nav.pagination a.prev", key: "theme.prev_page" },
    { sel: "nav.pagination a.next", key: "theme.next_page" },
    { sel: "#searchInput", key: "page.search_placeholder", attr: "placeholder" },
    { sel: ".profile_inner > span", key: "home.tagline" },
    { sel: ".works-intro p", key: "page.works.intro", varsFrom: ".works-intro" },
    { sel: ".lang-switch", key: "common.lang_switch", attr: "aria-label" },
    { sel: "#theme-toggle", key: "common.theme_toggle", attr: "aria-label" }
  ];

  /* 页面标题/副标题的挂载点：只作用于站点顶层页面（/works/、/about/ 这种），
     子页面（相册、文章）保持原样 */
  var PAGE_FIELDS = [
    { sel: ".page-header h1", field: "title" },
    { sel: ".page-header .post-description", field: "description" },
    { sel: ".post-single .post-header .post-title", field: "title" },
    { sel: ".post-single .post-header .post-description", field: "description" }
  ];

  function strings(lang) {
    return DICT[lang] || DICT[DEFAULT_LANG] || {};
  }

  function pick(value, count) {
    if (value && typeof value === "object") {
      var one = value.one || value.other;
      var other = value.other || value.one;
      return count === 1 ? one : other;
    }
    return value;
  }

  function t(lang, key, vars) {
    if (!key) return null;
    var raw = pick(strings(lang)[key], vars && vars.count);
    if (typeof raw !== "string") return null;
    return raw.replace(/\{(\w+)\}/g, function (match, name) {
      return vars && vars[name] != null ? String(vars[name]) : match;
    });
  }

  function varsOf(el) {
    var raw = el.getAttribute("data-i18n-vars");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function fill(el, value, attr) {
    if (value == null) return;
    if (attr) {
      el.setAttribute(attr, value);
    } else {
      el.textContent = value;
    }
  }

  /* 只替换元素里的第一段文字，保留标题里的 svg、锚点等子节点 */
  function setFirstText(el, value) {
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeType === 3 && nodes[i].nodeValue.trim() !== "") {
        nodes[i].nodeValue = value;
        return;
      }
    }
    el.insertBefore(document.createTextNode(value), el.firstChild);
  }

  /* 当前页面的一级目录名（works / gallery / about ...）；子页面返回 null */
  function pageSection() {
    var path = location.pathname.split("?")[0].split("#")[0];
    if (BASE_PATH && path.indexOf(BASE_PATH) === 0) path = path.slice(BASE_PATH.length);
    path = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/index\.html$/, "").replace(/\/+$/, "");
    if (!path || path.indexOf("/") !== -1) return null;
    try {
      return decodeURIComponent(path);
    } catch (err) {
      return path;
    }
  }

  function applyText(root, lang) {
    var nodes = root.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      fill(el, t(lang, el.getAttribute("data-i18n"), varsOf(el)), null);
    }
    /* data-i18n-html：词条里带链接等 HTML 时用 */
    var rich = root.querySelectorAll("[data-i18n-html]");
    for (var j = 0; j < rich.length; j++) {
      var node = rich[j];
      var html = t(lang, node.getAttribute("data-i18n-html"), varsOf(node));
      if (html != null) node.innerHTML = html;
    }
  }

  function applyAttrs(root, lang) {
    Object.keys(ATTR_KEYS).forEach(function (dataAttr) {
      var nodes = root.querySelectorAll("[" + dataAttr + "]");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        fill(el, t(lang, el.getAttribute(dataAttr), varsOf(el)), ATTR_KEYS[dataAttr]);
      }
    });
  }

  function applyPatches(lang) {
    PATCHES.forEach(function (patch) {
      var nodes = document.querySelectorAll(patch.sel);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var varsEl = el;
        if (patch.varsFrom) {
          varsEl = el.closest(patch.varsFrom) || document.querySelector(patch.varsFrom) || el;
        }
        fill(el, t(lang, patch.key, varsOf(varsEl)), patch.attr || null);
      }
    });
  }

  function applyPageLabels(lang) {
    var section = pageSection();
    if (!section) return;
    PAGE_FIELDS.forEach(function (field) {
      var value = t(lang, "page." + section + "." + field.field, null);
      if (value == null) return;
      var nodes = document.querySelectorAll(field.sel);
      for (var i = 0; i < nodes.length; i++) {
        setFirstText(nodes[i], value);
      }
    });
  }

  /* 当前页面有标题词条吗？有才在首屏短暂隐藏，免得子页面白闪 */
  function hasPageLabel(lang) {
    var section = pageSection();
    if (!section || !DICT[lang]) return false;
    return DICT[lang]["page." + section + ".title"] != null ||
      DICT[lang]["page." + section + ".description"] != null;
  }

  function applyAll(lang) {
    applyText(document, lang);
    applyAttrs(document, lang);
    applyPatches(lang);
    applyPageLabels(lang);
  }

  function currentLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DICT[saved]) return saved;
    } catch (err) {
      /* localStorage 不可用时用默认语言 */
    }
    return DEFAULT_LANG;
  }

  function markSwitch(lang) {
    var buttons = document.querySelectorAll("[data-lang]");
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute("data-lang") === lang;
      buttons[i].classList.toggle("active", on);
      buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  var active = currentLang();

  function setLang(lang, persist) {
    if (!DICT[lang]) lang = DEFAULT_LANG;
    active = lang;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch (err) {
        /* 忽略写入失败 */
      }
    }
    document.documentElement.setAttribute("data-ui-lang", lang);
    document.documentElement.setAttribute("lang", HTML_LANG[lang] || lang);
    try {
      applyAll(lang);
    } finally {
      document.documentElement.classList.remove(PENDING_CLASS);
      document.documentElement.classList.remove(PENDING_PAGE_CLASS);
    }
    markSwitch(lang);
    document.dispatchEvent(new CustomEvent("ui-lang-change", { detail: { lang: lang } }));
  }

  /* 页面脚本用：window.uiT("works.result", { count: 3 }) */
  window.uiT = function (key, vars) {
    var value = t(active, key, vars);
    return value == null ? "" : value;
  };
  window.changeUiLang = function (lang) {
    setLang(lang, true);
  };
  window.getUiLang = function () {
    return active;
  };

  /* 首屏先按已保存的语言打标记：非中文时短暂隐藏待翻译的界面文字，避免闪一下中文 */
  document.documentElement.setAttribute("data-ui-lang", active);
  document.documentElement.setAttribute("lang", HTML_LANG[active] || active);
  if (active !== DEFAULT_LANG) {
    document.documentElement.classList.add(PENDING_CLASS);
    if (hasPageLabel(active)) {
      document.documentElement.classList.add(PENDING_PAGE_CLASS);
    }
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest("[data-lang]");
    if (!button) return;
    event.preventDefault();
    setLang(button.getAttribute("data-lang"), true);
  });

  function boot() {
    try {
      setLang(active, false);
    } catch (err) {
      document.documentElement.classList.remove(PENDING_CLASS);
      document.documentElement.classList.remove(PENDING_PAGE_CLASS);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
