import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UPDATE_INTERVAL_SECONDS = 300;

export default class FishBatteryExtension extends Extension {
    enable() {
        this._button = new PanelMenu.Button(0.0, this.metadata.name, true);
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        const iconFile = this.dir.get_child('fish-symbolic.svg');
        box.add_child(new St.Icon({
            gicon: new Gio.FileIcon({file: iconFile}),
            style_class: 'system-status-icon',
        }));
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
        GLib.Source.remove(this._timerId);
        this._timerId = null;
        this._button.destroy();
        this._button = null;
        this._label = null;
    }

    _update() {
        let proc;
        try {
            const script = this.dir.get_child('fish-battery.py').get_path();
            proc = Gio.Subprocess.new([script, '--short'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            this._setText('-');
            return;
        }
        proc.communicate_utf8_async(null, null, (p, result) => {
            try {
                const [, stdout] = p.communicate_utf8_finish(result);
                // The script prints nothing to stdout when the keyboard is not connected.
                this._setText(stdout.trim() || '-');
            } catch (e) {
                this._setText('-');
            }
        });
    }

    _setText(text) {
        if (this._label)
            this._label.text = text;
    }
}
