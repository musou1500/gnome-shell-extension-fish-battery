// Reads Fish Keyboard battery levels for the left (central) and right (peripheral) halves.
//
// BlueZ shows only the first Battery Service (the left half) in GNOME/upower.
// The right half's level is proxied by the left half as another Battery Level
// characteristic, so it is read directly over BlueZ's GATT D-Bus API.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.DBusConnection.prototype, 'call');

const DEVICE_NAME = 'Fish Keyboard';
const BATTERY_LEVEL_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
const USER_DESCRIPTION_UUID = '00002901-0000-1000-8000-00805f9b34fb';

async function callBluez(path, iface, method, args, replyType, cancellable) {
    const reply = await Gio.DBus.system.call('org.bluez', path, iface, method, args,
        new GLib.VariantType(replyType), Gio.DBusCallFlags.NONE, 5000, cancellable);
    return reply.recursiveUnpack()[0];
}

function readValue(path, iface, cancellable) {
    return callBluez(path, iface, 'ReadValue',
        new GLib.Variant('(a{sv})', [{}]), '(ay)', cancellable);
}

/**
 * Returns the top bar text such as "L 30% R 71%", or null when the keyboard is not connected.
 * A level shows "?" when it is unknown: the firmware does not proxy the right half's level,
 * or the right half is not connected.
 */
export async function readBatteryText(cancellable = null) {
    const objects = await callBluez('/', 'org.freedesktop.DBus.ObjectManager',
        'GetManagedObjects', null, '(a{oa{sa{sv}}})', cancellable);

    // Several devices can share the name (e.g. an old pairing), so use the connected one.
    const devicePath = Object.keys(objects).find(path => {
        const device = objects[path]['org.bluez.Device1'];
        return device && device.Name === DEVICE_NAME && device.Connected;
    });
    if (!devicePath)
        return null;

    // Left half: the Battery Service that BlueZ's battery plugin handles.
    const left = objects[devicePath]['org.bluez.Battery1']?.Percentage;

    // Right half: the extra Battery Level characteristic labelled "Peripheral 0".
    // It reads 0 when the right half is not connected.
    // A failed read only hides the right level, so the left level still shows.
    let right;
    try {
        right = await readRightLevel(objects, devicePath, cancellable);
    } catch (e) {
        if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            throw e;
    }

    const leftText = left !== undefined ? `${left}%` : '?';
    const rightText = right ? `${right}%` : '?';
    return `L ${leftText} R ${rightText}`;
}

async function readRightLevel(objects, devicePath, cancellable) {
    let right;
    for (const path of Object.keys(objects).sort()) {
        const characteristic = objects[path]['org.bluez.GattCharacteristic1'];
        if (!path.startsWith(`${devicePath}/`) || characteristic?.UUID !== BATTERY_LEVEL_UUID)
            continue;
        const descriptorPath = Object.keys(objects).find(p =>
            p.startsWith(`${path}/`) &&
            objects[p]['org.bluez.GattDescriptor1']?.UUID === USER_DESCRIPTION_UUID);
        if (!descriptorPath)
            continue;
        const label = new TextDecoder().decode(
            await readValue(descriptorPath, 'org.bluez.GattDescriptor1', cancellable));
        if (label.startsWith('Peripheral'))
            right = (await readValue(path, 'org.bluez.GattCharacteristic1', cancellable))[0];
    }
    return right;
}
