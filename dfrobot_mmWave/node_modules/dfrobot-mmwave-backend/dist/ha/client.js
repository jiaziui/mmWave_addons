"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HaClient = void 0;
class HaClient {
    constructor(config) {
        this.config = config;
    }
    get configured() {
        return Boolean(this.config.token);
    }
    async getAllStates() {
        return this.request("/states");
    }
    async getState(entityId) {
        try {
            return await this.request(`/states/${encodeURIComponent(entityId)}`);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes("404")) {
                return null;
            }
            throw error;
        }
    }
    async getEntityRegistry() {
        try {
            return this.asArray(await this.request("/config/entity_registry"));
        }
        catch {
            const template = `
{% set entities = namespace(list=[]) %}
{% for state in states %}
  {% set entities.list = entities.list + [{
    'entity_id': state.entity_id,
    'device_id': device_id(state.entity_id),
    'disabled_by': none
  }] %}
{% endfor %}
{{ entities.list | tojson }}`.trim();
            const rendered = await this.renderTemplate(template);
            return this.asArray(JSON.parse(rendered));
        }
    }
    async getDeviceRegistry() {
        try {
            return this.asArray(await this.request("/config/device_registry"));
        }
        catch {
            const template = `
{% set devices = namespace(list=[]) %}
{% set seen = namespace(ids=[]) %}
{% for state in states %}
  {% set dev_id = device_id(state.entity_id) %}
  {% if dev_id and dev_id not in seen.ids %}
    {% set seen.ids = seen.ids + [dev_id] %}
    {% set devices.list = devices.list + [{
      'id': dev_id,
      'name': device_attr(dev_id, 'name'),
      'name_by_user': device_attr(dev_id, 'name_by_user'),
      'manufacturer': device_attr(dev_id, 'manufacturer'),
      'model': device_attr(dev_id, 'model'),
      'sw_version': device_attr(dev_id, 'sw_version'),
      'hw_version': device_attr(dev_id, 'hw_version'),
      'area_id': device_attr(dev_id, 'area_id'),
      'connections': device_attr(dev_id, 'connections') | list if device_attr(dev_id, 'connections') else [],
      'identifiers': device_attr(dev_id, 'identifiers') | list if device_attr(dev_id, 'identifiers') else []
    }] %}
  {% endif %}
{% endfor %}
{{ devices.list | tojson }}`.trim();
            const rendered = await this.renderTemplate(template);
            return this.asArray(JSON.parse(rendered));
        }
    }
    async getAreaRegistry() {
        try {
            return this.asArray(await this.request("/config/area_registry"));
        }
        catch {
            const template = `
{% set items = namespace(list=[]) %}
{% for area_id in areas() %}
  {% set items.list = items.list + [{
    'id': area_id,
    'name': area_name(area_id)
  }] %}
{% endfor %}
{{ items.list | tojson }}`.trim();
            const rendered = await this.renderTemplate(template);
            return this.asArray(JSON.parse(rendered));
        }
    }
    async callService(domain, service, data) {
        return this.request(`/services/${domain}/${service}`, {
            method: "POST",
            body: JSON.stringify(data),
        });
    }
    async renderTemplate(template) {
        const rendered = await this.request("/template", {
            method: "POST",
            body: JSON.stringify({ template }),
        });
        return typeof rendered === "string" ? rendered : JSON.stringify(rendered);
    }
    asArray(value) {
        return Array.isArray(value) ? value : [];
    }
    async request(apiPath, init = {}) {
        const response = await fetch(`${this.config.baseUrl}${apiPath}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.config.token}`,
                "Content-Type": "application/json",
                ...(init.headers ?? {}),
            },
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HA API ${response.status} ${response.statusText}: ${text}`);
        }
        const text = await response.text();
        try {
            return (text ? JSON.parse(text) : null);
        }
        catch {
            return text;
        }
    }
}
exports.HaClient = HaClient;
