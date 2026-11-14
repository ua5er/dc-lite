# dc-lite: run design boards as standalone HTML

dc-lite is a 10 KB open-source renderer (3.4 KB gzipped) that turns an interactive HTML design board into a plain web page. Boards that use `{{ holes }}`, `<sc-for>`, `<sc-if>`, `onClick="{{ fn }}"` handlers and a component class extending `DCLogic` run on any static host, with their animations, counters, timers and click logic intact. There is no editor, no login and no build step. MIT licence.

**Live demo:** [ua5er.github.io/dc-lite](https://ua5er.github.io/dc-lite/) · **In production:** [19 live paywall and onboarding concepts](https://ua5er.github.io/user-acquisition-skills/#paywalls)

## Why it exists

I design paywalls and onboarding flows as interactive boards, the kind exported from Claude Design. Each one is a single `.dc.html` file whose markup and logic are small, but it only runs inside the editor. I wanted to show the live screens, with the hearts flying and the counters spinning, on a public GitHub Pages site and on client calls, without screen recordings and without sharing editor links.

dc-lite is the missing piece: about 250 lines that read the same format and render it in the browser. It does not include or copy any editor code. It is an independent implementation of the markup format, written from the boards themselves.

## Quick start

```bash
git clone https://github.com/ua5er/dc-lite && cd dc-lite

# Convert a board. Put its images in ./assets, named by asset id (abc123...ef.webp)
node tools/convert.mjs path/to/Board.dc.html --out dist --assets ./assets

# Copy the runtime next to the page and open it
cp src/dc-lite.js dist/ && npx serve dist
```

The converter moves the board's `<helmet>` into `<head>`, wraps the markup in an inert `<template>`, keeps the component script, rewrites `/_blob/<id>` asset links to local files and adds two script tags: morphdom and dc-lite. Node 18+ and no dependencies.

### Or by hand

```html
<div id="dc-root"></div>
<template id="dc-template">
  <p>Hello, {{ name }}. <button type="button" onClick="{{ wave }}">Wave</button></p>
  <sc-if value="{{ waved }}"><p>You waved {{ count }} times.</p></sc-if>
</template>
<script type="text/x-dc" data-props='{"name":{"default":"Vlad"}}'>
class Component extends DCLogic {
  state = { count: 0 };
  renderVals() {
    return {
      name: this.props.name,
      count: this.state.count,
      waved: this.state.count > 0,
      wave: () => this.setState((s) => ({ count: s.count + 1 }))
    };
  }
}
</script>
<script src="https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js"></script>
<script src="dc-lite.js"></script>
```

The page boots itself when it finds `#dc-root`, `#dc-template` and a `<script type="text/x-dc">`. To mount by hand, add `data-dc-manual` to the root and call `DCLite.mount(root, template, script, props)`. It returns a host with `destroy()`.

## What is supported

| Syntax | Behaviour |
|---|---|
| `{{ a.b.c }}` in text and attributes | Dotted lookup into the object returned by `renderVals()`. `false`, `null` and `undefined` render as empty. Literals `true`, `false`, numbers and quoted strings work too. |
| `attr="{{ x }}"` | When the whole value is one hole and it resolves to `false` or `null`, the attribute is removed. |
| `<sc-for list="{{ items }}" as="item">` | Repeats its children per item. `itemIndex` holds the index. |
| `<sc-if value="{{ flag }}">` | Renders its children when the value is truthy. |
| `onClick="{{ fn }}"`, `onInput`, `onPlaying` and any `onX` | Delegated, capturing listeners on the root, so they survive DOM patches and also catch media events that do not bubble. |
| `ref="{{ fn }}"` or `ref="{{ obj }}"` | Callback refs get the element; object refs get `.current`. `React.createRef()` is shimmed. |
| `data-props` on the script | Each key's `default` becomes `this.props`. Keys starting with `$` are ignored. |
| `hint-*` attributes | Ignored. They are editor hints. |

**Component API:** `state`, `setState(patch | fn, cb)`, `forceUpdate(cb)`, `componentDidMount`, `componentDidUpdate(prevProps, prevState)`, `componentWillUnmount` and `renderVals()`. Several `setState` calls in one tick are batched into one render.

## How updates stay smooth

Each render builds a fresh DOM tree from the template and patches the live one with [morphdom](https://github.com/patrick-steele-idem/morphdom). A subtree whose rendered markup has not changed since the last render is skipped entirely. That one rule does two things:

1. CSS animations keep running. Nodes are not replaced, so keyframes do not restart when a timer ticks somewhere else on the board.
2. Text that component code writes directly through a ref is preserved. A likes counter animated with `requestAnimationFrame` keeps its value when a click re-renders the board, the way it would in React.

The [demo](https://ua5er.github.io/dc-lite/) shows both: the spend counter ticks 60 times a second through a ref while Kill and Scale buttons re-render the list.

## Limits

- No `<dc-import>` or `<x-import>` (nested components and design-system bundles).
- No editor UI: tweaks come only from `data-props` defaults or the `props` argument of `DCLite.mount`.
- Holes are lookups, not expressions. Compute values in `renderVals()`, as the format expects.
- Assets are not fetched for you. Download a board's images and pass the folder to the converter with `--assets`.

## Files

- `src/dc-lite.js`: the runtime
- `tools/convert.mjs`: board to standalone page converter
- `demo/`: an original demo board (`ad-monitor.dc.html`) and its converted page

## Not affiliated

dc-lite is an independent open-source project. It is not made, endorsed or supported by Anthropic. Claude is a trademark of Anthropic, used here only to say which board format dc-lite reads.

## Privacy

The hosted demo at ua5er.github.io counts anonymous page views and contact clicks with PostHog (EU), without cookies or personal data. It honours Do Not Track and Global Privacy Control. Copies you host yourself send nothing.

## Licence and credits

MIT, see [LICENSE](LICENSE). morphdom is MIT, copyright Patrick Steele-Idem, loaded from jsDelivr or vendored in `demo/`.

## Author

Written by [Vlad Yasinski](https://www.roimobi.com/?utm_source=github&utm_medium=readme&utm_campaign=dc-lite), AI growth consultant for app and subscription businesses. I build paid acquisition systems and the funnels behind them. More open source: [user-acquisition-skills](https://github.com/ua5er/user-acquisition-skills), agent skills for paid UA, Meta Ads, paywalls and onboarding. [LinkedIn](https://www.linkedin.com/in/vlad-yasinski-ua5er/) · [Telegram](https://www.roimobi.com/tg?src=github-dc-lite)
