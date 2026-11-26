#!/usr/bin/env python3
"""Show Fish Keyboard battery levels for the left (central) and right (peripheral) halves.

BlueZ shows only the first Battery Service (the left half) in GNOME/upower.
The right half's level is proxied by the left half as another Battery Level
characteristic, so this script reads it directly over BlueZ's GATT D-Bus API.
"""
import sys

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

DEVICE_NAME = "Fish Keyboard"
BATTERY_LEVEL_UUID = "00002a19-0000-1000-8000-00805f9b34fb"
USER_DESCRIPTION_UUID = "00002901-0000-1000-8000-00805f9b34fb"


def call(bus, path, interface, method, args, reply_type):
    return bus.call_sync(
        "org.bluez", path, interface, method, args,
        GLib.VariantType(reply_type), Gio.DBusCallFlags.NONE, 5000, None,
    ).unpack()[0]


def read_value(bus, path, interface):
    value = call(bus, path, interface, "ReadValue",
                 GLib.Variant("(a{sv})", ({},)), "(ay)")
    return bytes(value)


def main():
    bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, None)
    objects = call(bus, "/", "org.freedesktop.DBus.ObjectManager",
                   "GetManagedObjects", None, "(a{oa{sa{sv}}})")

    # Several devices can share the name (e.g. an old pairing), so use the connected one.
    device_path = None
    for path, interfaces in objects.items():
        device = interfaces.get("org.bluez.Device1")
        if device and device.get("Name") == DEVICE_NAME and device.get("Connected"):
            device_path = path
    if device_path is None:
        sys.exit(f"{DEVICE_NAME} is not connected.")

    # Left half: the Battery Service that BlueZ's battery plugin handles.
    left = objects[device_path].get("org.bluez.Battery1", {}).get("Percentage")

    # Right half: the extra Battery Level characteristic labelled "Peripheral 0".
    # None: the firmware does not proxy it. 0: the right half is not connected.
    right = None
    for path, interfaces in sorted(objects.items()):
        char = interfaces.get("org.bluez.GattCharacteristic1")
        if not path.startswith(device_path + "/") or not char:
            continue
        if char.get("UUID") != BATTERY_LEVEL_UUID:
            continue
        label = None
        for desc_path, desc_interfaces in objects.items():
            desc = desc_interfaces.get("org.bluez.GattDescriptor1")
            if desc and desc_path.startswith(path + "/") and desc.get("UUID") == USER_DESCRIPTION_UUID:
                label = read_value(bus, desc_path, "org.bluez.GattDescriptor1").decode()
        if label is None or not label.startswith("Peripheral"):
            continue
        right = read_value(bus, path, "org.bluez.GattCharacteristic1")[0]

    # --short is for the GNOME top bar extension.
    if "--short" in sys.argv[1:]:
        left_text = f"{left}%" if left is not None else "?"
        right_text = f"{right}%" if right else "?"
        print(f"L {left_text} R {right_text}")
        return

    print(f"左: {left}%" if left is not None else "左: 不明")
    if right is None:
        print("右: 不明（右手側の残量を公開するファームではありません）")
    elif right == 0:
        print("右: 不明（右手側が未接続）")
    else:
        print(f"右: {right}%")


if __name__ == "__main__":
    main()
