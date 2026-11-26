import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {readBatteryText} from './battery.js';

const UPDATE_INTERVAL_SECONDS = 300;
// Reading usually takes well under a second, so keep the swimming fish visible at least this long.
const MIN_UPDATING_MS = 1200;

// The fish changes with the state: normal, updating (blowing bubbles) or disconnected.
const ICON_FILES = {
    normal: 'fish-symbolic.svg',
    updating: 'fish-updating-symbolic.svg',
    disconnected: 'fish-disconnected-symbolic.svg',
};

export default class FishBatteryExtension extends Extension {
    enable() {
        this._cancellable = new Gio.Cancellable();
        // An update from before the last disable() may still be finishing its cancellation.
        this._updating = false;
        this._button = new PanelMenu.Button(0.0, this.metadata.name, true);
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({style_class: 'system-status-icon'});
        box.add_child(this._icon);
        this._label = new St.Label({text: '…', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._label);
        this._button.add_child(box);
        // Clicking the label refreshes it right away.
        this._button.connect('button-press-event', () => {
            this._update();
            return Clutter.EVENT_STOP;
        });
        Main.panel.addToStatusArea(this.uuid, this._button);

        this._update();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_SECONDS, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        this._cancellable.cancel();
        this._cancellable = null;
        GLib.Source.remove(this._timerId);
        this._timerId = null;
        if (this._minUpdatingTimerId) {
            GLib.Source.remove(this._minUpdatingTimerId);
            this._minUpdatingTimerId = null;
        }
        this._button.destroy();
        this._button = null;
        this._icon = null;
        this._label = null;
    }

    async _update() {
        // Skip while an update is running so an older result cannot overwrite a newer one.
        if (this._updating)
            return;
        this._updating = true;
        this._setIcon('updating');
        // Clicks are ignored until this ends too, since the update still shows as running.
        const minUpdatingTime = new Promise(resolve => {
            this._minUpdatingTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MIN_UPDATING_MS, () => {
                this._minUpdatingTimerId = null;
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
        let text;
        try {
            try {
                // null when the keyboard is not connected.
                text = await readBatteryText(this._cancellable);
            } catch (e) {
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    return;
                text = null;
            }
            // Never resolves when disable() removes the timer, so nothing below runs after that.
            await minUpdatingTime;
        } finally {
            this._updating = false;
        }
        if (!this._label)
            return;
        this._label.text = text ?? '-';
        this._setIcon(text ? 'normal' : 'disconnected');
    }

    _setIcon(state) {
        const file = this.dir.get_child(ICON_FILES[state]);
        this._icon.gicon = new Gio.FileIcon({file});

        // While updating, the fish bobs up and down as if swimming.
        this._icon.remove_all_transitions();
        this._icon.translation_y = 0;
        if (state === 'updating') {
            this._icon.ease({
                translation_y: -2,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                repeatCount: -1,
                autoReverse: true,
            });
        }
    }
}
