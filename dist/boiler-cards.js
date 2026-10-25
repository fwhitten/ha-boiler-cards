/*!
 * Boiler Cards for Home Assistant
 * https://github.com/fwhitten/ha-boiler-cards
 * MIT licence
 */

const VERSION = '0.1.2';
const REPO_URL = 'https://github.com/fwhitten/ha-boiler-cards';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const ON_STATES = new Set(['on', 'true', 'heating', 'heat', 'open', 'running', 'active', 'yes', '1']);

function stateObj(hass, id) {
  return id && hass && hass.states ? hass.states[id] : undefined;
}

function numState(hass, id) {
  const s = stateObj(hass, id);
  if (!s) return null;
  const v = parseFloat(s.state);
  return Number.isFinite(v) ? v : null;
}

function onState(hass, id) {
  const s = stateObj(hass, id);
  if (!s) return null;
  return ON_STATES.has(String(s.state).toLowerCase());
}

function pumpMode(hass, id) {
  const s = stateObj(hass, id);
  if (!s) return null;
  const v = String(s.state).toLowerCase();
  if (/overrun|over_run|run[-_ ]?on|post[-_ ]?run/.test(v)) return 'overrun';
  return ON_STATES.has(v) ? 'on' : 'off';
}

function numAttr(obj, key) {
  if (!obj || !obj.attributes) return null;
  const v = parseFloat(obj.attributes[key]);
  return Number.isFinite(v) ? v : null;
}

/* Number formatting follows the user's Home Assistant profile (language and
   number format); BoilerBase updates this whenever hass changes. */
let numberLocale;
const NUMBER_FORMAT_LOCALES = { comma_decimal: 'en-US', decimal_comma: 'de', space_comma: 'fr', system: undefined };

function setNumberLocale(hass) {
  const locale = hass && hass.locale;
  if (!locale) return;
  numberLocale = locale.number_format in NUMBER_FORMAT_LOCALES ? NUMBER_FORMAT_LOCALES[locale.number_format] : locale.language;
}

