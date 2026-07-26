# uniwilld JSON API

`uniwilld` exposes a newline-delimited JSON protocol over a Unix domain socket.
The default socket path is:

```text
/run/uniwilld.sock
```

Each request is one JSON object followed by `\n`. Each response is one JSON object followed by
`\n`.

Example:

```sh
printf '{"cmd":"status"}\n' | socat - UNIX-CONNECT:/run/uniwilld.sock
```

All successful responses contain:

```json
{"ok":true}
```

Errors use this shape:

```json
{"ok":false,"error":22,"message":"invalid fan control mode"}
```

`error` is the positive errno value returned by the service.

The server accepts multiple concurrent Unix socket clients. The control center keeps one
full-duplex connection open for commands, responses, and service events.

## Persistent full-duplex connection

The control center sends this as the first request:

```json
{"cmd":"subscribe"}
```

The service acknowledges the persistent connection:

```json
{"ok":true,"event":"subscribed","revision":42}
```

Normal commands can then be sent on the same socket. Their responses remain ordered, while a state
event may appear between responses:

```json
{"ok":true,"event":"state_changed","revision":43,"snapshot":{"temp1_input":52000,"fan1_input":2300,"active_profile":2,"active_source":"ac","lightbar":{},"batteries":[]}}
```

Events are emitted after successful state-changing commands and when monitored hardware data
actually changes. Each event includes one complete daemon-side snapshot. The control center merges
it field by field, retains the previous value for temporary `null` fields, and emits
`dashboard-updated` to React. It does not issue follow-up dashboard reads or poll `uniwilld`.

## Generic Endpoints

These commands expose all sysfs endpoints discovered by the daemon.

### list

Lists discovered endpoints and whether each one is writable.

Request:

```json
{"cmd":"list"}
```

Response:

```json
{"ok":true,"endpoints":[{"name":"temp1_input","writable":false},{"name":"pwm1","writable":true}]}
```

### get

Reads one endpoint by name.

Request:

```json
{"cmd":"get","name":"temp1_input"}
```

Response:

```json
{"ok":true,"name":"temp1_input","value":"52000"}
```

### set

Writes one writable endpoint by name, then reads it back.

Request:

```json
{"cmd":"set","name":"performance_profile","value":2}
```

String values are also accepted:

```json
{"cmd":"set","name":"pwm1","value":"120\n"}
```

Response:

```json
{"ok":true,"name":"performance_profile","value":"2"}
```

### get_all

Reads all currently discovered endpoints. Endpoints that fail to read are skipped.

Request:

```json
{"cmd":"get_all"}
```

Response:

```json
{"ok":true,"values":{"temp1_input":"52000","temp2_input":"48000","pwm1":"90"}}
```

## Status

### status

Returns discovered paths and current fan/temperature values.

Request:

```json
{"cmd":"status"}
```

Response:

```json
{
  "ok": true,
  "hwmon": "/sys/class/hwmon/hwmon3",
  "platform": "/sys/bus/platform/devices/INOU0000:00",
  "temp1_input": "52000",
  "temp2_input": "48000",
  "fan1_input": "2400",
  "fan2_input": "2200",
  "pwm1": "90",
  "pwm2": "80",
  "pwm1_enable": "1",
  "pwm2_enable": "1",
  "fan_control": "manual",
  "curve_control": true,
  "system_power_mode": "balanced",
  "power_mode_auto_sync": true,
  "last_synced_power_profile": 2
}
```

## Temperatures

The service uses these same readings for curve control:

- CPU curve: reads `temp1_input`, writes `pwm1`.
- GPU curve: reads `temp2_input`, writes `pwm2`.

### get_cpu_temp

Request:

```json
{"cmd":"get_cpu_temp"}
```

Response:

```json
{"ok":true,"sensor":"cpu","temp_millidegree":52000,"temp_c":52,"curve_fan":"cpu"}
```

### get_gpu_temp

Request:

```json
{"cmd":"get_gpu_temp"}
```

Response:

```json
{"ok":true,"sensor":"gpu","temp_millidegree":48000,"temp_c":48,"curve_fan":"gpu"}
```

### get_temps

Request:

```json
{"cmd":"get_temps"}
```

Response:

```json
{
  "ok": true,
  "cpu": {"available": true, "temp_millidegree": 52000, "temp_c": 52, "curve_fan": "cpu"},
  "gpu": {"available": true, "temp_millidegree": 48000, "temp_c": 48, "curve_fan": "gpu"}
}
```

