/* Copyright 2018 Jiří Janoušek <janousek.jiri@gmail.com>
 * Licensed under BSD-2-Clause - see the LICENSE file.
 */

/* global imports */
'use strict'

const GLib = imports.gi.GLib
const St = imports.gi.St
const Main = imports.ui.main
const PanelMenu = imports.ui.panelMenu
const PopupMenu = imports.ui.popupMenu
const Slider = imports.ui.slider

let indicator = null
let slider = null
let menu = null
let updater = null

function init () {  // eslint-disable-line no-unused-vars
}

function enable () {  // eslint-disable-line no-unused-vars
  menu = new PstatectlMenu()
  slider = new PstatectlSlider(1)
  updater = new Updater(menu, slider)
  indicator = Main.panel.addToStatusArea('pstatectl', new PstatectlButton(menu, slider, updater), 0, 'right')
}

function disable () {  // eslint-disable-line no-unused-vars
  if (indicator) {
    indicator.destroy()
  }
  indicator = null
  if (menu) {
    menu.destroy()
  }
  menu = null
  if (updater) {
    updater.destroy()
  }
  updater = null
}

class Updater {
  constructor (menu, slider) {
    this._menu = menu
    this._slider = slider
    this._cached_turbo = null
  }

  start () {
    this.update()
    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this.update()
      return true
    })
  }

  stop () {
    if (this._timeoutId) {
      GLib.Source.remove(this._timeoutId)
      this._timeoutId = null
    }
  }

  update () {
    this.updateTemperature()
    this.updateFrequency()
  }

  updateFrequency () {
    let entries = []
    for (let i = 0; i < 16; i++) {
      try {
        let [result, data] = GLib.file_get_contents('/sys/devices/system/cpu/cpu' + i + '/cpufreq/scaling_cur_freq')
        if (result && data) {
          entries.push(['CPU ' + i, 1 * data.toString().trim()])
        }
      } catch (e) {
        break
      }
    }
    this._menu.updateFrequency(entries)

    let minPerf = 10
    let maxPerf = 100
    let [result, data] = GLib.file_get_contents('/sys/devices/system/cpu/intel_pstate/min_perf_pct')
    if (result && data) {
      minPerf = Math.max(minPerf, data.toString().trim() * 1)
    }
    [result, data] = GLib.file_get_contents('/sys/devices/system/cpu/intel_pstate/max_perf_pct')
    if (result && data) {
      maxPerf = Math.max(minPerf, Math.min(maxPerf, data.toString().trim() * 1))
    }
    let perf = (maxPerf - minPerf) / (100 - minPerf)
    this._slider.updatePerformance(perf)
  }

  updateTemperature () {
    if (this._cached_turbo === null) {
      let turbo = 0
      let [result, data] = GLib.file_get_contents('/sys/devices/system/cpu/intel_pstate/turbo_pct')
      if (result && data) {
        turbo = Math.max(0, data.toString().trim() * 1)
      }
      this._cached_turbo = turbo
    }

    let [ok, out] = GLib.spawn_sync(null, ['sensors'], null, GLib.SpawnFlags.SEARCH_PATH, null)
    let results = []
    if (ok && out) {
      let lines = out.toString().split('\n')
      for (let i in lines) {
        let line = lines[i]
        if (line.startsWith('Package') || line.startsWith('Core')) {
          let parts = line.split(':')
          results.push([parts[0], parts[1].trim().split(' ')[0]])
        }
      }
    }
    this._menu.updateTemperature(results, this._cached_turbo)
  }

  destroy () {
    this.stop()
  }
}

class PstatectlButton extends PanelMenu.Button {
  constructor (menu, slider, updater) {
    super(0.0, 'Pstatectl Button', false)
    this._updater = updater
    this._indicator = new St.BoxLayout()
    this.actor.add_child(this._indicator)
    this._indicator_icon = new St.Icon({
      style_class: 'system-status-icon',
      icon_name: 'utilities-system-monitor-symbolic'
    })
    this._indicator.add_child(this._indicator_icon)
    this.menu.addMenuItem(menu)
    this.menu.addMenuItem(slider)
    this._notify_visible = this.menu.actor.connect('notify::visible', this.onVisibleChanged.bind(this))
  }

  destroy () {
    this.menu.actor.connect(this._notify_visible)
    super.destroy()
  }

  onVisibleChanged () {
    if (this.menu.actor.is_visible()) {
      this._updater.start()
    } else {
      this._updater.stop()
    }
  }
}

class PstatectlSlider extends PopupMenu.PopupBaseMenuItem {
  constructor (value) {
    super()
    this._slider = new Slider.Slider(value)
    this.actor.add(this._slider.actor, {expand: true})
  }
  updatePerformance (perf) {
    this._slider.setValue(perf)
  }
}

class PstatectlMenu extends PopupMenu.PopupBaseMenuItem {
  constructor () {
    super()
    this._freqBox = new St.BoxLayout({vertical: true})
    this._tempBox = new St.BoxLayout({vertical: true})
    this.actor.add(this._freqBox, {expand: true})
    this.actor.add(this._tempBox, {expand: true})
    this._tempLabels = []
    this._freqLabels = []
  }

  destroy () {
    super.destroy()
  }

  updateTemperature (entries, turbo) {
    for (let child of this._tempLabels) {
      this._tempBox.remove_child(child)
    }
    this._tempLabels = []
    for (let [label, value] of entries) {
      let hbox = new St.BoxLayout()
      value = value.slice(1, -4) + ' °C'
      hbox.add(new St.Label({text: label + ':', style_class: 'label'}), {expand: true, x_align: St.Align.START})
      hbox.add(new St.Label({text: value, style_class: 'value'}), {expand: false, x_align: St.Align.END})
      this._tempLabels.push(hbox)
      this._tempBox.add(hbox)
    }
    if (turbo) {
      let hbox = new St.BoxLayout({style_class: 'turbo'})
      hbox.add(new St.Label({text: 'Turbo starts at:', style_class: 'label'}), {expand: true, x_align: St.Align.START})
      hbox.add(new St.Label({text: turbo + '%', style_class: 'value'}), {expand: false, x_align: St.Align.END})
      this._tempLabels.push(hbox)
      this._tempBox.add(hbox)
    }
  }

  updateFrequency (entries) {
    for (let child of this._freqLabels) {
      this._freqBox.remove_child(child)
    }
    this._freqLabels = []
    for (let [label, value] of entries) {
      let hbox = new St.BoxLayout()
      value = Number(value / 1000000).toFixed(2) + ' GHz'
      hbox.add(new St.Label({text: label + ':', style_class: 'label'}), {expand: true, x_align: St.Align.START})
      hbox.add(new St.Label({text: value, style_class: 'value'}), {expand: false, x_align: St.Align.END})
      this._freqLabels.push(hbox)
      this._freqBox.add(hbox)
    }
  }
}
