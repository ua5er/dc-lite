/*! dc-lite 0.1.0 | MIT | https://github.com/ua5er/dc-lite
 * A tiny standalone renderer for HTML design boards written in the "design component" format:
 * {{ path }} holes, <sc-for list as>, <sc-if value>, onX="{{ fn }}" handlers, ref="{{ fn }}"
 * and a component class that extends DCLogic (state, setState, lifecycle hooks).
 * Requires morphdom (MIT) on window.morphdom for in-place DOM updates.
 */
(function (root) {
  "use strict";
  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]*?)\s*\}\}$/;

  function lookup(expr, scope) {
    if (expr === "true") return true;
    if (expr === "false") return false;
    if (expr === "null") return null;
    if (expr === "undefined" || expr === "") return undefined;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    if (/^(['"]).*\1$/.test(expr)) return expr.slice(1, -1);
    var parts = expr.split("."), v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, e) {
      var v = lookup(e, scope);
      return v == null || v === false ? "" : String(v);
    });
  }
  function holeOf(attr) { var m = WHOLE.exec(attr || ""); return m ? m[1] : ""; }

  /** Base class for board components. */
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (update, cb) {
    var patch = typeof update === "function" ? update(this.state, this.props) : update;
    if (patch) this.state = Object.assign({}, this.state, patch);
    if (this.__host) this.__host.schedule(cb);
  };
  DCLogic.prototype.forceUpdate = function (cb) { if (this.__host) this.__host.schedule(cb); };

  function Host(container, tpl, Comp, props) {
    this.container = container;
    this.tpl = tpl;
    this.events = {};
    this.listeners = [];
    this.handlers = [];
    this.refs = [];
    this.cbs = [];
    this.pending = false;
    this.mounted = false;
    var c = new Comp(props);
    c.props = props;
    if (!c.state) c.state = {};
    c.__host = this;
    this.c = c;
  }
  Host.prototype.schedule = function (cb) {
    if (cb) this.cbs.push(cb);
    if (this.pending || !this.mounted) return;
    this.pending = true;
    var self = this;
    Promise.resolve().then(function () { self.pending = false; if (self.mounted) self.update(); });
  };
  Host.prototype.build = function () {
    this.handlers = [];
    this.refs = [];
    var vals = (this.c.renderVals && this.c.renderVals()) || {};
    var out = document.createElement("div");
    var nodes = this.walk(this.tpl.content.childNodes, vals);
    for (var i = 0; i < nodes.length; i++) out.appendChild(nodes[i]);
    return out;
  };
  Host.prototype.walk = function (list, scope) {
    var res = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (n.nodeType === 3) {
        var t = n.nodeValue;
        res.push(document.createTextNode(t.indexOf("{{") < 0 ? t : interp(t, scope)));
      } else if (n.nodeType === 1) {
        var tag = n.localName;
        if (tag === "sc-for") {
          var arr = lookup(holeOf(n.getAttribute("list")), scope) || [];
          var as = n.getAttribute("as") || "item";
          for (var j = 0; j < arr.length; j++) {
            var s = Object.create(scope);
            s[as] = arr[j];
            s[as + "Index"] = j;
            res.push.apply(res, this.walk(n.childNodes, s));
          }
        } else if (tag === "sc-if") {
          if (lookup(holeOf(n.getAttribute("value")), scope)) res.push.apply(res, this.walk(n.childNodes, scope));
        } else {
          res.push(this.el(n, scope));
        }
      }
    }
    return res;
  };
  Host.prototype.el = function (n, scope) {
    var el = document.importNode(n, false);
    var attrs = n.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i], val = a.value;
      if (val.indexOf("{{") < 0) continue;
      var m = WHOLE.exec(val);
      if (!m) { el.setAttribute(a.name, interp(val, scope)); continue; }
      var v = lookup(m[1], scope);
      if (a.name === "ref") {
        el.removeAttribute("ref");
        if (v) { this.refs.push(v); el.setAttribute("data-dc-ref", String(this.refs.length - 1)); }
        continue;
      }
      if (/^on[a-z]/i.test(a.name) && a.name.length > 2) {
        el.removeAttribute(a.name);
        if (typeof v === "function") {
          var evt = a.name.slice(2).toLowerCase();
          this.handlers.push(v);
          el.setAttribute("data-dc-on-" + evt, String(this.handlers.length - 1));
          this.listen(evt);
        }
        continue;
      }
      if (v === false || v == null) el.removeAttribute(a.name);
      else el.setAttribute(a.name, String(v));
    }
    if (n.localName !== "template") {
      var kids = this.walk(n.childNodes, scope);
      for (var k = 0; k < kids.length; k++) el.appendChild(kids[k]);
    }
    return el;
  };
  // One delegated, capturing listener per event type, so handlers survive DOM patches
  // and non-bubbling media events (onPlaying, onEnded) still reach them.
  Host.prototype.listen = function (evt) {
    if (this.events[evt]) return;
    this.events[evt] = true;
    var self = this, key = "data-dc-on-" + evt;
    var fn = function (e) {
      var t = e.target;
      while (t && t !== self.container) {
        if (t.nodeType === 1 && t.hasAttribute(key)) {
          var h = self.handlers[+t.getAttribute(key)];
          if (h) h.call(self.c, e);
          return;
        }
        t = t.parentNode;
      }
    };
    this.container.addEventListener(evt, fn, true);
    this.listeners.push([evt, fn]);
  };
  Host.prototype.applyRefs = function () {
    var nodes = this.container.querySelectorAll("[data-dc-ref]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], r = this.refs[+el.getAttribute("data-dc-ref")];
      if (!r || el.__dcRef === r) continue;
      el.__dcRef = r;
      if (typeof r === "function") r(el);
      else if (typeof r === "object") r.current = el;
    }
  };
  Host.prototype.mount = function () {
    var out = this.build();
    while (out.firstChild) this.container.appendChild(out.firstChild);
    snapshot(this.container);
    this.mounted = true;
    this.applyRefs();
    this.prevState = this.c.state;
    if (this.c.componentDidMount) this.c.componentDidMount();
    return this;
  };
  Host.prototype.update = function () {
    var prevState = this.prevState || {};
    var out = this.build();
    if (root.morphdom) {
      root.morphdom(this.container, out, {
        childrenOnly: true,
        // Skip any subtree whose rendered markup has not changed since the last render.
        // This keeps CSS animations running and preserves text that component code
        // writes directly through refs (counters, typed text).
        onBeforeElUpdated: function (from, to) {
          var html = to.outerHTML;
          if (from.__dcLast === html) return false;
          from.__dcLast = html;
          return true;
        },
        onNodeAdded: function (node) { snapshot(node); return node; }
      });
    } else {
      this.container.innerHTML = "";
      while (out.firstChild) this.container.appendChild(out.firstChild);
    }
    this.applyRefs();
    if (this.c.componentDidUpdate) this.c.componentDidUpdate(this.c.props, prevState);
    this.prevState = this.c.state;
    var cbs = this.cbs; this.cbs = [];
    for (var i = 0; i < cbs.length; i++) cbs[i]();
  };
  Host.prototype.destroy = function () {
    if (!this.mounted) return;
    this.mounted = false;
    if (this.c.componentWillUnmount) this.c.componentWillUnmount();
    for (var i = 0; i < this.listeners.length; i++) this.container.removeEventListener(this.listeners[i][0], this.listeners[i][1], true);
    this.container.innerHTML = "";
  };
  function snapshot(node) {
    if (!node || node.nodeType !== 1) return;
    node.__dcLast = node.outerHTML;
    var all = node.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) all[i].__dcLast = all[i].outerHTML;
  }

  function defaultsFrom(script) {
    var props = {};
    try {
      var decl = JSON.parse(script.getAttribute("data-props") || "{}");
      Object.keys(decl).forEach(function (k) {
        if (k.charAt(0) !== "$" && decl[k] && "default" in decl[k]) props[k] = decl[k]["default"];
      });
    } catch (e) { /* no declared props */ }
    return props;
  }
  function compile(script) {
    return new Function("DCLogic", "React", script.textContent + "\n;return Component;")(DCLogic, root.React);
  }

  /**
   * Mount a board.
   * @param {Element} container  where the board renders
   * @param {HTMLTemplateElement} template  the board markup
   * @param {HTMLScriptElement} script  <script type="text/x-dc"> with the Component class
   * @param {Object} [props]  overrides for the declared data-props defaults
   */
  function mount(container, template, script, props) {
    var Comp = compile(script);
    var p = Object.assign(defaultsFrom(script), props || {});
    return new Host(container, template, Comp, p).mount();
  }

  // Minimal React.createRef shim, some boards use it for refs.
  if (!root.React) root.React = { createRef: function () { return { current: null }; } };
  root.DCLogic = DCLogic;
  root.DCLite = { mount: mount, DCLogic: DCLogic, version: "0.1.0" };

  function boot() {
    var tpl = document.getElementById("dc-template");
    var script = document.querySelector('script[type="text/x-dc"]');
    var container = document.getElementById("dc-root");
    if (tpl && script && container && !container.hasAttribute("data-dc-manual")) {
      root.DCLite.host = mount(container, tpl, script);
    }
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : this);