## Fan RPM

These commands read the fan tachometer values exposed by hwmon.

### get_cpu_fan_rpm

Reads `fan1_input`, the main/CPU fan tachometer value.

Request:

```json
{"cmd":"get_cpu_fan_rpm"}
```

Response:

```json
{"ok":true,"fan":"cpu","sensor":"fan1_input","rpm":2400}
```

### get_gpu_fan_rpm

Reads `fan2_input`, the secondary/GPU fan tachometer value.

Request:

```json
{"cmd":"get_gpu_fan_rpm"}
```

Response:

```json
{"ok":true,"fan":"gpu","sensor":"fan2_input","rpm":2200}
```

### get_fan_rpms

Reads both fan tachometer values.

Request:

```json
{"cmd":"get_fan_rpms"}
```

Response:

```json
{
  "ok": true,
  "cpu": {"available": true, "sensor": "fan1_input", "rpm": 2400},
  "gpu": {"available": true, "sensor": "fan2_input", "rpm": 2200}
}
```

## Battery

Battery commands read Linux power-supply attributes from `/sys/class/power_supply/BAT*`.
Field availability varies by firmware and battery driver. Numeric fields keep kernel sysfs units:

- `capacity_percent`: percent.
- `energy_*_uwh`: microwatt-hours.
- `charge_*_uah`: microamp-hours.
- `voltage_*_uv`: microvolts.
- `power_now_uw`: microwatts.
- `current_now_ua`: microamps.
- `charge_control_end_threshold`: percent.

### get_battery

Reads one battery. If `name` is omitted, the first battery is used.

Request:

```json
{"cmd":"get_battery"}
```

or:

```json
{"cmd":"get_battery","name":"BAT0"}
```

Response:

```json
{
  "ok": true,
  "battery": {
    "name": "BAT0",
    "manufacturer": "Example",
    "model_name": "Pack",
    "serial_number": "1234",
    "status": "Charging",
    "capacity_percent": 76,
    "health": "Good",
    "cycle_count": 42,
    "charge_control_end_threshold": 80,
    "energy_now_uwh": 45600000,
    "energy_full_uwh": 60000000,
    "energy_full_design_uwh": 73000000,
    "charge_now_uah": null,
    "charge_full_uah": null,
    "charge_full_design_uah": null,
    "voltage_now_uv": 12000000,
    "voltage_min_design_uv": 11550000,
    "power_now_uw": 24000000,
    "current_now_ua": null
  }
}
```

### get_batteries

Reads all batteries.

Request:

```json
{"cmd":"get_batteries"}
```

Response:

```json
{"ok":true,"batteries":[{"name":"BAT0","status":"Discharging","capacity_percent":76}]}
```

The real response includes the same fields as `get_battery`.

### set_battery_charge_limit

Writes `charge_control_end_threshold`. If `name` is omitted, the first battery is used.
Valid thresholds are `1` through `100`.

Request:

```json
{"cmd":"set_battery_charge_limit","threshold":80}
```

or:

```json
{"cmd":"set_battery_charge_limit","name":"BAT0","value":80}
```

Response:

```json
{"ok":true,"battery":{"name":"BAT0","charge_control_end_threshold":80}}
```

## Fan Control

### get_fan_control

Returns whether the daemon is using its curve loop or the EC is controlling fans automatically.

Request:

```json
{"cmd":"get_fan_control"}
```

Response:

```json
{"ok":true,"mode":"manual","curve_control":true,"pwm1_enable":"1","pwm2_enable":"1"}
```

### set_fan_control

Switches fan control mode.

`manual` enables the daemon's curve loop and writes `1` to `pwm1_enable` and `pwm2_enable`.
`auto` disables the daemon's curve loop and writes `2` to `pwm1_enable` and `pwm2_enable`.

Request:

```json
{"cmd":"set_fan_control","mode":"auto"}
```

or:

```json
{"cmd":"set_fan_control","mode":"manual"}
```

Response:

```json
{"ok":true,"mode":"auto","curve_control":false,"pwm1_enable":"2","pwm2_enable":"2"}
```

### tick

Runs one fan-control tick immediately. If fan control is `auto`, this is a no-op.

Request:

```json
{"cmd":"tick"}
```

Response:

```json
{"ok":true}
```