function fmtNum(v, dp = 0) {
  if (v == null || !Number.isFinite(v)) return '--';
  try {
    return v.toLocaleString(numberLocale, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  } catch (err) {
    return v.toFixed(dp);
  }
}

function deg(v, dp = 0) {
  return v == null || !Number.isFinite(v) ? '--' : `${fmtNum(v, dp)}°`;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* Formats a time the way the user set it in their Home Assistant profile. */
function clock(t, hass) {
  const locale = hass && hass.locale;
  const format = locale && locale.time_format;
  const options = { hour: '2-digit', minute: '2-digit' };
  if (format === '12') options.hour12 = true;
  if (format === '24') options.hour12 = false;
  const language = format === 'system' || !locale ? undefined : locale.language;
  try {
    return new Date(t).toLocaleTimeString(language, options);
  } catch (err) {
    return new Date(t).toLocaleTimeString(undefined, options);
  }
}

/* Brings `target`'s children in line with `source`'s, reusing nodes that are
   already there. Keeping nodes (rather than replacing innerHTML) keeps the
   card's height steady between updates, keeps focus, and lets CSS animations
   run on instead of restarting on every sensor update. */
function morph(target, source) {
  const next = Array.from(source.childNodes);
  next.forEach((node, i) => {
    const current = target.childNodes[i];
    if (!current) {
      target.appendChild(node);
    } else if (current.nodeType !== node.nodeType || current.nodeName !== node.nodeName) {
      target.replaceChild(node, current);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      Array.from(current.attributes).forEach((a) => {
        if (!node.hasAttribute(a.name)) current.removeAttribute(a.name);
      });
      Array.from(node.attributes).forEach((a) => {
        if (current.getAttribute(a.name) !== a.value) current.setAttribute(a.name, a.value);
      });
      morph(current, node);
    } else if (current.nodeValue !== node.nodeValue) {
      current.nodeValue = node.nodeValue;
    }
  });
  while (target.childNodes.length > next.length) target.removeChild(target.lastChild);
}

function signature(hass, ids) {
  return ids
    .filter(Boolean)
    .map((id) => {
      const s = stateObj(hass, id);
      return s ? `${id}=${s.state}@${s.last_updated}` : `${id}=-`;
    })
    .join('|');
}

function findEntity(hass, domain, re) {
  return Object.keys((hass && hass.states) || {}).find((id) => id.startsWith(`${domain}.`) && re.test(id)) || '';
}

const ICONS = {
  outdoor: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z"/>',
  indoor: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  radiator: '<path d="M6 5v14M10 5v14M14 5v14M18 5v14M4 8h16M4 16h16"/>',
  underfloor: '<path d="M3 7c3-2.5 6 2.5 9 0s6 2.5 9 0M3 12c3-2.5 6 2.5 9 0s6 2.5 9 0M3 18h18"/>',
  droplet: '<path d="M12 3.5s6 6.4 6 10.9a6 6 0 0 1-12 0c0-4.5 6-10.9 6-10.9z"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
};

function icon(name, size = 18, strokeWidth = 1.8) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

const FLAME_OUTER = 'M12 1c1 5 8 9 8 17a8 8 0 0 1-16 0c0-4 2.5-6.5 4.5-8.5.3 3 1.6 4.8 3.3 5.3C12.6 10.5 10.8 6 12 1z';
const FLAME_INNER = 'M12 13c.5 2.5 4 4 4 7.5a4 4 0 0 1-8 0c0-2 1.2-3.2 2.2-4 .2 1.2.8 2 1.6 2.2C12 16.6 11.4 15 12 13z';

/* Zones are shared by the flow card and the history card. */
function zoneIcon(zone) {
  if (zone.icon === 'underfloor' || zone.icon === 'ufh') return 'underfloor';
  if (zone.icon === 'radiator') return 'radiator';
  return /ufh|floor/i.test(zone.name || '') ? 'underfloor' : 'radiator';
}

/* Thermostats that report hvac_action are trusted. Those that don't count as
   heating while in a heating mode and below their target. */
function climateHeating(state, attrs) {
  const action = attrs && attrs.hvac_action;
  if (action != null) return action === 'heating' || action === 'preheating';
  const current = parseFloat(attrs && attrs.current_temperature);
  const target = parseFloat(attrs && attrs.temperature);
  return ['heat', 'auto', 'heat_cool'].includes(state) && Number.isFinite(current) && Number.isFinite(target) && current < target;
}

function zoneModel(hass, zone) {
  const climate = stateObj(hass, zone.climate_entity);
  const call = stateObj(hass, zone.heat_call_entity);
  let heating = false;
  if (call) heating = ON_STATES.has(String(call.state).toLowerCase());
  else if (climate) heating = climateHeating(climate.state, climate.attributes);
  const humidity = zone.humidity_entity ? numState(hass, zone.humidity_entity) : numAttr(climate, 'current_humidity');
  return {
    name: zone.name || (climate && climate.attributes.friendly_name) || zone.climate_entity || 'Zone',
    icon: zoneIcon(zone),
    entity: zone.climate_entity || zone.heat_call_entity || '',
    heating,
    current: numAttr(climate, 'current_temperature'),
    target: numAttr(climate, 'temperature'),
    humidity,
    since: call ? call.last_changed : null,
    hasCall: !!zone.heat_call_entity,
  };
}

function zoneIds(zones) {
  return (zones || []).flatMap((z) => [z.climate_entity, z.heat_call_entity, z.humidity_entity]);
}

const BASE_CSS = `
:host {
  --bc-bg: var(--boiler-card-background, #171A1F);
  --bc-tile: var(--boiler-card-tile, #1F242B);
  --bc-line: #2A3038;
  --bc-text: var(--boiler-card-text, #EEF1F4);
  --bc-muted: #A3ABB5;
  --bc-faint: #8C95A0;
  --bc-heat: #FF8A3D;
  --bc-heat-text: #FFB07A;
  --bc-flow: #FF9A55;
  --bc-return: #4C8DF0;
  --bc-return-text: #7FB0FF;
  --bc-dhw: #C084FC;
  --bc-dhw-text: #D9B8FF;
  --bc-flame: #F5C451;
  display: block;
}
ha-card {
  display: block;
  height: 100%;
  background: var(--bc-bg);
  color: var(--bc-text);
  border: none;
  border-radius: var(--ha-card-border-radius, 24px);
  box-sizing: border-box;
  overflow: hidden;
  font-family: var(--boiler-card-font, inherit);
}
.tap { all: unset; cursor: pointer; box-sizing: border-box; }
.tap:focus-visible { outline: 2px solid var(--bc-heat-text); outline-offset: 2px; border-radius: 6px; }
.num { font-variant-numeric: tabular-nums; }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.title { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; }
.sub { font-size: 13px; color: var(--bc-muted); margin-top: 2px; }
.dot { width: 10px; height: 10px; border-radius: 5px; background: currentColor; flex-shrink: 0; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;

class BoilerBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sig = '';
    this.shadowRoot.addEventListener('click', (ev) => this._onClick(ev));
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    this._config = { ...config };
    this._sig = '';
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    setNumberLocale(hass);
    this._update();
  }

  get hass() {
    return this._hass;
  }

  _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset && n.dataset.entity);
    if (el && el.dataset.entity) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: el.dataset.entity }, bubbles: true, composed: true }));
    }
  }

  _update(force = false) {
    if (!this._hass || !this._config) return;
    const locale = this._hass.locale || {};
    const sig = `${this._signature()}|${locale.language}/${locale.number_format}/${locale.time_format}`;
    if (!force && sig === this._sig) return;
    this._sig = sig;
    if (!this._styled) {
      const style = document.createElement('style');
      style.textContent = BASE_CSS + this.constructor.styles;
      this.shadowRoot.appendChild(style);
      this._card = document.createElement('ha-card');
      this.shadowRoot.appendChild(this._card);
      this._styled = true;
    }
    const template = document.createElement('template');
    template.innerHTML = this._render();
    morph(this._card, template.content);
  }

  _tapAttrs(entityId, label) {
    return entityId ? `data-entity="${esc(entityId)}" aria-label="${esc(label)}"` : 'disabled';
  }
}

/* ------------------------------------------------------------------ */
/* Live flow card                                                      */
/* ------------------------------------------------------------------ */

class BoilerFlowCard extends BoilerBase {
  static styles = `
ha-card { padding: 20px 22px 22px; }
.lf { container: lf / inline-size; }
.head { margin-bottom: 16px; flex-wrap: nowrap; }
.head > :first-child { flex-shrink: 0; }
.pill { display: inline-flex; align-items: center; gap: 10px; height: 40px; padding: 0 16px; border-radius: 20px; font-size: 14px; font-weight: 600; min-width: 0; white-space: nowrap; }
.pill-sub { font-weight: 500; opacity: 0.85; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.m-heat { background: rgba(255,138,61,.14); color: var(--bc-heat-text); }
.m-dhw { background: rgba(192,132,252,.14); color: var(--bc-dhw-text); }
.m-over { background: rgba(76,141,240,.14); color: #9CC2FF; }
.m-idle { background: #232830; color: var(--bc-muted); }
.lf-body { display: flex; flex-direction: column; }
.lf-top { display: flex; gap: 16px; align-items: flex-start; }
.bslot { position: relative; width: 176px; height: 246px; flex-shrink: 0; }
.casing { position: absolute; left: 0; top: 0; width: 176px; height: 236px; box-sizing: border-box; background: #2B3139; border: 1px solid #3A414B; border-radius: 16px; overflow: hidden; }
.vent { position: absolute; left: 0; right: 0; top: 0; height: 14px; background: #323943; border-bottom: 1px solid #3A414B; display: flex; align-items: center; justify-content: center; gap: 6px; }
.vent span { width: 18px; height: 3px; border-radius: 2px; background: #22272E; }
.flame { position: absolute; left: 66px; top: 32px; width: 44px; height: 55px; display: flex; }
.disp { position: absolute; left: 56px; top: 104px; width: 64px; height: 64px; }
.disp-val { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
.divider { position: absolute; left: 14px; right: 14px; top: 190px; height: 1px; background: #3A414B; }
.pumprow { position: absolute; left: 14px; right: 14px; top: 198px; height: 28px; display: flex; align-items: center; gap: 8px; font-size: 11px; }
.pumprow .lbl { color: var(--bc-muted); }
.pumprow .val { margin-left: auto; font-weight: 600; }
.port { position: absolute; top: 235px; width: 12px; height: 11px; background: #4A525D; }
.nstat { display: flex; flex-direction: column; gap: 12px; padding-top: 6px; min-width: 0; }
.stat { display: flex; flex-direction: column; gap: 2px; }
.sl { font-size: 12px; line-height: 16px; color: var(--bc-muted); }
.sv { font-size: 16px; line-height: 20px; font-weight: 600; white-space: nowrap; }
.sv small { font-size: 12px; font-weight: 500; color: var(--bc-muted); }
.nrows { position: relative; height: 150px; }
.nrows.no-dhw { height: 100px; }
.nrows .stat { position: absolute; left: 192px; }
.r-flow { top: 8px; } .r-ret { top: 57px; } .r-dhw { top: 106px; }
.dt { position: absolute; left: 106px; top: 51px; width: 72px; display: flex; align-items: baseline; justify-content: center; gap: 5px; white-space: nowrap; }
.dt span:first-child { font-size: 12px; color: var(--bc-muted); }
.dt span:last-child { font-size: 15px; font-weight: 600; }
.p { position: absolute; background: var(--bc-line); }
.ph { border-radius: 0 4px 4px 0; }
.pf-v { left: 132px; top: 0; width: 8px; height: 40px; } .pf-h { left: 132px; top: 32px; width: 52px; height: 8px; }
.pr-v { left: 84px; top: 0; width: 8px; height: 89px; } .pr-h { left: 84px; top: 81px; width: 100px; height: 8px; }
.pd-v { left: 36px; top: 0; width: 8px; height: 138px; } .pd-h { left: 36px; top: 130px; width: 148px; height: 8px; }
.hf { background-image: repeating-linear-gradient(90deg,#FF8A3D 0 16px,#FFC59E 16px 24px); background-size: 24px 100%; animation: mr 1.1s linear infinite; }
.hr { background-image: repeating-linear-gradient(90deg,#4C8DF0 0 16px,#9CC2FF 16px 24px); background-size: 24px 100%; animation: ml 1.1s linear infinite; }
.hd { background-image: repeating-linear-gradient(90deg,#C084FC 0 16px,#E2C2FF 16px 24px); background-size: 24px 100%; animation: mr 1.1s linear infinite; }
.vf { background-image: repeating-linear-gradient(180deg,#FF8A3D 0 16px,#FFC59E 16px 24px); background-size: 100% 24px; animation: md 1.1s linear infinite; }
.vr { background-image: repeating-linear-gradient(180deg,#4C8DF0 0 16px,#9CC2FF 16px 24px); background-size: 100% 24px; animation: mu 1.1s linear infinite; }
.vd { background-image: repeating-linear-gradient(180deg,#C084FC 0 16px,#E2C2FF 16px 24px); background-size: 100% 24px; animation: md 1.1s linear infinite; }
.slow { animation-duration: 3.2s; }
@keyframes mr { to { background-position: 24px 0; } }
@keyframes ml { to { background-position: -24px 0; } }
@keyframes md { to { background-position: 0 24px; } }
@keyframes mu { to { background-position: 0 -24px; } }
.fl { transform-box: fill-box; transform-origin: 50% 100%; animation: fk 1.3s ease-in-out infinite alternate; }
.fl2 { transform-box: fill-box; transform-origin: 50% 100%; animation: fk2 .7s ease-in-out infinite alternate; }
@keyframes fk { 0% { transform: scale(1,1) skewX(0deg); } 35% { transform: scale(.94,1.07) skewX(-3deg); } 70% { transform: scale(1.03,.95) skewX(2deg); } 100% { transform: scale(.97,1.1) skewX(0deg); } }
@keyframes fk2 { 0% { transform: scale(1,1); opacity: 1; } 100% { transform: scale(.88,1.14); opacity: .78; } }
.sp { transform-box: view-box; transform-origin: 12px 12px; animation: spin 1s linear infinite; }
.sp-slow { animation-duration: 2.8s; }
@keyframes spin { to { transform: rotate(360deg); } }
.c-on { color: var(--bc-heat-text); } .c-off { color: var(--bc-muted); }
.p-on { color: var(--bc-return-text); } .p-over { color: var(--bc-heat-text); } .p-off { color: var(--bc-faint); }
.nzones { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
.zt { box-sizing: border-box; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--bc-line); background: var(--bc-tile); display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.zt-on { background: #231C17; border-color: rgba(255,138,61,.38); }
.zt-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; min-width: 0; }
.zt-name svg { flex-shrink: 0; color: #6B7480; }
.zt-on .zt-name svg { color: var(--bc-heat); }
.zt-name span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zt-temp { display: flex; align-items: baseline; gap: 6px; margin-top: 2px; }
.zt-temp b { font-size: 30px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
.zt-temp span { font-size: 13px; color: var(--bc-muted); }
.zt-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; }
.badge { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.badge .dot { width: 6px; height: 6px; }
.b-heat { background: rgba(255,138,61,.18); color: var(--bc-heat-text); }
.b-idle { background: var(--bc-line); color: var(--bc-muted); }
.hum { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--bc-muted); }
.since { font-size: 11px; color: var(--bc-faint); }
@container lf (min-width: 540px) {
  .lf-body { display: grid; grid-template-columns: 320px minmax(0, 1fr); column-gap: 24px; align-items: start; }
  .lf-top { grid-column: 1; grid-row: 1; }
  .nrows { grid-column: 1; grid-row: 2; }
  .nzones { grid-column: 2; grid-row: 1 / span 2; grid-template-columns: minmax(0, 1fr); margin-top: 0; }
}
`;

  static getStubConfig(hass) {
    const f = (re, domain = 'sensor') => findEntity(hass, domain, re);
    const climates = Object.keys(hass.states).filter((id) => id.startsWith('climate.')).slice(0, 2);
    return {
      flow_temp_entity: f(/flow.*temp/),
      flow_target_entity: f(/(flow.*(target|setpoint))|((target|setpoint).*flow)/),
      return_temp_entity: f(/return.*temp/),
      dhw_temp_entity: f(/(dhw|hot_?water).*temp/),
      dhw_target_entity: f(/(dhw|hot_?water).*(target|setpoint)/),
      flame_entity: f(/flame/, 'binary_sensor'),
      pump_entity: f(/pump/),
      zones: climates.map((id) => ({ name: hass.states[id].attributes.friendly_name || id, climate_entity: id })),
    };
  }

  static getConfigElement() {
    return document.createElement('boiler-flow-card-editor');
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 'auto' };
  }

  _signature() {
    const c = this._config;
    return signature(this._hass, [
      c.flow_temp_entity, c.flow_target_entity, c.return_temp_entity, c.dhw_temp_entity, c.dhw_target_entity,
      c.flame_entity, c.pump_entity, c.dhw_active_entity, ...zoneIds(c.zones),
    ]);
  }

  _model() {
    const c = this._config;
    const h = this._hass;
    const zones = (c.zones || []).map((z) => zoneModel(h, z));
    const calling = zones.filter((z) => z.heating);
    const flame = onState(h, c.flame_entity);
    let pump = pumpMode(h, c.pump_entity);
    let dhwActive;
    if (c.dhw_active_entity) dhwActive = !!onState(h, c.dhw_active_entity);
    else dhwActive = !!flame && calling.length === 0 && c.infer_hot_water !== false;

    let mode = 'idle';
    if (dhwActive) mode = 'dhw';
    else if (calling.length) mode = 'heat';
    else if (pump === 'overrun') mode = 'over';
    if (pump == null) pump = mode === 'heat' || mode === 'dhw' ? 'on' : 'off';

    const allCalling = zones.length > 1 && calling.length === zones.length;
    const modeLabel = { heat: 'Heating', dhw: 'Hot water', over: 'Pump overrun', idle: 'Idle' }[mode];
    let modeSub;
    if (mode === 'heat') {
      if (flame === false) modeSub = 'flame cycling off';
      else if (allCalling) modeSub = zones.length === 2 ? 'both zones calling' : 'all zones calling';
      else modeSub = `${calling.map((z) => z.name).join(', ')} calling`;
    } else if (mode === 'dhw') {
      modeSub = calling.length ? 'tap running, heating paused' : 'tap running';
    } else if (mode === 'over') {
      modeSub = 'cooling down';
    } else {
      modeSub = 'no demand';
    }

    const circulating = mode !== 'dhw' && pump !== 'off';
    const slow = pump === 'overrun' ? ' slow' : '';
    const flow = numState(h, c.flow_temp_entity);
    const ret = numState(h, c.return_temp_entity);
    const rawTarget = numState(h, c.flow_target_entity);
    const target = rawTarget > 0 ? rawTarget : null;
    const latest = [c.flow_temp_entity, c.return_temp_entity, c.flame_entity]
      .map((id) => stateObj(h, id))
      .filter(Boolean)
      .map((s) => Date.parse(s.last_updated))
      .filter(Number.isFinite);

    return {
      zones,
      mode,
      modeLabel,
      modeSub,
      flame,
      pump,
      flow,
      ret,
      target,
      dt: flow != null && ret != null ? flow - ret : null,
      dhw: numState(h, c.dhw_temp_entity),
      dhwTarget: numState(h, c.dhw_target_entity) ?? numAttr(stateObj(h, c.dhw_target_entity), 'temperature'),
      demand: allCalling ? (zones.length === 2 ? 'Both zones' : 'All zones') : calling.length ? calling.map((z) => z.name).join(', ') : 'None',
      updated: latest.length ? Math.max(...latest) : null,
      pipes: {
        fv: 'p pf-v' + (circulating ? ' vf' + slow : ''),
        fh: 'p ph pf-h' + (circulating ? ' hf' + slow : ''),
        rv: 'p pr-v' + (circulating ? ' vr' + slow : ''),
        rh: 'p ph pr-h' + (circulating ? ' hr' + slow : ''),
        dv: 'p pd-v' + (mode === 'dhw' ? ' vd' : ''),
        dh: 'p ph pd-h' + (mode === 'dhw' ? ' hd' : ''),
      },
    };
  }

  _render() {
    const c = this._config;
    const m = this._model();
    const pumpCls = { on: 'p-on', overrun: 'p-over', off: 'p-off' }[m.pump];
    const pumpText = { on: 'Running', overrun: 'Overrun', off: 'Off' }[m.pump];
    const spinCls = { on: 'sp', overrun: 'sp sp-slow', off: '' }[m.pump];
    const pillCls = { heat: 'm-heat', dhw: 'm-dhw', over: 'm-over', idle: 'm-idle' }[m.mode];
    const subtitle = c.subtitle != null ? esc(c.subtitle) : m.updated ? `Updated ${clock(m.updated, this._hass)}` : '';
    const hasDhw = !!c.dhw_temp_entity;

    const flameSvg = m.flame
      ? `<svg aria-hidden="true" width="44" height="55" viewBox="0 0 24 30"><g class="fl"><path d="${FLAME_OUTER}" fill="#FF8A3D"/></g><g class="fl2"><path d="${FLAME_INNER}" fill="#FFD27A"/></g></svg>`
      : `<svg aria-hidden="true" width="44" height="55" viewBox="0 0 24 30"><path d="${FLAME_OUTER}" fill="#353C46"/><path d="${FLAME_INNER}" fill="#2F353E"/></svg>`;

    const zones = m.zones.map((z) => `
      <button class="tap zt${z.heating ? ' zt-on' : ''}" ${this._tapAttrs(z.entity, z.name)}>
        <div class="zt-name">${icon(z.icon, 18)}<span>${esc(z.name)}</span></div>
        <div class="zt-temp num"><b>${deg(z.current, 1)}</b>${z.target != null ? `<span>→ ${deg(z.target, 1)}</span>` : ''}</div>
        <div class="zt-row">
          <span class="badge ${z.heating ? 'b-heat' : 'b-idle'}"><span class="dot"></span>${z.heating ? 'Heating' : 'Idle'}</span>
          ${z.humidity != null ? `<span class="hum num">${icon('droplet', 13, 2)}${Math.round(z.humidity)}%</span>` : ''}
        </div>
        ${z.hasCall ? `<span class="since">${z.since ? `since ${clock(z.since, this._hass)}` : '&nbsp;'}</span>` : ''}
      </button>`).join('');

    return `
<div class="lf">
  <div class="head">
    <div><div class="title">${esc(c.title ?? 'Boiler')}</div>${subtitle ? `<div class="sub">${subtitle}</div>` : ''}</div>
    <div class="pill ${pillCls}" title="${m.modeLabel} · ${esc(m.modeSub)}"><span class="dot"></span><span>${m.modeLabel}</span><span class="pill-sub">· ${esc(m.modeSub)}</span></div>
  </div>
  <div class="lf-body">
    <div class="lf-top">
      <div class="bslot">
        <div class="casing">
          <div class="vent"><span></span><span></span><span></span><span></span></div>
          <button class="tap flame" ${this._tapAttrs(c.flame_entity, `Flame ${m.flame ? 'on' : 'off'}`)}>${flameSvg}</button>
          <button class="tap disp" ${this._tapAttrs(c.flow_target_entity, `Flow target ${deg(m.target)}`)}>
            <svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#20252C" stroke="#3A414B" stroke-width="1"/><circle cx="32" cy="32" r="26" fill="#0C0F13"/></svg>
            <span class="disp-val num">${deg(m.target)}</span>
          </button>
          <div class="divider"></div>
          <button class="tap pumprow" ${this._tapAttrs(c.pump_entity, `Pump ${pumpText}`)}>
            <span class="${pumpCls}" style="display:flex"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><g class="${spinCls}"><path d="M12 12V5.5M12 12l5.6 3.2M12 12l-5.6 3.2"/></g><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg></span>
            <span class="lbl">Pump</span><span class="val ${pumpCls}">${pumpText}</span>
          </button>
        </div>
        <div class="port" style="left:34px"></div><div class="port" style="left:82px"></div><div class="port" style="left:130px"></div>
      </div>
      <div class="nstat">
        <button class="tap stat" ${this._tapAttrs(c.flame_entity, 'Flame')}><span class="sl">Flame</span><span class="sv ${m.flame ? 'c-on' : 'c-off'}">${m.flame == null ? '--' : m.flame ? 'On' : 'Off'}</span></button>
        <button class="tap stat" ${this._tapAttrs(c.pump_entity, 'Pump')}><span class="sl">Pump</span><span class="sv ${pumpCls}">${pumpText}</span></button>
        <div class="stat"><span class="sl">Heat demand</span><span class="sv">${esc(m.demand)}</span></div>
      </div>
    </div>
    <div class="nrows${hasDhw ? '' : ' no-dhw'}">
      <div class="${m.pipes.fv}"></div><div class="${m.pipes.fh}"></div>
      <div class="${m.pipes.rv}"></div><div class="${m.pipes.rh}"></div>
      ${hasDhw ? `<div class="${m.pipes.dv}"></div><div class="${m.pipes.dh}"></div>` : ''}
      <div class="dt num"><span>ΔT</span><span>${deg(m.dt)}</span></div>
      <button class="tap stat r-flow num" ${this._tapAttrs(c.flow_temp_entity, 'Flow temperature')}><span class="sl">Flow</span><span class="sv" style="color:var(--bc-flow)">${deg(m.flow)}</span></button>
      <button class="tap stat r-ret num" ${this._tapAttrs(c.return_temp_entity, 'Return temperature')}><span class="sl">Return</span><span class="sv" style="color:var(--bc-return-text)">${deg(m.ret)}</span></button>
      ${hasDhw ? `<button class="tap stat r-dhw num" ${this._tapAttrs(c.dhw_temp_entity, 'Hot water temperature')}><span class="sl">Hot water</span><span class="sv" style="color:var(--bc-dhw-text)">${deg(m.dhw)}${m.dhwTarget != null ? ` <small>→ ${deg(m.dhwTarget)}</small>` : ''}</span></button>` : ''}
    </div>
    ${zones ? `<div class="nzones">${zones}</div>` : ''}
  </div>
</div>`;
  }
}

/* ------------------------------------------------------------------ */
/* History card                                                        */
/* ------------------------------------------------------------------ */

function parseHistory(list, start) {
  return (list || []).map((e) => {
    let t;
    if (e.lu != null || e.lc != null) t = (e.lu ?? e.lc) * 1000;
    else t = Date.parse(e.last_updated || e.last_changed);
    return { t: Math.max(t, start), s: e.s ?? e.state, a: e.a ?? e.attributes };
  });
}

function numericSeries(entries) {
  return entries.map((e) => {
    const v = parseFloat(e.s);
    return [e.t, Number.isFinite(v) ? v : null];
  });
}

function spansFrom(entries, test, end) {
  const out = [];
  entries.forEach((e, i) => {
    if (!test(e)) return;
    const t1 = i + 1 < entries.length ? entries[i + 1].t : end;
    const last = out[out.length - 1];
    if (last && last[1] >= e.t) last[1] = Math.max(last[1], t1);
    else out.push([e.t, t1]);
  });
  return out;
}

function unionSpans(lists) {
  const all = lists.flat().slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  all.forEach(([a, b]) => {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  });
  return out;
}

function subtractSpans(spans, remove) {
  let out = spans.map((s) => s.slice());
  remove.forEach(([ra, rb]) => {
    out = out.flatMap(([a, b]) => {
      if (rb <= a || ra >= b) return [[a, b]];
      const pieces = [];
      if (ra > a) pieces.push([a, ra]);
      if (rb < b) pieces.push([rb, b]);
      return pieces;
    });
  });
  return out.filter(([a, b]) => b - a > 30000);
}

class BoilerHistoryCard extends BoilerBase {
  static styles = `
ha-card { padding: 20px 22px 18px; }
.hc { container: hc / inline-size; }
.segs { display: flex; gap: 4px; padding: 4px; background: var(--bc-tile); border-radius: 12px; }
.seg { border: 0; background: transparent; color: var(--bc-muted); font: inherit; font-size: 13px; font-weight: 600; height: 40px; min-width: 52px; padding: 0 12px; border-radius: 9px; cursor: pointer; }
.seg:hover { color: var(--bc-text); }
.seg.on { background: #2E343D; color: var(--bc-text); }
.seg:focus-visible { outline: 2px solid var(--bc-heat-text); outline-offset: 1px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 16px; }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 15px; background: var(--bc-tile); font-size: 13px; color: var(--bc-muted); white-space: nowrap; }
.chip b { color: var(--bc-text); font-weight: 600; display: inline-block; min-width: 3ch; }
.sw { width: 14px; height: 3px; border-radius: 2px; }
.sw-dash { width: 14px; height: 0; border-top: 2px dashed #C9CED4; }
.sw-box { width: 12px; height: 12px; border-radius: 3px; background: rgba(255,138,61,0.22); }
.rows { display: flex; flex-direction: column; gap: 8px; }
.hrow { display: grid; grid-template-columns: 92px minmax(0, 1fr); column-gap: 10px; align-items: center; }
.plot { position: relative; height: 200px; }
.ylab { font-size: 11px; color: var(--bc-faint); }
.ylab span { position: absolute; right: 0; transform: translateY(-50%); }
.plot svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.now-line { position: absolute; right: 0; top: 0; bottom: 0; border-right: 1px dashed #4A525D; }
.now-dot { position: absolute; right: -5px; width: 10px; height: 10px; margin-top: -5px; border-radius: 5px; box-shadow: 0 0 0 2px var(--bc-bg); }
.msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--bc-muted); }
.lname { font-size: 12px; color: var(--bc-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lane { position: relative; height: 18px; border-radius: 4px; overflow: hidden; background: #232830; }
.lane svg { display: block; width: 100%; height: 100%; }
.xaxis { position: relative; height: 16px; }
.xt { position: absolute; top: 0; font-size: 11px; color: var(--bc-faint); transform: translateX(-50%); white-space: nowrap; }
.xt.first { transform: none; }
.xt.last { transform: translateX(-100%); color: var(--bc-text); font-weight: 600; }
@container hc (max-width: 440px) {
  .hrow { grid-template-columns: 70px minmax(0, 1fr); column-gap: 8px; }
  .plot { height: 160px; }
  .lname { font-size: 11px; }
  .chip { height: 28px; font-size: 12px; }
}
`;

  static getStubConfig(hass) {
    const stub = BoilerFlowCard.getStubConfig(hass);
    return {
      flow_temp_entity: stub.flow_temp_entity,
      flow_target_entity: stub.flow_target_entity,
      return_temp_entity: stub.return_temp_entity,
      flame_entity: stub.flame_entity,
      zones: stub.zones,
    };
  }

  static getConfigElement() {
    return document.createElement('boiler-history-card-editor');
  }

  constructor() {
    super();
    this._range = null;
    this._data = null;
    this._error = null;
    this._loading = false;
    this._fetchedAt = 0;
    this.shadowRoot.addEventListener('click', (ev) => {
      const btn = ev.composedPath().find((n) => n.dataset && n.dataset.range);
      if (btn) {
        this._range = Number(btn.dataset.range);
        this._update(true);
      }
    });
  }

  setConfig(config) {
    super.setConfig(config);
    this._data = null;
    this._fetchedAt = 0;
  }

  /* Once a minute: move the time axis on, and re-fetch history when it is
     stale. Nothing is fetched while the dashboard is in a background tab. */
  connectedCallback() {
    clearInterval(this._timer);
    this._onVisible = () => this._tick();
    document.addEventListener('visibilitychange', this._onVisible);
    this._timer = setInterval(() => this._tick(), 60000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    document.removeEventListener('visibilitychange', this._onVisible);
  }

  _tick() {
    if (!this._config || !this._hass || document.visibilityState !== 'visible') return;
    if (Date.now() - this._fetchedAt > (this._config.refresh_minutes || 5) * 60000) this._fetch();
    else this._update();
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 'auto' };
  }

  get _hours() {
    const opts = (this._config.hours_options || [6, 12, 24]).map(Number).filter((n) => n > 0);
    return opts.length ? opts : [24];
  }

  _signature() {
    const c = this._config;
    if (!this._data && !this._loading && !this._error) this._fetch();
    return [
      this._range, this._fetchedAt, this._loading, this._error, Math.floor(Date.now() / 60000),
      signature(this._hass, [c.flow_temp_entity, c.flow_target_entity, c.return_temp_entity]),
    ].join('#');
  }

  async _fetch() {
    const c = this._config;
    const h = this._hass;
    if (!h || !c || this._loading) return;
    this._loading = true;
    this._error = null;
    const end = Date.now();
    const start = end - Math.max(...this._hours) * 3600000;
    const zones = c.zones || [];
    const simpleIds = [c.flow_temp_entity, c.flow_target_entity, c.return_temp_entity, c.flame_entity, c.dhw_active_entity,
      ...zones.map((z) => z.heat_call_entity)].filter(Boolean);
    const climateIds = zones.filter((z) => !z.heat_call_entity && z.climate_entity).map((z) => z.climate_entity);
    const query = (ids, withAttributes) => ids.length ? h.callWS({
      type: 'history/history_during_period',
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      entity_ids: ids,
      minimal_response: !withAttributes,
      no_attributes: !withAttributes,
      significant_changes_only: false,
    }) : Promise.resolve({});
    try {
      const [simple, climate] = await Promise.all([query(simpleIds, false), query(climateIds, true)]);
      const get = (id) => parseHistory((simple[id] || climate[id]) || [], start);
      const binary = (id) => id ? spansFrom(get(id), (e) => ON_STATES.has(String(e.s).toLowerCase()), end) : null;
      const zoneSpans = zones.map((z) => z.heat_call_entity
        ? binary(z.heat_call_entity)
        : spansFrom(get(z.climate_entity), (e) => !!e.a && climateHeating(e.s, e.a), end));
      this._data = {
        start,
        end,
        flow: numericSeries(get(c.flow_temp_entity)),
        target: numericSeries(get(c.flow_target_entity)),
        ret: numericSeries(get(c.return_temp_entity)),
        flame: binary(c.flame_entity),
        dhw: binary(c.dhw_active_entity),
        zones: zoneSpans,
      };
    } catch (err) {
      this._error = (err && err.message) || 'Could not load history';
    }
    this._loading = false;
    this._fetchedAt = Date.now();
    this._update(true);
  }

  _render() {
    const c = this._config;
    const h = this._hass;
    const hours = this._hours;
    const range = this._range && hours.includes(this._range) ? this._range : (Number(c.default_hours) && hours.includes(Number(c.default_hours)) ? Number(c.default_hours) : Math.max(...hours));
    const now = Date.now();
    const winStart = now - range * 3600000;
    const X = (t) => ((t - winStart) / (now - winStart)) * 1000;

    const flowNow = numState(h, c.flow_temp_entity);
    const retNow = numState(h, c.return_temp_entity);
    const rawTarget = numState(h, c.flow_target_entity);
    const tgtNow = rawTarget > 0 ? rawTarget : null;
    const zones = c.zones || [];
    const d = this._data;

    let plot = '';
    let ylabels = '';
    let dots = '';
    let laneSpans = { zones: [], flame: null, dhw: null };
    const rects = (spans, y0, y1) => (spans || []).map(([a, b]) => {
      const x0 = X(a);
      const x1 = Math.max(x0 + 3, X(b));
      return `M${x0.toFixed(1)} ${y0}H${x1.toFixed(1)}V${y1}H${x0.toFixed(1)}Z`;
    }).join(' ') || 'M0 0';
    if (d) {
      const withNow = (series, live) => {
        const s = series.slice();
        const last = live ?? (s.length ? s[s.length - 1][1] : null);
        if (last != null) s.push([now, last]);
        return s;
      };
      const flow = withNow(d.flow, flowNow);
      const ret = withNow(d.ret, retNow);
      const target = withNow(d.target, tgtNow);
      const ext = (spans) => (spans || []).map(([a, b]) => [a, b >= d.end - 1 ? now : b]);
      const zoneSpans = d.zones.map(ext);
      const heat = unionSpans(zoneSpans);
      const flame = ext(d.flame);
      let dhw = d.dhw ? ext(d.dhw) : null;
      if (!dhw && flame && zones.length && c.infer_hot_water !== false) dhw = subtractSpans(flame, heat);

      const visible = [...flow, ...ret, ...target.filter(([, v]) => v > 0)]
        .filter(([t, v]) => t >= winStart && v != null)
        .map(([, v]) => v);
      let yMin = visible.length ? Math.min(...visible) : 20;
      let yMax = visible.length ? Math.max(...visible) : 80;
      yMin = Math.floor((yMin - 2) / 10) * 10;
      yMax = Math.ceil((yMax + 2) / 10) * 10;
      if (yMax - yMin < 20) yMax = yMin + 20;
      const Y = (v) => 200 - ((v - yMin) / (yMax - yMin)) * 200;
      const step = yMax - yMin > 50 ? 20 : 10;

      const line = (series) => {
        let out = '';
        let pen = false;
        series.forEach(([t, v]) => {
          if (v == null) { pen = false; return; }
          out += `${pen ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(v).toFixed(1)} `;
          pen = true;
        });
        return out || 'M0 0';
      };
      const targetSteps = () => {
        const windows = zones.length ? heat : [[d.start, now]];
        let out = '';
        target.forEach(([t, v], i) => {
          if (v == null || v <= 0) return;
          const t1 = i + 1 < target.length ? target[i + 1][0] : now;
          windows.forEach(([a, b]) => {
            const s0 = Math.max(a, t);
            const s1 = Math.min(b, t1);
            if (s1 > s0) out += `M${X(s0).toFixed(1)} ${Y(v).toFixed(1)}H${X(s1).toFixed(1)} `;
          });
        });
        return out || 'M0 0';
      };

      const grid = [];
      for (let v = yMin; v <= yMax; v += step) grid.push(v);
      ylabels = grid.map((v) => `<span style="top:${(((yMax - v) / (yMax - yMin)) * 100).toFixed(1)}%">${v}°</span>`).join('');
      plot = `
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" role="img" aria-label="Flow, return and flow target over the last ${range} hours">
          ${heat.length ? `<path d="${rects(heat, 0, 200)}" fill="#FF8A3D" fill-opacity="0.09"/>` : ''}
          ${grid.map((v) => `<line x1="0" x2="1000" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${v === yMin ? '#3A414B' : '#2A3038'}" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('')}
          ${c.flow_target_entity ? `<path d="${targetSteps()}" fill="none" stroke="#C9CED4" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>` : ''}
          <path d="${line(ret)}" fill="none" stroke="#4C8DF0" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
          <path d="${line(flow)}" fill="none" stroke="#FF8A3D" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        </svg>`;
      const dot = (v, color) => v == null ? '' : `<div class="now-dot" style="top:${(Y(v) / 2).toFixed(1)}%;background:${color}"></div>`;
      dots = `<div class="now-line"></div>${dot(retNow, '#4C8DF0')}${dot(flowNow, '#FF8A3D')}`;
      laneSpans = { zones: zoneSpans, flame, dhw };
    }

    /* The timelines come from the config, not the data, so the card is the
       same height while history is loading as after. */
    const laneRow = (name, spans, color) => `
      <div class="hrow"><span class="lname">${esc(name)}</span>
        <div class="lane"><svg viewBox="0 0 1000 18" preserveAspectRatio="none" aria-hidden="true"><path d="${rects(spans, 0, 18)}" fill="${color}"/></svg></div>
      </div>`;
    const showDhw = !!c.dhw_active_entity || (!!c.flame_entity && zones.length > 0 && c.infer_hot_water !== false);
    const lanes = zones.map((z, i) => laneRow(z.name || z.climate_entity || `Zone ${i + 1}`, laneSpans.zones[i], '#FF8A3D')).join('')
      + (c.flame_entity ? laneRow('Flame', laneSpans.flame, '#F5C451') : '')
      + (showDhw ? laneRow('Hot water', laneSpans.dhw, '#C084FC') : '');

    const msg = this._error ? esc(this._error) : !d ? 'Loading history…' : '';
    const ticks = [0, 1, 2, 3, 4].map((k) => {
      const t = winStart + (k * (now - winStart)) / 4;
      const cls = k === 0 ? ' first' : k === 4 ? ' last' : '';
      return `<span class="xt${cls}" style="left:${k * 25}%">${k === 4 ? 'Now' : clock(t, h)}</span>`;
    }).join('');

    return `
<div class="hc">
  <div class="head">
    <div><div class="title">${esc(c.title ?? 'Heating history')}</div><div class="sub">Temperatures and demand</div></div>
    ${hours.length > 1 ? `<div class="segs" role="group" aria-label="Time range">${hours.map((r) => `<button class="seg${r === range ? ' on' : ''}" data-range="${r}" aria-pressed="${r === range}">${r}h</button>`).join('')}</div>` : ''}
  </div>
  <div class="chips">
    <button class="tap chip num" ${this._tapAttrs(c.flow_temp_entity, 'Flow temperature')}><span class="sw" style="background:#FF8A3D"></span>Flow <b>${deg(flowNow)}</b>${c.flow_target_entity ? ` → ${deg(tgtNow)}` : ''}</button>
    <button class="tap chip num" ${this._tapAttrs(c.return_temp_entity, 'Return temperature')}><span class="sw" style="background:#4C8DF0"></span>Return <b>${deg(retNow)}</b></button>
    <span class="chip num">ΔT <b>${flowNow != null && retNow != null ? deg(flowNow - retNow) : '--'}</b></span>
    ${c.flow_target_entity ? '<span class="chip"><span class="sw-dash"></span>Target</span>' : ''}
    ${zones.length ? '<span class="chip"><span class="sw-box"></span>Heat call</span>' : ''}
  </div>
  <div class="rows">
    <div class="hrow">
      <div class="plot ylab num">${ylabels}</div>
      <div class="plot">${plot}${dots}${msg ? `<div class="msg">${msg}</div>` : ''}</div>
    </div>
    ${lanes}
    <div class="hrow"><span></span><div class="xaxis num">${ticks}</div></div>
  </div>
</div>`;
  }
}

/* ------------------------------------------------------------------ */
/* Climate card                                                        */
/* ------------------------------------------------------------------ */

class BoilerClimateCard extends BoilerBase {
  static styles = `
ha-card { padding: 12px; }
.cc { container: cc / inline-size; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.tile { padding: 16px 18px; background: var(--bc-tile); border-radius: 16px; display: flex; flex-direction: column; gap: 14px; }
.lbl { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--bc-muted); }
.val { font-size: 44px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
.val small { font-size: 20px; font-weight: 500; color: var(--bc-muted); }
@container cc (max-width: 340px) { .val { font-size: 36px; } .val small { font-size: 16px; } }
`;

  static getStubConfig(hass) {
    return {
      outdoor_entity: findEntity(hass, 'sensor', /outdoor|outside|exterior/),
      indoor_entity: findEntity(hass, 'sensor', /indoor|inside|living.*temp|hall.*temp/),
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'outdoor_entity', selector: { entity: { domain: ['sensor', 'weather'] } } },
        { name: 'outdoor_name', selector: { text: {} } },
        { name: 'indoor_entity', selector: { entity: { domain: ['sensor', 'climate'] } } },
        { name: 'indoor_name', selector: { text: {} } },
      ],
      computeLabel: (s) => FORM_LABELS[s.name],
    };
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 3, rows: 'auto' };
  }

  _signature() {
    return signature(this._hass, [this._config.outdoor_entity, this._config.indoor_entity]);
  }

  _temp(id) {
    const s = stateObj(this._hass, id);
    if (!s) return { v: null, unit: '°C' };
    let v = parseFloat(s.state);
    if (!Number.isFinite(v)) v = numAttr(s, 'current_temperature') ?? numAttr(s, 'temperature');
    const unit = s.attributes.unit_of_measurement || s.attributes.temperature_unit || '°C';
    return { v, unit };
  }

  _render() {
    const c = this._config;
    const tile = (id, name, ic) => {
      const t = this._temp(id);
      return `<button class="tap tile" ${this._tapAttrs(id, name)}>
        <span class="lbl">${icon(ic, 18)}<span>${esc(name)}</span></span>
        <span class="val num">${fmtNum(t.v, 1)}<small>${esc(t.unit)}</small></span>
      </button>`;
    };
    return `<div class="cc">
      ${tile(c.outdoor_entity, c.outdoor_name || 'Outdoor', 'outdoor')}
      ${tile(c.indoor_entity, c.indoor_name || 'Indoor', 'indoor')}
    </div>`;
  }
}

/* ------------------------------------------------------------------ */
/* Energy card                                                         */
/* ------------------------------------------------------------------ */

class BoilerEnergyCard extends BoilerBase {
  static styles = `
ha-card { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.top { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.lbl { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--bc-muted); }
.total { font-size: 32px; font-weight: 600; letter-spacing: -0.02em; line-height: 1; }
.total small { font-size: 15px; font-weight: 500; color: var(--bc-muted); }
.bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; gap: 3px; background: #232830; }
.list { display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.row { display: flex; align-items: center; gap: 8px; width: 100%; }
.row .name { color: var(--bc-muted); flex-grow: 1; }
.row .v { font-weight: 600; }
.row .pct { color: var(--bc-muted); width: 40px; text-align: right; }
`;

  static getStubConfig(hass) {
    return {
      heating_entity: findEntity(hass, 'sensor', /(heating|ch).*(energy|consumption)/),
      hot_water_entity: findEntity(hass, 'sensor', /(dhw|hot_?water).*(energy|consumption)/),
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'title', selector: { text: {} } },
        { name: 'heating_entity', selector: { entity: { domain: 'sensor' } } },
        { name: 'hot_water_entity', selector: { entity: { domain: 'sensor' } } },
        { name: 'mode', selector: { select: { mode: 'dropdown', options: [
          { value: 'auto', label: 'Auto' },
          { value: 'statistics', label: 'Today from long-term statistics' },
          { value: 'state', label: 'Sensor value as-is' },
        ] } } },
      ],
      computeLabel: (s) => FORM_LABELS[s.name],
      computeHelper: (s) => FORM_HELPERS[s.name],
    };
  }

  constructor() {
    super();
    this._today = {};
    this._statsAt = 0;
  }

  setConfig(config) {
    super.setConfig(config);
    this._today = {};
    this._statsAt = 0;
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 3, rows: 'auto' };
  }

  _useStats(id) {
    const s = stateObj(this._hass, id);
    const mode = this._config.mode || 'auto';
    if (!s || mode === 'state') return false;
    if (mode === 'statistics') return true;
    return ['total', 'total_increasing'].includes(s.attributes.state_class) && !/today|daily/i.test(id);
  }

  _signature() {
    const c = this._config;
    const ids = [c.heating_entity, c.hot_water_entity].filter(Boolean);
    if (ids.some((id) => this._useStats(id)) && Date.now() - this._statsAt > 60000) this._fetchStats(ids);
    return signature(this._hass, ids) + JSON.stringify(this._today);
  }

  async _fetchStats(ids) {
    this._statsAt = Date.now();
    await Promise.all(ids.filter((id) => this._useStats(id)).map(async (id) => {
      try {
        const res = await this._hass.callWS({ type: 'recorder/statistic_during_period', statistic_id: id, calendar: { period: 'day' }, types: ['change'] });
        this._today[id] = res && Number.isFinite(res.change) ? res.change : null;
      } catch (err) {
        this._today[id] = null;
      }
    }));
    this._update(true);
  }

  _kwh(id) {
    const s = stateObj(this._hass, id);
    if (!s) return null;
    let v = this._useStats(id) ? this._today[id] : parseFloat(s.state);
    if (v == null || !Number.isFinite(v)) return null;
    const unit = String(s.attributes.unit_of_measurement || 'kWh');
    if (unit === 'Wh') v /= 1000;
    if (unit === 'MWh') v *= 1000;
    return v;
  }

  _render() {
    const c = this._config;
    const heat = this._kwh(c.heating_entity);
    const dhw = this._kwh(c.hot_water_entity);
    const total = (heat || 0) + (dhw || 0);
    const pct = (v) => (total > 0 && v != null ? Math.round((v / total) * 100) : null);
    const fmt = (v) => fmtNum(v, 1);
    const row = (id, name, v, color) => `
      <button class="tap row num" ${this._tapAttrs(id, name)}>
        <span class="dot" style="color:${color}"></span><span class="name">${name}</span>
        <span class="v">${fmt(v)} kWh</span><span class="pct">${pct(v) == null ? '' : pct(v) + '%'}</span>
      </button>`;
    return `
      <div class="top">
        <span class="lbl">${icon('bolt', 18)}<span>${esc(c.title ?? 'Energy today')}</span></span>
        <span class="total num">${heat == null && dhw == null ? '--' : fmtNum(total, 1)} <small>kWh</small></span>
      </div>
      <div class="bar">
        ${total > 0 ? `<div style="width:${((heat || 0) / total) * 100}%;background:#FF8A3D"></div><div style="flex-grow:1;background:#C084FC"></div>` : ''}
      </div>
      <div class="list">
        ${row(c.heating_entity, 'Heating', heat, '#FF8A3D')}
        ${row(c.hot_water_entity, 'Hot water', dhw, '#C084FC')}
      </div>`;
  }
}

/* ------------------------------------------------------------------ */
/* Editor labels and registration                                      */
/* ------------------------------------------------------------------ */

const FORM_LABELS = {
  title: 'Title',
  flow_temp_entity: 'Flow temperature',
  flow_target_entity: 'Flow target temperature',
  return_temp_entity: 'Return temperature',
  dhw_temp_entity: 'Hot water temperature',
  dhw_target_entity: 'Hot water target temperature',
  flame_entity: 'Flame on/off',
  pump_entity: 'Pump (on / off / overrun)',
  dhw_active_entity: 'Hot water active (optional)',
  default_hours: 'Default time range (hours)',
  outdoor_entity: 'Outdoor temperature',
  outdoor_name: 'Outdoor label',
  indoor_entity: 'Indoor temperature',
  indoor_name: 'Indoor label',
  heating_entity: 'Heating energy',
  hot_water_entity: 'Hot water energy',
  mode: 'How to work out today’s energy',
  name: 'Name',
  climate_entity: 'Thermostat',
  heat_call_entity: 'Calling for heat (optional)',
  humidity_entity: 'Humidity (optional)',
  icon: 'Icon',
};

const FORM_HELPERS = {
  dhw_active_entity: 'If left empty, hot water is assumed when the flame is on and no zone is calling.',
  mode: 'Auto uses long-term statistics for ever-increasing meters and the raw value for sensors that reset daily.',
  heat_call_entity: 'An entity that is on while this zone calls for heat. If empty, the thermostat’s own heating state is used.',
  humidity_entity: 'If empty, the thermostat’s humidity reading is used when it has one.',
};

const FLOW_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  { name: 'flow_temp_entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'flow_target_entity', selector: { entity: { domain: ['sensor', 'number', 'input_number'] } } },
  { name: 'return_temp_entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'dhw_temp_entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'dhw_target_entity', selector: { entity: { domain: ['sensor', 'number', 'input_number', 'water_heater'] } } },
  { name: 'flame_entity', selector: { entity: { domain: ['binary_sensor', 'sensor'] } } },
  { name: 'pump_entity', selector: { entity: { domain: ['binary_sensor', 'sensor', 'select'] } } },
  { name: 'dhw_active_entity', selector: { entity: { domain: ['binary_sensor', 'sensor'] } } },
];

const HISTORY_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  { name: 'flow_temp_entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'flow_target_entity', selector: { entity: { domain: ['sensor', 'number', 'input_number'] } } },
  { name: 'return_temp_entity', selector: { entity: { domain: 'sensor' } } },
  { name: 'flame_entity', selector: { entity: { domain: ['binary_sensor', 'sensor'] } } },
  { name: 'dhw_active_entity', selector: { entity: { domain: ['binary_sensor', 'sensor'] } } },
  { name: 'default_hours', selector: { select: { mode: 'dropdown', options: ['6', '12', '24', '48'] } } },
];

const ZONE_SCHEMA = [
  { name: 'name', selector: { text: {} } },
  { name: 'climate_entity', selector: { entity: { domain: 'climate' } } },
  { name: 'heat_call_entity', selector: { entity: { domain: ['binary_sensor', 'switch', 'input_boolean', 'sensor'] } } },
  { name: 'humidity_entity', selector: { entity: { domain: 'sensor', device_class: 'humidity' } } },
  { name: 'icon', selector: { select: { mode: 'dropdown', options: [
    { value: 'radiator', label: 'Radiator' },
    { value: 'underfloor', label: 'Underfloor heating' },
  ] } } },
];

/* ha-form is lazy-loaded by Home Assistant; opening a built-in card editor loads it. */
async function loadHaForm() {
  if (customElements.get('ha-form')) return;
  try {
    const helpers = await window.loadCardHelpers();
    const card = await helpers.createCardElement({ type: 'entities', entities: [] });
    await card.constructor.getConfigElement();
  } catch (err) {
    // Fall through and wait; ha-form may still arrive.
  }
  await Promise.race([customElements.whenDefined('ha-form'), new Promise((r) => setTimeout(r, 5000))]);
}

/* Shows the card's zones list as one collapsible section per zone, plus an
   empty one for adding a zone. Clearing every field of a zone removes it. */
class BoilerZonesEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  async _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      if (!this._formReady) {
        this._formReady = loadHaForm().then(() => {
          this._form = document.createElement('ha-form');
          this._form.computeLabel = (s) => FORM_LABELS[s.name] ?? s.name;
          this._form.computeHelper = (s) => FORM_HELPERS[s.name];
          this._form.addEventListener('value-changed', (ev) => this._changed(ev.detail.value));
          this.appendChild(this._form);
        });
      }
      await this._formReady;
    }
    const zones = Array.isArray(this._config.zones) ? this._config.zones : [];
    const data = { ...this._config };
    delete data.zones;
    const zoneSections = [...zones, null].map((z, i) => {
      data[`zone${i + 1}`] = z ? { ...z } : {};
      return {
        type: 'expandable',
        name: `zone${i + 1}`,
        title: z ? (z.name || z.climate_entity || `Zone ${i + 1}`) : 'Add a heating zone',
        schema: ZONE_SCHEMA,
      };
    });
    this._form.hass = this._hass;
    this._form.data = data;
    this._form.schema = [...this.constructor.schema, ...zoneSections];
  }

  _changed(value) {
    const config = {};
    const zones = [];
    Object.keys(value)
      .filter((k) => /^zone\d+$/.test(k))
      .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10))
      .forEach((k) => {
        const zone = {};
        Object.entries(value[k] || {}).forEach(([key, v]) => {
          if (v !== '' && v != null) zone[key] = v;
        });
        if (zone.name || zone.climate_entity || zone.heat_call_entity || zone.humidity_entity) zones.push(zone);
      });
    Object.entries(value).forEach(([k, v]) => {
      if (/^zone\d+$/.test(k)) return;
      if (k === 'type' || (v !== '' && v != null)) config[k] = v;
    });
    if (zones.length) config.zones = zones;
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    this._render();
  }
}

class BoilerFlowCardEditor extends BoilerZonesEditor {
  static get schema() {
    return FLOW_SCHEMA;
  }
}

class BoilerHistoryCardEditor extends BoilerZonesEditor {
  static get schema() {
    return HISTORY_SCHEMA;
  }
}

if (!customElements.get('boiler-flow-card-editor')) customElements.define('boiler-flow-card-editor', BoilerFlowCardEditor);
if (!customElements.get('boiler-history-card-editor')) customElements.define('boiler-history-card-editor', BoilerHistoryCardEditor);

const CARDS = [
  ['boiler-flow-card', BoilerFlowCard, 'Boiler live flow', 'Boiler with flame, pump, flow/return/hot water pipes and heating zones.'],
  ['boiler-history-card', BoilerHistoryCard, 'Boiler heating history', 'Flow, return and target temperatures with heat call, flame and hot water timelines.'],
  ['boiler-climate-card', BoilerClimateCard, 'Boiler outdoor / indoor', 'Outdoor and indoor temperature tiles.'],
  ['boiler-energy-card', BoilerEnergyCard, 'Boiler energy today', 'Today’s heating and hot water energy with a split bar.'],
];

window.customCards = window.customCards || [];
CARDS.forEach(([type, cls, name, description]) => {
  if (!customElements.get(type)) customElements.define(type, cls);
  if (!window.customCards.some((card) => card.type === type)) {
    window.customCards.push({ type, name, description, preview: true, documentationURL: REPO_URL });
  }
});

console.info(`%c BOILER-CARDS %c v${VERSION} `, 'background:#FF8A3D;color:#171A1F;font-weight:700', 'background:#171A1F;color:#EEF1F4');
