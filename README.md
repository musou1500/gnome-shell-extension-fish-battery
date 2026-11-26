# Fish Keyboard Battery

[おさかなキーボード（Fish Keyboard）](https://github.com/TakumaOnishi/Fish_Keyboard)の左右の充電残量を GNOME Shell のトップバーに表示する拡張機能です。

```
🐟 L 30% R 71%
```

GNOME の標準の電池表示では、左手側（親機）の残量しか見えません。この拡張は、左手側が中継している右手側の残量も BlueZ から直接読み取って表示します。

## 必要なもの

- GNOME Shell 50
- 右手側の残量を中継するファームウェア。ZMK の設定（`.conf`）に次の 2 行が必要です。

  ```
  CONFIG_ZMK_SPLIT_BLE_CENTRAL_BATTERY_LEVEL_FETCHING=y
  CONFIG_ZMK_SPLIT_BLE_CENTRAL_BATTERY_LEVEL_PROXY=y
  ```

  この設定がない場合、右手側は `?` と表示されます。

## インストール

```sh
git clone https://github.com/musou1500/gnome-shell-extension-fish-battery.git
ln -s "$PWD/gnome-shell-extension-fish-battery" \
  ~/.local/share/gnome-shell/extensions/fish-battery@musou1500.github.io
```

ログアウトしてログインし直したあと、拡張機能を有効にします。

```sh
gnome-extensions enable fish-battery@musou1500.github.io
```

## 使い方

- 残量は 5 分ごとに更新されます。表示をクリックするとすぐに更新します。
- キーボードがつながっていないときは `-` と表示されます。

キーボードは Bluetooth のデバイス名 `Fish Keyboard` で探します。ファームウェアでキーボード名（`CONFIG_ZMK_KEYBOARD_NAME`）を変えている場合は、`battery.js` の `DEVICE_NAME` を書き換えてください。

## ライセンス

GPL-2.0-or-later