## Fan Boost

### get_fan_boost

Request:

```json
{"cmd":"get_fan_boost"}
```

Response:

```json
{"ok":true,"fan_boost":false,"fan_control":"manual","restore_pending":false,"restore_mode":"auto"}
```

### set_fan_boost

When enabling boost, the service saves the current fan-control mode, switches fans to EC automatic
mode, then enables boost.

When disabling boost, it disables boost first and restores the saved fan-control mode.

Request:

```json
{"cmd":"set_fan_boost","value":true}
```

Response:

```json
{"ok":true,"fan_boost":true,"fan_control":"auto","restore_pending":true,"restore_mode":"manual"}
```

Disable:

```json
{"cmd":"set_fan_boost","value":false}
```

## Fan Curves

Fan curves are stored in daemon memory. They take effect immediately but are reset to defaults when
the service restarts.

Fan names:

- CPU/main fan: `cpu`, `main`, or `0`.
- GPU/secondary fan: `gpu`, `secondary`, or `1`.

Curve point rules:

- `temp` is degrees Celsius.
- `pwm` is `0` to `255`.
- Points must be sorted by increasing `temp`.
- Up to 16 points are accepted.
- Values between points use linear interpolation.

### get_curve

Request:

```json
{"cmd":"get_curve","fan":"cpu"}
```

Response:

```json
{"ok":true,"curve":{"fan":"cpu","points":[{"temp":35,"pwm":0},{"temp":50,"pwm":70}]}}
```

### set_curve

Request:

```json
{
  "cmd": "set_curve",
  "fan": "cpu",
  "points": [
    {"temp": 35, "pwm": 0},
    {"temp": 50, "pwm": 70},
    {"temp": 70, "pwm": 150},
    {"temp": 90, "pwm": 255}
  ]
}
```

Response:

```json
{"ok":true,"curve":{"fan":"cpu","points":[{"temp":35,"pwm":0},{"temp":50,"pwm":70},{"temp":70,"pwm":150},{"temp":90,"pwm":255}]}}
```

## Persistent Profile Slots

The daemon stores three profile slots. Every slot has separate `ac` and `battery` branches, and
every branch stores an independent power mode and fan mode. The selected slot and all branch
values are persisted in `/var/lib/uniwilld/state.conf`.

```json
{"cmd":"get_profiles"}
```

Update one branch:

```json
{
  "cmd":"set_profile_config",
  "profile":2,
  "source":"battery",
  "power_mode":"battery_saver",
  "fan_mode":"quiet"
}
```

Select a slot and apply its current AC/battery branch:

```json
{"cmd":"activate_profile","profile":2}
```

## Power Mode

`get_power_mode` reads the currently applied/indicated hardware power level. `set_power_mode`
changes and persists the selected slot's current-source power level, applies the driver's hardware
power configuration and chassis indicator, and updates the system power profile over D-Bus.

### get_power_mode

Request:

```json
{"cmd":"get_power_mode"}
```

Response:

```json
{"ok":true,"profile":2,"mode":"standard"}
```

### set_power_mode

Modes:

- `performance`: profile `1`.
- `standard`, `balanced`, or `balance`: profile `2`.
- `quiet` or `silent`: profile `3`.

Request:

```json
{"cmd":"set_power_mode","mode":"performance"}
```

Numeric values are also accepted:

```json
{"cmd":"set_power_mode","profile":2}
```

Response:

```json
{"ok":true,"profile":1,"mode":"performance"}
```

## System Power Mode

These commands operate only the system power profile over D-Bus. They require
`power-profiles-daemon` to provide the `org.freedesktop.UPower.PowerProfiles` service.

Supported system modes:

- `performance`, `perf`, `high-performance`, or `high_performance`: D-Bus profile `performance`.
- `balanced`, `balance`, or `standard`: D-Bus profile `balanced`.
- `power-saver`, `powersave`, `power_saver`, `quiet`, `silent`, or `save-power`: D-Bus profile
  `power-saver`.

### get_system_power_mode

Request:

```json
{"cmd":"get_system_power_mode"}
```

Response:

```json
{"ok":true,"mode":"balanced"}
```

### set_system_power_mode

Request:

```json
{"cmd":"set_system_power_mode","mode":"performance"}
```

Response:

```json
{"ok":true,"mode":"performance"}
```

## Fan Mode

This controls the driver's `fan_mode` platform attribute. It is distinct from `set_fan_control`,
which switches between the daemon's manual curve loop and EC automatic control.

On Intel NUC X15 systems, the driver lowers only the first automatic fan transition for cooler idle
operation; the firmware remains responsible for fan speeds and all later curve transitions.

### get_fan_mode

Request:

```json
{"cmd":"get_fan_mode"}
```

Response:

```json
{"ok":true,"fan_mode":2,"mode":"standard"}
```

### set_fan_mode

Modes:

- `performance` or `perf`: fan mode `1`.
- `standard`, `balanced`, or `balance`: fan mode `2`.
- `quiet` or `silent`: fan mode `3`.
- `whisper`: fan mode `4`.
- `benchmark` or `boost`: fan mode `5`.

Request:

```json
{"cmd":"set_fan_mode","mode":"quiet"}
```

Numeric values are also accepted:

```json
{"cmd":"set_fan_mode","fan_mode":2}
```

Response:

```json
{"ok":true,"fan_mode":3,"mode":"quiet"}
```

## Keyboard Toggles

Boolean values can be JSON booleans, `0`/`1`, or strings like `on`, `off`, `enable`, and `disable`.

### get_fn_lock

Request:

```json
{"cmd":"get_fn_lock"}
```

Response:

```json
{"ok":true,"fn_lock":true}
```

### set_fn_lock

Request:

```json
{"cmd":"set_fn_lock","value":true}
```

### get_touchpad_toggle

Reads the driver's `touchpad_toggle_enable` attribute.

Request:

```json
{"cmd":"get_touchpad_toggle"}
```

Response:

```json
{"ok":true,"touchpad_toggle_enable":true}
```

### set_touchpad_toggle

Sets the driver's `touchpad_toggle_enable` attribute.

Request:

```json
{"cmd":"set_touchpad_toggle","value":false}
```

Response:

```json
{"ok":true,"touchpad_toggle_enable":false}
```

Convenience commands:

```json
{"cmd":"enable_touchpad_toggle"}
```

```json
{"cmd":"disable_touchpad_toggle"}
```

### get_super_key

Aliases: `get_super_lock`.

Request:

```json
{"cmd":"get_super_key"}
```

Response:

```json
{"ok":true,"super_key_enabled":true}
```

### set_super_key

Aliases: `set_super_lock`.

Request:

```json
{"cmd":"set_super_key","value":false}
```

## Lightbar

### get_lightbar

Request:

```json
{"cmd":"get_lightbar"}
```

Response:

```json
{
  "ok": true,
  "brightness": "160",
  "max_brightness": "200",
  "multi_intensity": "255 80 0",
  "rainbow": true,
  "rainbow_mode": true,
  "breathing_in_suspend": true,
  "sleep_breathing": true
}
```

### set_lightbar

Supported fields:

- `source`: `ac` or `battery`; configurations are persisted independently.
- `global_enabled`: master lightbar switch.
- `enabled`: source-specific enable switch.
- `brightness`: LED brightness.
- `red`, `green`, `blue`: RGB multi-intensity values.
- `rainbow` or `rainbow_mode`: maps to the driver's `rainbow_animation`.
- `breathing`, `breathing_in_suspend`, or `sleep_breathing`: maps to the driver's suspend breathing switch.

Set brightness and color:

```json
{"cmd":"set_lightbar","brightness":160,"red":255,"green":80,"blue":0}
```

Enable rainbow and sleep breathing:

```json
{"cmd":"set_lightbar","rainbow_mode":true,"sleep_breathing":true}
```

Response:

```json
{"ok":true,"brightness":"160","max_brightness":"200","multi_intensity":"255 80 0","rainbow":true,"rainbow_mode":true,"breathing_in_suspend":true,"sleep_breathing":true}
```

## Keyboard Backlight

The ITE 8291 keyboard backlight uses brightness values from 0 through 50 and one uniform RGB color.

```json
{"cmd":"get_keyboard_backlight"}
```

```json
{"cmd":"set_keyboard_backlight","brightness":30,"color":"ff5000"}
```

RGB components are also accepted:

```json
{"cmd":"set_keyboard_backlight","red":40,"green":100,"blue":255}
```

## Discovery

### reload

Rediscovers sysfs endpoints.

Request:

```json
{"cmd":"reload"}
```

Response:

```json
{"ok":true,"endpoints":24}
```
