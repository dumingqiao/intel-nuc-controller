use gio::{glib::variant::ToVariant, prelude::SettingsExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, ErrorKind, Write},
    os::unix::net::UnixStream,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, SyncSender},
        Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    image::Image,
    menu::{
        CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItem, MenuItemBuilder, Submenu,
        SubmenuBuilder,
    },
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;

const UNIWILLD_SOCKET: &str = "/run/uniwilld.sock";
static APP_CLOSING: AtomicBool = AtomicBool::new(false);
static DASHBOARD_STATE: OnceLock<Mutex<DashboardState>> = OnceLock::new();
static DASHBOARD_WORKER_STARTED: OnceLock<()> = OnceLock::new();
static DASHBOARD_REFRESH_SENDER: OnceLock<mpsc::Sender<Value>> = OnceLock::new();
static DAEMON_REQUEST_SENDER: OnceLock<mpsc::Sender<DaemonRequest>> = OnceLock::new();
static UI_LANGUAGE: OnceLock<Mutex<String>> = OnceLock::new();

#[derive(Clone, Debug, Serialize)]
struct SensorMetric {
    label: &'static str,
    value: Option<f64>,
    unit: &'static str,
    load: Option<f64>,
    frequency_mhz: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
struct FanMetric {
    label: &'static str,
    pwm: Option<u16>,
    percent: Option<f64>,
    rpm: Option<u32>,
    mode: String,
}

#[derive(Clone, Debug, Serialize)]
struct KeyboardLocks {
    fn_lock: Option<bool>,
    super_key_enabled: Option<bool>,
    touchpad_hotkey_enabled: Option<bool>,
    touchpad_enabled: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
struct LightbarState {
    brightness: Option<u16>,
    max_brightness: Option<u16>,
    color: Option<String>,
    rainbow: Option<bool>,
    breathing: Option<bool>,
    settings: Option<Value>,
}

#[derive(Clone, Debug, Serialize)]
struct BatteryState {
    capacity: Option<u8>,
    health: Option<String>,
    status: Option<String>,
    charging: Option<bool>,
    cycle_count: Option<u32>,
    charge_limit: Option<u8>,
}

#[derive(Clone, Debug, Serialize)]
struct BatteryChargeLimit {
    name: String,
    threshold: u8,
}

#[derive(Clone, Debug, Serialize)]
struct DeviceInformation {
    system: SystemInformation,
    storage: Vec<StorageDeviceInformation>,
    batteries: Vec<BatteryInformation>,
    versions: VersionInformation,
}

#[derive(Clone, Debug, Serialize)]
struct VersionInformation {
    controller: SoftwareVersion,
    service: Option<SoftwareVersion>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct SoftwareVersion {
    name: String,
    version: String,
    build: String,
    full: String,
}

#[derive(Clone, Debug, Serialize)]
struct SystemInformation {
    manufacturer: Option<String>,
    model: Option<String>,
    product_version: Option<String>,
    sku: Option<String>,
    serial_number: Option<String>,
    bios_vendor: Option<String>,
    bios_version: Option<String>,
    bios_date: Option<String>,
    board_vendor: Option<String>,
    board_name: Option<String>,
    board_version: Option<String>,
    processor: Option<String>,
    physical_cores: Option<u32>,
    logical_processors: Option<u32>,
    memory_bytes: Option<u64>,
    memory_slots: Option<u32>,
    memory_devices: Vec<MemoryDeviceInformation>,
    operating_system: Option<String>,
    kernel: Option<String>,
    architecture: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct MemoryDeviceInformation {
    locator: Option<String>,
    bank_locator: Option<String>,
    manufacturer: Option<String>,
    serial_number: Option<String>,
    part_number: Option<String>,
    memory_type: Option<String>,
    form_factor: Option<String>,
    size_bytes: u64,
    speed_mt_s: Option<u32>,
    configured_speed_mt_s: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
struct StorageDeviceInformation {
    name: String,
    model: Option<String>,
    vendor: Option<String>,
    serial_number: Option<String>,
    firmware: Option<String>,
    size_bytes: u64,
    available_bytes: Option<u64>,
    available_percent: Option<u8>,
    transport: String,
    rotational: bool,
    removable: bool,
    smart_available: bool,
    smart_passed: Option<bool>,
    health_percent: Option<u8>,
    percentage_used: Option<u8>,
    available_spare_percent: Option<u8>,
    temperature_c: Option<i32>,
    power_on_hours: Option<u64>,
    power_cycles: Option<u64>,
    unsafe_shutdowns: Option<u64>,
    media_errors: Option<u64>,
    total_bytes_written: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ServiceDeviceDetails {
    #[serde(default)]
    storage: Vec<ServiceStorageDetail>,
    #[serde(default)]
    memory: ServiceMemoryDetail,
}

#[derive(Debug, Default, Deserialize)]
struct ServiceMemoryDetail {
    slots: Option<u32>,
    #[serde(default)]
    devices: Vec<MemoryDeviceInformation>,
}

#[derive(Debug, Deserialize)]
struct ServiceStorageDetail {
    name: String,
    #[serde(default)]
    available: bool,
    available_bytes: Option<u64>,
    available_percent: Option<u8>,
    protocol: Option<String>,
    model: Option<String>,
    serial_number: Option<String>,
    firmware: Option<String>,
    smart_passed: Option<bool>,
    health_percent: Option<u8>,
    percentage_used: Option<u8>,
    available_spare_percent: Option<u8>,
    temperature_c: Option<i32>,
    power_on_hours: Option<u64>,
    power_cycles: Option<u64>,
    unsafe_shutdowns: Option<u64>,
    media_errors: Option<u64>,
    total_bytes_written: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
struct BatteryInformation {
    name: String,
    manufacturer: Option<String>,
    model_name: Option<String>,
    serial_number: Option<String>,
    technology: Option<String>,
    cycle_count: Option<u32>,
    full_capacity: Option<u64>,
    design_capacity: Option<u64>,
    capacity_unit: Option<String>,
    health_percent: Option<u8>,
    design_voltage_uv: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
struct Dashboard {
    connected: bool,
    message: String,
    cpu: SensorMetric,
    gpu: SensorMetric,
    fans: Vec<FanMetric>,
    power_mode: Option<String>,
    system_power_mode: Option<String>,
    fan_mode: Option<String>,
    fan_control: Option<String>,
    passive_cooling: Option<bool>,
    active_source: Option<String>,
    active_profile: Option<u8>,
    keyboard: KeyboardLocks,
    keyboard_light: Option<Value>,
    lightbar: LightbarState,
    battery: BatteryState,
}

struct DashboardState {
    current: Dashboard,
    last_success: Option<Dashboard>,
}

struct TrayMenuState {
    status: MenuItem<tauri::Wry>,
    power_menu: Submenu<tauri::Wry>,
    power_performance: CheckMenuItem<tauri::Wry>,
    power_balanced: CheckMenuItem<tauri::Wry>,
    power_saver: CheckMenuItem<tauri::Wry>,
    keyboard_light: CheckMenuItem<tauri::Wry>,
    lightbar: CheckMenuItem<tauri::Wry>,
    open: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

struct DaemonRequest {
    payload: Value,
    timeout: Duration,
    reply: SyncSender<Result<Value, String>>,
}

#[derive(Debug, Deserialize)]
struct UniwillResponse {
    ok: bool,
    #[serde(default)]
    message: Option<String>,
    #[serde(flatten)]
    data: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct CurvePointInput {
    temp: u16,
    pwm: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FanSettingsInput {
    cpu_points: Vec<CurvePointInput>,
    gpu_points: Vec<CurvePointInput>,
    fan_mode: Option<String>,
    passive_cooling: bool,
    source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LightbarSettingsInput {
    source: String,
    global_enabled: bool,
    enabled: bool,
    brightness: u16,
    red: u16,
    green: u16,
    blue: u16,
    rainbow: bool,
    breathing: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeyboardLightSettingsInput {
    source: String,
    global_enabled: bool,
    enabled: bool,
    brightness: u8,
    red: u8,
    green: u8,
    blue: u8,
    effect: String,
    speed: u8,
    direction: String,
    reactive: bool,
}

#[tauri::command]
fn get_dashboard() -> Dashboard {
    dashboard_state()
        .lock()
        .map(|state| state.current.clone())
        .unwrap_or_else(|_| disconnected_dashboard("状态缓存暂不可用".to_string()))
}

#[tauri::command]
fn get_system_dark_mode() -> bool {
    read_gsettings_dark_mode().unwrap_or(false)
}

#[tauri::command]
fn get_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())?;
    } else {
        manager.disable().map_err(|error| error.to_string())?;
    }
    manager.is_enabled().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_ui_language(app: AppHandle, language: String) -> Result<(), String> {
    let language = match language.as_str() {
        "zh-CN" | "en" | "fr" | "de" => language,
        _ => return Err("unsupported language".to_string()),
    };
    *ui_language()
        .lock()
        .map_err(|_| "language state is unavailable".to_string())? = language;
    localize_tray_menu(&app);
    restore_tray_from_dashboard(&app);
    Ok(())
}

#[tauri::command]
fn get_system_language() -> String {
    detect_system_ui_language()
}

#[tauri::command]
fn get_device_information() -> DeviceInformation {
    let mut system = read_system_information();
    let mut storage = read_storage_devices();

    if let Ok(response) = query_uniwilld_control(json!({"cmd": "get_device_details"})) {
        if let Ok(details) = serde_json::from_value::<ServiceDeviceDetails>(response) {
            system.memory_slots = details.memory.slots;
            system.memory_devices = details
                .memory
                .devices
                .into_iter()
                .map(normalize_memory_device)
                .collect();
            let installed_memory = system
                .memory_devices
                .iter()
                .map(|device| device.size_bytes)
                .fold(0_u64, u64::saturating_add);
            if installed_memory > 0 {
                system.memory_bytes = Some(installed_memory);
            }
            merge_service_storage_details(&mut storage, details.storage);
        }
    }

    DeviceInformation {
        system,
        storage,
        batteries: read_battery_information(),
        versions: read_version_information(),
    }
}

fn read_version_information() -> VersionInformation {
    let controller = SoftwareVersion {
        name: "nuc-x15-controller".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        build: env!("NUC_BUILD_NUMBER").to_string(),
        full: env!("NUC_FULL_VERSION").to_string(),
    };
    let service = query_uniwilld_control(json!({"cmd": "get_version"}))
        .ok()
        .and_then(|response| serde_json::from_value::<SoftwareVersion>(response).ok());

    VersionInformation {
        controller,
        service,
    }
}

#[tauri::command]
fn get_application_version() -> String {
    env!("NUC_FULL_VERSION").to_string()
}

fn battery_charge_limit_from_json(battery: &Value) -> Option<BatteryChargeLimit> {
    let name = battery.get("name")?.as_str()?.trim();
    let threshold = value_as_u8(Some(battery), &["charge_control_end_threshold"])?;
    if name.is_empty() || !(1..=100).contains(&threshold) {
        return None;
    }
    Some(BatteryChargeLimit {
        name: name.to_string(),
        threshold,
    })
}

fn first_charge_control_battery(response: &Value) -> Option<BatteryChargeLimit> {
    response
        .get("batteries")?
        .as_array()?
        .iter()
        .find_map(battery_charge_limit_from_json)
}

#[tauri::command]
fn get_battery_charge_limit() -> Result<Option<BatteryChargeLimit>, String> {
    let response = query_uniwilld_control(json!({"cmd": "get_batteries"}))?;
    Ok(first_charge_control_battery(&response))
}

#[tauri::command]
fn set_battery_charge_limit(name: String, threshold: u8) -> Result<BatteryChargeLimit, String> {
    if !(1..=100).contains(&threshold) {
        return Err("充电上限必须在 1% 到 100% 之间".to_string());
    }
    let response = query_uniwilld_control(json!({
        "cmd": "set_battery_charge_limit",
        "name": name,
        "threshold": threshold,
    }))?;
    let applied = response
        .get("battery")
        .and_then(battery_charge_limit_from_json)
        .ok_or_else(|| "控制服务未返回充电上限".to_string())?;
    if applied.name != name || applied.threshold != threshold {
        return Err(format!(
            "充电上限回读为 {}%，与请求的 {}% 不一致",
            applied.threshold, threshold
        ));
    }
    Ok(applied)
}

#[tauri::command]
fn apply_fan_settings(settings: FanSettingsInput) -> Result<Value, String> {
    validate_curve("CPU", &settings.cpu_points)?;
    validate_curve("GPU", &settings.gpu_points)?;
    validate_power_source(&settings.source)?;
    if matches!(settings.fan_mode.as_deref(), Some("whisper" | "benchmark")) {
        return Err("Whisper 或基准模式正在接管风扇，请先关闭该模式再应用曲线".to_string());
    }

    let fan_mode = settings
        .fan_mode
        .as_deref()
        .map(|mode| apply_fan_mode(mode, Some(&settings.source)))
        .transpose()
        .map_err(|error| format!("风扇模式应用失败：{error}"))?;
    let passive = query_uniwilld_control(json!({
        "cmd": "set_passive_cooling",
        "source": settings.source,
        "value": settings.passive_cooling,
    }))
    .map_err(|error| format!("被动散热应用失败：{error}"))?;

    let cpu = query_uniwilld_control(json!({
        "cmd": "set_curve",
        "fan": "cpu",
        "source": settings.source,
        "points": settings.cpu_points,
    }))
    .map_err(|error| format!("CPU 风扇曲线应用失败：{error}"))?;
    let gpu = query_uniwilld_control(json!({
        "cmd": "set_curve",
        "fan": "gpu",
        "source": settings.source,
        "points": settings.gpu_points,
    }))
    .map_err(|error| format!("GPU 风扇曲线应用失败：{error}"))?;
    let control = query_uniwilld_control(json!({"cmd": "set_fan_control", "mode": "manual"}))
        .map_err(|error| format!("风扇曲线控制启用失败：{error}"))?;
    let _ = query_uniwilld(json!({"cmd": "tick"}));

    Ok(json!({
        "cpu": cpu,
        "gpu": gpu,
        "control": control,
        "fan_mode": fan_mode,
        "passive": passive,
    }))
}

#[tauri::command]
fn set_fan_mode(mode: String, source: String) -> Result<Value, String> {
    apply_fan_mode(&mode, Some(&source))
}

#[tauri::command]
fn set_passive_cooling(enabled: bool, source: String) -> Result<Value, String> {
    query_uniwilld_control(json!({
        "cmd": "set_passive_cooling",
        "source": source,
        "value": if enabled { 1 } else { 0 },
    }))
}

#[tauri::command]
fn get_persisted_fan_profiles() -> Result<Value, String> {
    let mut profiles = serde_json::Map::new();

    for source in ["ac", "battery"] {
        let cpu = query_uniwilld_control(json!({"cmd": "get_curve", "fan": "cpu", "source": source}))?;
        let gpu = query_uniwilld_control(json!({"cmd": "get_curve", "fan": "gpu", "source": source}))?;
        let mode = query_uniwilld_control(json!({"cmd": "get_fan_mode", "source": source}))?;
        let passive = query_uniwilld_control(json!({"cmd": "get_passive_cooling", "source": source}))?;
        profiles.insert(
            source.to_string(),
            json!({"cpu": cpu, "gpu": gpu, "mode": mode, "passive": passive}),
        );
    }

    Ok(Value::Object(profiles))
}

#[tauri::command]
fn get_power_profiles() -> Result<Value, String> {
    read_power_profiles()
}

#[tauri::command]
fn get_lightbar_settings() -> Result<Value, String> {
    let response = query_uniwilld(json!({"cmd": "get_lightbar"}))
        .map_err(|error| format!("灯条设置读取失败：{error}"))?;
    response
        .get("state")
        .cloned()
        .ok_or_else(|| "控制服务未返回灯条配置".to_string())
}

#[tauri::command]
fn apply_lightbar_settings(settings: LightbarSettingsInput) -> Result<Value, String> {
    validate_power_source(&settings.source)?;
    if settings.brightness > 255
        || settings.red > 255
        || settings.green > 255
        || settings.blue > 255
    {
        return Err("灯条亮度和 RGB 通道必须在 0 到 255 之间".to_string());
    }

    let response = query_uniwilld_control(json!({
        "cmd": "set_lightbar",
        "source": settings.source,
        "global_enabled": settings.global_enabled,
        "enabled": settings.enabled,
        "brightness": settings.brightness,
        "red": settings.red,
        "green": settings.green,
        "blue": settings.blue,
        "rainbow": settings.rainbow,
        "breathing": settings.breathing,
    }))
    .map_err(|error| format!("灯条设置应用失败：{error}"))?;

    response
        .get("state")
        .cloned()
        .ok_or_else(|| "控制服务未返回灯条配置".to_string())
}

#[tauri::command]
fn get_keyboard_light_settings() -> Result<Value, String> {
    let response = query_uniwilld(json!({"cmd": "get_keyboard_backlight"}))
        .map_err(|error| format!("键盘灯效读取失败：{error}"))?;
    response
        .get("state")
        .cloned()
        .ok_or_else(|| "控制服务未返回键盘灯效配置".to_string())
}

#[tauri::command]
fn apply_keyboard_light_settings(settings: KeyboardLightSettingsInput) -> Result<Value, String> {
    validate_power_source(&settings.source)?;
    if settings.brightness > 50 || settings.speed > 10 {
        return Err("键盘亮度必须在 0 到 50 之间，速度必须在 0 到 10 之间".to_string());
    }
    if !matches!(
        settings.effect.as_str(),
        "solid"
            | "breathing"
            | "wave"
            | "random"
            | "rainbow"
            | "ripple"
            | "marquee"
            | "raindrop"
            | "aurora"
            | "fireworks"
    ) {
        return Err("不支持的键盘灯效".to_string());
    }
    if !matches!(
        settings.direction.as_str(),
        "left" | "right" | "up" | "down"
    ) {
        return Err("不支持的键盘灯效方向".to_string());
    }

    let response = query_uniwilld_control(json!({
        "cmd": "set_keyboard_backlight",
        "source": settings.source,
        "global_enabled": settings.global_enabled,
        "enabled": settings.enabled,
        "brightness": settings.brightness,
        "red": settings.red,
        "green": settings.green,
        "blue": settings.blue,
        "effect": settings.effect,
        "speed": settings.speed,
        "direction": settings.direction,
        "reactive": settings.reactive,
    }))
    .map_err(|error| format!("键盘灯效应用失败：{error}"))?;

    response
        .get("state")
        .cloned()
        .ok_or_else(|| "控制服务未返回键盘灯效配置".to_string())
}

#[tauri::command]
fn set_fn_lock(enabled: bool) -> Result<bool, String> {
    let response = query_uniwilld_control(json!({
        "cmd": "set_fn_lock",
        "value": enabled,
    }))
    .map_err(|error| format!("Fn 锁设置失败：{error}"))?;
    value_as_bool(Some(&response), &["fn_lock"])
        .ok_or_else(|| "控制服务未返回 Fn 锁状态".to_string())
}

#[tauri::command]
fn set_win_key_enabled(enabled: bool) -> Result<bool, String> {
    let response = query_uniwilld_control(json!({
        "cmd": "set_super_key",
        "value": enabled,
    }))
    .map_err(|error| format!("Win 键设置失败：{error}"))?;
    value_as_bool(Some(&response), &["super_key_enabled"])
        .ok_or_else(|| "控制服务未返回 Win 键状态".to_string())
}

#[tauri::command]
fn set_touchpad_enabled(enabled: bool) -> Result<bool, String> {
    let confirmed = set_desktop_touchpad_enabled(enabled)?;
    let response = query_uniwilld_control(json!({
        "cmd": "set_touchpad_state",
        "enabled": confirmed,
    }))
    .map_err(|error| format!("触摸板已切换，但指示灯同步失败：{error}"))?;
    let firmware_state = value_as_bool(Some(&response), &["touchpad_enabled"])
        .ok_or_else(|| "触摸板已切换，但控制服务未返回指示灯同步状态".to_string())?;
    if firmware_state != confirmed {
        return Err("触摸板已切换，但控制服务返回了不一致的状态".to_string());
    }
    Ok(confirmed)
}

#[tauri::command]
fn set_power_profile_power_mode(
    profile: u8,
    source: String,
    mode: String,
) -> Result<Value, String> {
    validate_power_profile(profile)?;
    validate_power_source(&source)?;
    validate_power_level(&mode)?;

    let response = query_uniwilld_control(json!({
        "cmd": "set_profile_config",
        "profile": profile,
        "source": source,
        "power_mode": mode,
    }))
    .map_err(|error| format!("功率模式保存失败：{error}"))?;

    extract_profile_state(response)
}

#[tauri::command]
fn set_power_profile_fan_mode(profile: u8, source: String, mode: String) -> Result<Value, String> {
    validate_power_profile(profile)?;
    validate_power_source(&source)?;
    validate_profile_fan_mode(&mode)?;

    let response = query_uniwilld_control(json!({
        "cmd": "set_profile_config",
        "profile": profile,
        "source": source,
        "fan_mode": mode,
    }))
    .map_err(|error| format!("风扇模式保存失败：{error}"))?;

    extract_profile_state(response)
}

#[tauri::command]
fn activate_power_profile(profile: u8) -> Result<Value, String> {
    validate_power_profile(profile)?;
    query_uniwilld_control(json!({
        "cmd": "activate_profile",
        "profile": profile,
    }))
    .map_err(|error| format!("方案切换失败：{error}"))?;
    read_power_profiles()
}

fn read_power_profiles() -> Result<Value, String> {
    let response = query_uniwilld(json!({"cmd": "get_profiles"}))
        .map_err(|error| format!("电源方案读取失败：{error}"))?;
    extract_profile_state(response)
}

fn extract_profile_state(response: Value) -> Result<Value, String> {
    response
        .get("state")
        .cloned()
        .ok_or_else(|| "控制服务未返回电源方案状态".to_string())
}

fn validate_power_profile(profile: u8) -> Result<(), String> {
    if (1..=3).contains(&profile) {
        Ok(())
    } else {
        Err(format!("不支持的电源方案编号: {profile}"))
    }
}

fn validate_power_source(source: &str) -> Result<(), String> {
    if matches!(source, "ac" | "battery") {
        Ok(())
    } else {
        Err(format!("不支持的电源来源: {source}"))
    }
}

fn validate_profile_fan_mode(mode: &str) -> Result<(), String> {
    if matches!(mode, "performance" | "standard" | "quiet") {
        Ok(())
    } else {
        Err(format!("不支持的风扇模式: {mode}"))
    }
}

fn validate_power_level(mode: &str) -> Result<(), String> {
    if matches!(mode, "performance" | "balanced" | "battery_saver") {
        Ok(())
    } else {
        Err(format!("不支持的功率模式: {mode}"))
    }
}

fn apply_fan_mode(mode: &str, source: Option<&str>) -> Result<Value, String> {
    if !matches!(
        mode,
        "performance" | "standard" | "quiet" | "whisper" | "benchmark"
    ) {
        return Err(format!("不支持的风扇模式: {mode}"));
    }
    let mut write_request = json!({"cmd": "set_fan_mode", "mode": mode});
    if let Some(source) = source {
        validate_power_source(source)?;
        write_request["source"] = json!(source);
    }
    let response = query_uniwilld_control(write_request)?;
    let actual_mode = value_as_string(Some(&response), &["mode"])
        .ok_or_else(|| "控制服务未返回风扇模式".to_string())?;
    if actual_mode != mode {
        return Err(format!("硬件未接受 {mode} 模式，实际模式为 {actual_mode}"));
    }
    Ok(response)
}

fn validate_curve(name: &str, points: &[CurvePointInput]) -> Result<(), String> {
    if !(2..=16).contains(&points.len()) {
        return Err(format!("{name} 曲线必须包含 2 到 16 个节点"));
    }
    for point in points {
        if point.temp > 120 {
            return Err(format!("{name} 曲线温度不能高于 120°C"));
        }
        if point.pwm > 255 {
            return Err(format!("{name} 曲线 PWM 不能高于 255"));
        }
    }
    if points.windows(2).any(|pair| pair[0].temp >= pair[1].temp) {
        return Err(format!("{name} 曲线温度节点必须严格递增"));
    }
    if points.windows(2).any(|pair| pair[0].pwm > pair[1].pwm) {
        return Err(format!("{name} 曲线占空比不能随温度升高而降低"));
    }
    let last = points.last().expect("curve length was checked above");
    if last.temp > 100 {
        return Err(format!("{name} 曲线最后一个安全节点不能高于 100°C"));
    }
    if last.pwm != 255 {
        return Err(format!("{name} 曲线最后一个安全节点必须为 100% 占空比"));
    }
    Ok(())
}

fn supported_ui_language(locale: &str) -> Option<&'static str> {
    locale
        .split([':', ';'])
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .find_map(|value| {
            let language = value
                .split(['_', '-', '.', '@'])
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase();
            match language.as_str() {
                "zh" => Some("zh-CN"),
                "en" => Some("en"),
                "fr" => Some("fr"),
                "de" => Some("de"),
                _ => None,
            }
        })
}

fn detect_system_ui_language() -> String {
    for name in ["LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG"] {
        let Ok(locale) = std::env::var(name) else {
            continue;
        };
        if locale.trim().is_empty() {
            continue;
        }
        return supported_ui_language(&locale).unwrap_or("en").to_string();
    }
    "en".to_string()
}

fn ui_language() -> &'static Mutex<String> {
    UI_LANGUAGE.get_or_init(|| Mutex::new(detect_system_ui_language()))
}

fn current_ui_language() -> String {
    ui_language()
        .lock()
        .map(|language| language.clone())
        .unwrap_or_else(|_| "en".to_string())
}

fn tray_text(language: &str, key: &str) -> &'static str {
    match (language, key) {
        ("en", "connecting") => "Connecting to control service…",
        ("en", "performance") => "Performance",
        ("en", "balanced") => "Balanced",
        ("en", "saver") => "Battery Saver",
        ("en", "keyboard") => "Keyboard Lights",
        ("en", "lightbar") => "Light Bar",
        ("en", "open") => "Open",
        ("en", "quit") => "Quit",
        ("en", "power_menu") => "Overall Power Mode",
        ("en", "ac") => "Plugged In",
        ("en", "battery") => "On Battery",
        ("en", "power_unknown") => "Power Unknown",
        ("en", "profile_unknown") => "Profile Unknown",
        ("en", "offline") => "Control Service Offline",
        ("en", "current") => "Current",
        ("en", "switching") => "Switching to",
        ("en", "switch_failed") => "Switch failed",
        ("en", "keyboard_on") => "Enabling keyboard lights…",
        ("en", "keyboard_off") => "Disabling keyboard lights…",
        ("en", "keyboard_failed") => "Keyboard light failed",
        ("en", "lightbar_on") => "Enabling light bar…",
        ("en", "lightbar_off") => "Disabling light bar…",
        ("en", "lightbar_failed") => "Light bar failed",
        ("fr", "connecting") => "Connexion au service…",
        ("fr", "performance") => "Performances",
        ("fr", "balanced") => "Équilibré",
        ("fr", "saver") => "Économie",
        ("fr", "keyboard") => "Éclairage clavier",
        ("fr", "lightbar") => "Barre lumineuse",
        ("fr", "open") => "Ouvrir",
        ("fr", "quit") => "Quitter",
        ("fr", "power_menu") => "Mode d’alimentation global",
        ("fr", "ac") => "Sur secteur",
        ("fr", "battery") => "Sur batterie",
        ("fr", "power_unknown") => "Alimentation inconnue",
        ("fr", "profile_unknown") => "Profil inconnu",
        ("fr", "offline") => "Service hors ligne",
        ("fr", "current") => "Actuel",
        ("fr", "switching") => "Activation de",
        ("fr", "switch_failed") => "Échec du changement",
        ("fr", "keyboard_on") => "Activation du clavier…",
        ("fr", "keyboard_off") => "Désactivation du clavier…",
        ("fr", "keyboard_failed") => "Échec de l’éclairage clavier",
        ("fr", "lightbar_on") => "Activation de la barre…",
        ("fr", "lightbar_off") => "Désactivation de la barre…",
        ("fr", "lightbar_failed") => "Échec de la barre lumineuse",
        ("de", "connecting") => "Verbindung zum Steuerungsdienst…",
        ("de", "performance") => "Leistung",
        ("de", "balanced") => "Ausgeglichen",
        ("de", "saver") => "Energiesparen",
        ("de", "keyboard") => "Tastaturlicht",
        ("de", "lightbar") => "Lichtleiste",
        ("de", "open") => "Öffnen",
        ("de", "quit") => "Beenden",
        ("de", "power_menu") => "Globaler Energiemodus",
        ("de", "ac") => "Netzbetrieb",
        ("de", "battery") => "Akkubetrieb",
        ("de", "power_unknown") => "Stromquelle unbekannt",
        ("de", "profile_unknown") => "Profil unbekannt",
        ("de", "offline") => "Steuerungsdienst offline",
        ("de", "current") => "Aktuell",
        ("de", "switching") => "Wechsel zu",
        ("de", "switch_failed") => "Wechsel fehlgeschlagen",
        ("de", "keyboard_on") => "Tastaturlicht wird aktiviert…",
        ("de", "keyboard_off") => "Tastaturlicht wird deaktiviert…",
        ("de", "keyboard_failed") => "Tastaturlicht fehlgeschlagen",
        ("de", "lightbar_on") => "Lichtleiste wird aktiviert…",
        ("de", "lightbar_off") => "Lichtleiste wird deaktiviert…",
        ("de", "lightbar_failed") => "Lichtleiste fehlgeschlagen",
        (_, "connecting") => "正在连接控制服务…",
        (_, "performance") => "高性能",
        (_, "balanced") => "均衡",
        (_, "saver") => "省电",
        (_, "keyboard") => "键盘灯",
        (_, "lightbar") => "灯条",
        (_, "open") => "打开主界面",
        (_, "quit") => "退出",
        (_, "power_menu") => "整体电源模式",
        (_, "ac") => "接通电源",
        (_, "battery") => "使用电池",
        (_, "power_unknown") => "电源未知",
        (_, "profile_unknown") => "方案未知",
        (_, "offline") => "控制服务离线",
        (_, "current") => "当前",
        (_, "switching") => "正在切换到",
        (_, "switch_failed") => "切换失败",
        (_, "keyboard_on") => "正在开启键盘灯…",
        (_, "keyboard_off") => "正在关闭键盘灯…",
        (_, "keyboard_failed") => "键盘灯操作失败",
        (_, "lightbar_on") => "正在开启灯条…",
        (_, "lightbar_off") => "正在关闭灯条…",
        (_, "lightbar_failed") => "灯条操作失败",
        _ => "",
    }
}

fn localize_tray_menu(app: &AppHandle) {
    let Some(state) = app.try_state::<TrayMenuState>() else {
        return;
    };
    let language = current_ui_language();
    let _ = state
        .power_performance
        .set_text(tray_text(&language, "performance"));
    let _ = state
        .power_balanced
        .set_text(tray_text(&language, "balanced"));
    let _ = state.power_saver.set_text(tray_text(&language, "saver"));
    let _ = state
        .keyboard_light
        .set_text(tray_text(&language, "keyboard"));
    let _ = state.lightbar.set_text(tray_text(&language, "lightbar"));
    let _ = state
        .power_menu
        .set_text(tray_text(&language, "power_menu"));
    let _ = state.open.set_text(tray_text(&language, "open"));
    let _ = state.quit.set_text(tray_text(&language, "quit"));
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let language = current_ui_language();
    let status = MenuItemBuilder::with_id("tray_status", tray_text(&language, "connecting"))
        .enabled(false)
        .build(app)?;
    let power_performance = CheckMenuItemBuilder::with_id(
        "tray_power_performance",
        tray_text(&language, "performance"),
    )
    .checked(false)
    .build(app)?;
    let power_balanced =
        CheckMenuItemBuilder::with_id("tray_power_balanced", tray_text(&language, "balanced"))
            .checked(false)
            .build(app)?;
    let power_saver =
        CheckMenuItemBuilder::with_id("tray_power_saver", tray_text(&language, "saver"))
            .checked(false)
            .build(app)?;
    let keyboard_light =
        CheckMenuItemBuilder::with_id("tray_keyboard_light", tray_text(&language, "keyboard"))
            .checked(false)
            .build(app)?;
    let lightbar = CheckMenuItemBuilder::with_id("tray_lightbar", tray_text(&language, "lightbar"))
        .checked(false)
        .build(app)?;
    let open = MenuItemBuilder::with_id("tray_open", tray_text(&language, "open")).build(app)?;
    let quit = MenuItemBuilder::with_id("tray_quit", tray_text(&language, "quit")).build(app)?;

    for item in [
        &power_performance,
        &power_balanced,
        &power_saver,
        &keyboard_light,
        &lightbar,
    ] {
        item.set_enabled(false)?;
    }

    let power_menu = SubmenuBuilder::new(app, tray_text(&language, "power_menu"))
        .items(&[&power_performance, &power_balanced, &power_saver])
        .build()?;
    let menu = MenuBuilder::new(app)
        .item(&status)
        .separator()
        .item(&power_menu)
        .separator()
        .items(&[&keyboard_light, &lightbar])
        .separator()
        .item(&open)
        .item(&quit)
        .build()?;

    app.manage(TrayMenuState {
        status,
        power_menu,
        power_performance,
        power_balanced,
        power_saver,
        keyboard_light,
        lightbar,
        open,
        quit,
    });

    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-mono.png"))?;
    TrayIconBuilder::with_id("nuc-x15-controller")
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("Intel NUC Control Center")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_tray_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn handle_tray_menu_event(app: &AppHandle, id: &str) {
    match id {
        "tray_open" => show_main_window(app),
        "tray_quit" => {
            APP_CLOSING.store(true, Ordering::Relaxed);
            app.exit(0);
        }
        "tray_power_performance" => apply_tray_power_profile(app, 1),
        "tray_power_balanced" => apply_tray_power_profile(app, 2),
        "tray_power_saver" => apply_tray_power_profile(app, 3),
        "tray_keyboard_light" => toggle_tray_keyboard_light(app),
        "tray_lightbar" => toggle_tray_lightbar(app),
        _ => {}
    }
}

fn apply_tray_power_profile(app: &AppHandle, profile: u8) {
    let language = current_ui_language();
    let label = tray_text(
        &language,
        match profile {
            1 => "performance",
            3 => "saver",
            _ => "balanced",
        },
    );
    set_tray_power_checks(app, Some(profile));
    set_tray_status(
        app,
        &format!("{} {label}…", tray_text(&language, "switching")),
    );
    let app = app.clone();
    thread::spawn(move || {
        if let Err(error) =
            query_uniwilld_control(json!({"cmd": "activate_profile", "profile": profile}))
        {
            let language = current_ui_language();
            set_tray_status(
                &app,
                &format!(
                    "{}: {}",
                    tray_text(&language, "switch_failed"),
                    compact_error(&error)
                ),
            );
            restore_tray_from_dashboard(&app);
        }
    });
}

fn toggle_tray_keyboard_light(app: &AppHandle) {
    let Some(dashboard) = current_dashboard() else {
        return;
    };
    let Some(settings) = dashboard.keyboard_light.as_ref() else {
        return;
    };
    let available = value_as_bool(Some(settings), &["available"]).unwrap_or(false);
    let current = value_as_bool(Some(settings), &["global_enabled"]);
    if !available || current.is_none() {
        restore_tray_from_dashboard(app);
        return;
    }
    let enabled = !current.unwrap_or(false);
    if let Some(state) = app.try_state::<TrayMenuState>() {
        let _ = state.keyboard_light.set_checked(enabled);
    }
    let language = current_ui_language();
    set_tray_status(
        app,
        tray_text(
            &language,
            if enabled {
                "keyboard_on"
            } else {
                "keyboard_off"
            },
        ),
    );
    let source = dashboard
        .active_source
        .as_deref()
        .filter(|source| matches!(*source, "ac" | "battery"))
        .unwrap_or("ac")
        .to_string();
    let app = app.clone();
    thread::spawn(move || {
        if let Err(error) = query_uniwilld_control(json!({
            "cmd": "set_keyboard_backlight",
            "source": source,
            "global_enabled": enabled,
        })) {
            let language = current_ui_language();
            set_tray_status(
                &app,
                &format!(
                    "{}: {}",
                    tray_text(&language, "keyboard_failed"),
                    compact_error(&error)
                ),
            );
            restore_tray_from_dashboard(&app);
        }
    });
}

fn toggle_tray_lightbar(app: &AppHandle) {
    let Some(dashboard) = current_dashboard() else {
        return;
    };
    let Some(settings) = dashboard.lightbar.settings.as_ref() else {
        return;
    };
    let Some(current) = value_as_bool(Some(settings), &["global_enabled"]) else {
        restore_tray_from_dashboard(app);
        return;
    };
    let enabled = !current;
    if let Some(state) = app.try_state::<TrayMenuState>() {
        let _ = state.lightbar.set_checked(enabled);
    }
    let language = current_ui_language();
    set_tray_status(
        app,
        tray_text(
            &language,
            if enabled {
                "lightbar_on"
            } else {
                "lightbar_off"
            },
        ),
    );
    let source = dashboard
        .active_source
        .as_deref()
        .filter(|source| matches!(*source, "ac" | "battery"))
        .unwrap_or("ac")
        .to_string();
    let app = app.clone();
    thread::spawn(move || {
        if let Err(error) = query_uniwilld_control(json!({
            "cmd": "set_lightbar",
            "source": source,
            "global_enabled": enabled,
        })) {
            let language = current_ui_language();
            set_tray_status(
                &app,
                &format!(
                    "{}: {}",
                    tray_text(&language, "lightbar_failed"),
                    compact_error(&error)
                ),
            );
            restore_tray_from_dashboard(&app);
        }
    });
}

fn current_dashboard() -> Option<Dashboard> {
    dashboard_state()
        .lock()
        .ok()
        .map(|state| state.current.clone())
}

fn restore_tray_from_dashboard(app: &AppHandle) {
    if let Some(dashboard) = current_dashboard() {
        sync_tray_menu(app, &dashboard);
    }
}

fn set_tray_status(app: &AppHandle, text: &str) {
    if let Some(state) = app.try_state::<TrayMenuState>() {
        let _ = state.status.set_text(text);
    }
}

fn set_tray_power_checks(app: &AppHandle, profile: Option<u8>) {
    if let Some(state) = app.try_state::<TrayMenuState>() {
        let _ = state.power_performance.set_checked(profile == Some(1));
        let _ = state.power_balanced.set_checked(profile == Some(2));
        let _ = state.power_saver.set_checked(profile == Some(3));
    }
}

fn sync_tray_menu(app: &AppHandle, dashboard: &Dashboard) {
    let Some(state) = app.try_state::<TrayMenuState>() else {
        return;
    };
    let connected = dashboard.connected;
    let language = current_ui_language();
    let source = match dashboard.active_source.as_deref() {
        Some("battery") => tray_text(&language, "battery"),
        Some("ac") => tray_text(&language, "ac"),
        _ => tray_text(&language, "power_unknown"),
    };
    let profile = match dashboard.active_profile {
        Some(1) => tray_text(&language, "performance"),
        Some(2) => tray_text(&language, "balanced"),
        Some(3) => tray_text(&language, "saver"),
        _ => tray_text(&language, "profile_unknown"),
    };
    let _ = state.status.set_text(if connected {
        format!("{}: {profile} · {source}", tray_text(&language, "current"))
    } else {
        tray_text(&language, "offline").to_string()
    });
    for item in [
        &state.power_performance,
        &state.power_balanced,
        &state.power_saver,
    ] {
        let _ = item.set_enabled(connected);
    }
    set_tray_power_checks(app, dashboard.active_profile);

    let keyboard_available = dashboard
        .keyboard_light
        .as_ref()
        .and_then(|settings| value_as_bool(Some(settings), &["available"]))
        .unwrap_or(false);
    let keyboard_enabled = dashboard
        .keyboard_light
        .as_ref()
        .and_then(|settings| value_as_bool(Some(settings), &["global_enabled"]))
        .unwrap_or(false);
    let _ = state
        .keyboard_light
        .set_enabled(connected && keyboard_available);
    let _ = state.keyboard_light.set_checked(keyboard_enabled);

    let lightbar_enabled = dashboard
        .lightbar
        .settings
        .as_ref()
        .and_then(|settings| value_as_bool(Some(settings), &["global_enabled"]));
    let _ = state
        .lightbar
        .set_enabled(connected && lightbar_enabled.is_some());
    let _ = state
        .lightbar
        .set_checked(lightbar_enabled.unwrap_or(false));
}

fn compact_error(error: &str) -> String {
    const MAX_CHARS: usize = 42;
    let compact = error.replace(['\n', '\r'], " ");
    if compact.chars().count() <= MAX_CHARS {
        return compact;
    }
    let short: String = compact.chars().take(MAX_CHARS).collect();
    format!("{short}…")
}

fn dashboard_state() -> &'static Mutex<DashboardState> {
    DASHBOARD_STATE.get_or_init(|| {
        Mutex::new(DashboardState {
            current: disconnected_dashboard("等待后端采集".to_string()),
            last_success: None,
        })
    })
}

fn start_dashboard_worker(app: AppHandle) {
    DASHBOARD_WORKER_STARTED.get_or_init(|| {
        let (refresh_tx, refresh_rx) = mpsc::channel();
        let _ = DASHBOARD_REFRESH_SENDER.set(refresh_tx);
        thread::spawn(move || {
            while !APP_CLOSING.load(Ordering::Relaxed) {
                let Ok(snapshot) = refresh_rx.recv_timeout(Duration::from_millis(250)) else {
                    continue;
                };
                let dashboard = update_dashboard_state(dashboard_from_snapshot(&snapshot));
                sync_tray_menu(&app, &dashboard);
                let _ = app.emit("dashboard-updated", dashboard);
            }
        });
    });
}

fn request_dashboard_refresh(snapshot: Value) {
    if let Some(sender) = DASHBOARD_REFRESH_SENDER.get() {
        let _ = sender.send(snapshot);
    }
}

fn update_dashboard_state(mut next: Dashboard) -> Dashboard {
    let Ok(mut state) = dashboard_state().lock() else {
        return disconnected_dashboard("状态缓存暂不可用".to_string());
    };

    if next.connected {
        if let Some(previous) = state.last_success.as_ref() {
            next = merge_dashboard_snapshot(next, previous);
        }
        state.last_success = Some(next.clone());
        state.current = next;
        return state.current.clone();
    }

    if is_transient_uniwilld_error(&next.message) {
        if let Some(mut previous) = state.last_success.clone() {
            previous.connected = false;
            previous.message = format!("控制服务连接已断开：{}", next.message);
            state.current = previous;
            return state.current.clone();
        }
    }

    state.current = next;
    state.current.clone()
}

fn merge_dashboard_snapshot(mut next: Dashboard, previous: &Dashboard) -> Dashboard {
    next.cpu.value = next.cpu.value.or(previous.cpu.value);
    next.cpu.load = next.cpu.load.or(previous.cpu.load);
    next.cpu.frequency_mhz = next.cpu.frequency_mhz.or(previous.cpu.frequency_mhz);
    next.gpu.value = next.gpu.value.or(previous.gpu.value);
    next.gpu.load = next.gpu.load.or(previous.gpu.load);
    next.gpu.frequency_mhz = next.gpu.frequency_mhz.or(previous.gpu.frequency_mhz);

    for (fan, old_fan) in next.fans.iter_mut().zip(previous.fans.iter()) {
        fan.pwm = fan.pwm.or(old_fan.pwm);
        fan.percent = fan.percent.or(old_fan.percent);
        fan.rpm = fan.rpm.or(old_fan.rpm);
        if fan.mode == "unknown" {
            fan.mode = old_fan.mode.clone();
        }
    }

    next.power_mode = next.power_mode.or_else(|| previous.power_mode.clone());
    next.system_power_mode = next
        .system_power_mode
        .or_else(|| previous.system_power_mode.clone());
    next.fan_mode = next.fan_mode.or_else(|| previous.fan_mode.clone());
    next.fan_control = next.fan_control.or_else(|| previous.fan_control.clone());
    next.passive_cooling = next.passive_cooling.or(previous.passive_cooling);
    next.active_source = next
        .active_source
        .or_else(|| previous.active_source.clone());
    next.active_profile = next.active_profile.or(previous.active_profile);

    next.keyboard.fn_lock = next.keyboard.fn_lock.or(previous.keyboard.fn_lock);
    next.keyboard.super_key_enabled = next
        .keyboard
        .super_key_enabled
        .or(previous.keyboard.super_key_enabled);
    next.keyboard.touchpad_hotkey_enabled = next
        .keyboard
        .touchpad_hotkey_enabled
        .or(previous.keyboard.touchpad_hotkey_enabled);
    next.keyboard.touchpad_enabled = next
        .keyboard
        .touchpad_enabled
        .or(previous.keyboard.touchpad_enabled);
    next.keyboard_light = next
        .keyboard_light
        .or_else(|| previous.keyboard_light.clone());

    next.lightbar.brightness = next.lightbar.brightness.or(previous.lightbar.brightness);
    next.lightbar.max_brightness = next
        .lightbar
        .max_brightness
        .or(previous.lightbar.max_brightness);
    next.lightbar.color = next
        .lightbar
        .color
        .or_else(|| previous.lightbar.color.clone());
    next.lightbar.rainbow = next.lightbar.rainbow.or(previous.lightbar.rainbow);
    next.lightbar.breathing = next.lightbar.breathing.or(previous.lightbar.breathing);
    next.lightbar.settings = next
        .lightbar
        .settings
        .or_else(|| previous.lightbar.settings.clone());

    next.battery.capacity = next.battery.capacity.or(previous.battery.capacity);
    next.battery.health = next
        .battery
        .health
        .or_else(|| previous.battery.health.clone());
    next.battery.status = next
        .battery
        .status
        .or_else(|| previous.battery.status.clone());
    next.battery.charging = next.battery.charging.or(previous.battery.charging);
    next.battery.cycle_count = next.battery.cycle_count.or(previous.battery.cycle_count);
    next.battery.charge_limit = next.battery.charge_limit.or(previous.battery.charge_limit);
    next
}

fn dashboard_from_snapshot(snapshot: &Value) -> Dashboard {
    let fan_control = value_as_string(Some(snapshot), &["fan_control"]);
    let lightbar = snapshot.get("lightbar");
    let cpu_temp = value_as_f64(Some(snapshot), &["temp1_input"]).map(|value| value / 1000.0);
    let gpu_temp = value_as_f64(Some(snapshot), &["temp2_input"]).map(|value| value / 1000.0);

    Dashboard {
        connected: true,
        message: "控制服务已连接".to_string(),
        cpu: SensorMetric {
            label: "CPU",
            value: cpu_temp,
            unit: "C",
            load: read_cpu_load(),
            frequency_mhz: read_cpu_frequency_mhz(),
        },
        gpu: SensorMetric {
            label: "GPU",
            value: gpu_temp,
            unit: "C",
            load: None,
            frequency_mhz: None,
        },
        fans: vec![
            build_fan(
                "CPU Fan",
                value_as_u16(Some(snapshot), &["pwm1"]),
                value_as_u32(Some(snapshot), &["fan1_input"]),
                fan_control.as_deref(),
            ),
            build_fan(
                "GPU Fan",
                value_as_u16(Some(snapshot), &["pwm2"]),
                value_as_u32(Some(snapshot), &["fan2_input"]),
                fan_control.as_deref(),
            ),
        ],
        power_mode: value_as_string(Some(snapshot), &["power_mode"]),
        system_power_mode: value_as_string(Some(snapshot), &["system_power_mode"])
            .filter(|mode| !mode.is_empty()),
        fan_mode: value_as_string(Some(snapshot), &["fan_mode"]),
        fan_control,
        passive_cooling: value_as_bool(Some(snapshot), &["passive_cooling"]),
        active_source: value_as_string(Some(snapshot), &["active_source"]),
        active_profile: value_as_u8(Some(snapshot), &["active_profile"]),
        keyboard: KeyboardLocks {
            fn_lock: value_as_bool(Some(snapshot), &["fn_lock"]),
            super_key_enabled: value_as_bool(Some(snapshot), &["super_key_enabled"]),
            touchpad_hotkey_enabled: value_as_bool(Some(snapshot), &["touchpad_hotkey_enabled"]),
            touchpad_enabled: read_touchpad_enabled(),
        },
        keyboard_light: snapshot.get("keyboard_backlight").cloned(),
        lightbar: LightbarState {
            brightness: value_as_u16(lightbar, &["brightness"]),
            max_brightness: value_as_u16(lightbar, &["max_brightness"]),
            color: value_as_string(lightbar, &["multi_intensity"]),
            rainbow: value_as_bool(lightbar, &["rainbow"]),
            breathing: value_as_bool(lightbar, &["breathing"]),
            settings: lightbar.and_then(|value| value.get("settings")).cloned(),
        },
        battery: merge_battery_state(
            battery_from_uniwill_response(Some(snapshot)),
            read_battery_state(),
        ),
    }
}

fn disconnected_dashboard(message: String) -> Dashboard {
    Dashboard {
        connected: false,
        message,
        cpu: SensorMetric {
            label: "CPU",
            value: None,
            unit: "C",
            load: None,
            frequency_mhz: None,
        },
        gpu: SensorMetric {
            label: "GPU",
            value: None,
            unit: "C",
            load: None,
            frequency_mhz: None,
        },
        fans: vec![
            build_fan("CPU Fan", None, None, None),
            build_fan("GPU Fan", None, None, None),
        ],
        power_mode: None,
        system_power_mode: None,
        fan_mode: None,
        fan_control: None,
        passive_cooling: None,
        active_source: None,
        active_profile: None,
        keyboard: KeyboardLocks {
            fn_lock: None,
            super_key_enabled: None,
            touchpad_hotkey_enabled: None,
            touchpad_enabled: read_touchpad_enabled(),
        },
        keyboard_light: None,
        lightbar: LightbarState {
            brightness: None,
            max_brightness: None,
            color: None,
            rainbow: None,
            breathing: None,
            settings: None,
        },
        battery: read_battery_state(),
    }
}

fn start_daemon_client(app: AppHandle) {
    let (request_tx, request_rx) = mpsc::channel();
    if DAEMON_REQUEST_SENDER.set(request_tx).is_err() {
        return;
    }

    thread::spawn(move || {
        while !APP_CLOSING.load(Ordering::Relaxed) {
            match UnixStream::connect(UNIWILLD_SOCKET) {
                Ok(stream) => {
                    if let Err(error) = run_daemon_connection(stream, &request_rx) {
                        emit_daemon_disconnected(&app, error);
                    }
                }
                Err(error) => {
                    reject_queued_requests(&request_rx, error.to_string());
                    emit_daemon_disconnected(&app, error.to_string());
                }
            }

            for _ in 0..10 {
                if APP_CLOSING.load(Ordering::Relaxed) {
                    return;
                }
                thread::sleep(Duration::from_millis(50));
            }
        }
    });
}

fn run_daemon_connection(
    stream: UnixStream,
    request_rx: &Receiver<DaemonRequest>,
) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_millis(20)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(4)))
        .map_err(|error| error.to_string())?;

    let mut writer = stream.try_clone().map_err(|error| error.to_string())?;
    writeln!(writer, "{}", json!({"cmd": "subscribe"})).map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())?;

    let mut reader = BufReader::new(stream);
    let mut in_flight: Option<(DaemonRequest, Instant)> = None;

    while !APP_CLOSING.load(Ordering::Relaxed) {
        if in_flight.is_none() {
            if let Ok(request) = request_rx.try_recv() {
                writeln!(writer, "{}", request.payload).map_err(|error| error.to_string())?;
                writer.flush().map_err(|error| error.to_string())?;
                let deadline = Instant::now() + request.timeout;
                in_flight = Some((request, deadline));
            }
        }

        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => return Err("控制服务连接已关闭".to_string()),
            Ok(_) => {
                let value: Value =
                    serde_json::from_str(&line).map_err(|error| error.to_string())?;
                if value.get("event").and_then(Value::as_str).is_some() {
                    if let Some(snapshot) = value.get("snapshot").cloned() {
                        request_dashboard_refresh(snapshot);
                    }
                    continue;
                }

                let Some((request, _)) = in_flight.take() else {
                    continue;
                };
                let response: UniwillResponse =
                    serde_json::from_value(value).map_err(|error| error.to_string())?;
                let result = if response.ok {
                    Ok(response.data)
                } else {
                    Err(response
                        .message
                        .unwrap_or_else(|| "uniwilld request failed".to_string()))
                };
                let _ = request.reply.send(result);
            }
            Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(error) => return Err(error.to_string()),
        }

        if in_flight
            .as_ref()
            .is_some_and(|(_, deadline)| Instant::now() >= *deadline)
        {
            if let Some((request, _)) = in_flight.take() {
                let _ = request.reply.send(Err("控制服务响应超时".to_string()));
            }
            return Err("控制服务响应超时，正在重新连接".to_string());
        }
    }

    if let Some((request, _)) = in_flight {
        let _ = request
            .reply
            .send(Err("application is closing".to_string()));
    }
    Ok(())
}

fn reject_queued_requests(request_rx: &Receiver<DaemonRequest>, error: String) {
    while let Ok(request) = request_rx.try_recv() {
        let _ = request.reply.send(Err(error.clone()));
    }
}

fn emit_daemon_disconnected(app: &AppHandle, error: String) {
    let dashboard = update_dashboard_state(disconnected_dashboard(error));
    sync_tray_menu(app, &dashboard);
    let _ = app.emit("dashboard-updated", dashboard);
}

fn query_uniwilld(request: Value) -> Result<Value, String> {
    query_uniwilld_with_timeout(request, Duration::from_millis(120), 3)
}

fn query_uniwilld_control(request: Value) -> Result<Value, String> {
    query_uniwilld_with_timeout(request, Duration::from_secs(20), 1)
}

fn query_uniwilld_with_timeout(
    request: Value,
    timeout: Duration,
    max_attempts: u64,
) -> Result<Value, String> {
    let mut last_error = String::new();
    for attempt in 0..max_attempts {
        if APP_CLOSING.load(Ordering::Relaxed) {
            return Err("application is closing".to_string());
        }

        match query_uniwilld_once(request.clone(), timeout) {
            Ok(value) => return Ok(value),
            Err(err) => {
                last_error = err;
                if !is_transient_uniwilld_error(&last_error) {
                    break;
                }
                thread::sleep(Duration::from_millis(20 + attempt * 30));
            }
        }
    }
    Err(last_error)
}

fn query_uniwilld_once(request: Value, timeout: Duration) -> Result<Value, String> {
    if APP_CLOSING.load(Ordering::Relaxed) {
        return Err("application is closing".to_string());
    }

    let sender = DAEMON_REQUEST_SENDER
        .get()
        .ok_or_else(|| "控制服务尚未启动".to_string())?;
    let (reply_tx, reply_rx) = mpsc::sync_channel(1);
    sender
        .send(DaemonRequest {
            payload: request,
            timeout,
            reply: reply_tx,
        })
        .map_err(|_| "控制服务连接已停止".to_string())?;
    reply_rx
        .recv_timeout(timeout + Duration::from_millis(100))
        .map_err(|_| "控制服务响应超时".to_string())?
}

fn is_transient_uniwilld_error(error: &str) -> bool {
    error.contains("Resource temporarily unavailable")
        || error.contains("os error 11")
        || error.contains("WouldBlock")
        || error.contains("TimedOut")
        || error.contains("timed out")
        || error.contains("temporarily unavailable")
        || error.contains("No such file or directory")
        || error.contains("os error 2")
        || error.contains("Connection refused")
        || error.contains("os error 111")
}

fn build_fan(
    label: &'static str,
    pwm: Option<u16>,
    rpm: Option<u32>,
    mode: Option<&str>,
) -> FanMetric {
    let percent = pwm.map(|value| ((value as f64 / 255.0) * 100.0).clamp(0.0, 100.0));
    FanMetric {
        label,
        pwm,
        percent,
        rpm,
        mode: mode.unwrap_or("unknown").to_string(),
    }
}

fn value_as_string(value: Option<&Value>, path: &[&str]) -> Option<String> {
    let mut cursor = value?;
    for key in path {
        cursor = cursor.get(*key)?;
    }
    cursor
        .as_str()
        .map(ToString::to_string)
        .or_else(|| cursor.as_i64().map(|v| v.to_string()))
}

fn value_as_f64(value: Option<&Value>, path: &[&str]) -> Option<f64> {
    value_as_string(value, path).and_then(|text| text.trim().parse::<f64>().ok())
}

fn value_as_u16(value: Option<&Value>, path: &[&str]) -> Option<u16> {
    value_as_string(value, path).and_then(|text| text.trim().parse::<u16>().ok())
}

fn value_as_u8(value: Option<&Value>, path: &[&str]) -> Option<u8> {
    value_as_string(value, path).and_then(|text| text.trim().parse::<u8>().ok())
}

fn value_as_u32(value: Option<&Value>, path: &[&str]) -> Option<u32> {
    value_as_string(value, path).and_then(|text| text.trim().parse::<u32>().ok())
}

fn value_as_bool(value: Option<&Value>, path: &[&str]) -> Option<bool> {
    let mut cursor = value?;
    for key in path {
        cursor = cursor.get(*key)?;
    }
    if let Some(value) = cursor.as_bool() {
        return Some(value);
    }
    if let Some(value) = cursor.as_i64() {
        return Some(value != 0);
    }
    cursor.as_str().and_then(parse_boolish)
}

fn parse_boolish(text: &str) -> Option<bool> {
    match text.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "on" | "enable" | "enabled" | "yes" | "locked" => Some(true),
        "0" | "false" | "off" | "disable" | "disabled" | "no" | "unlocked" => Some(false),
        _ => None,
    }
}

fn battery_from_uniwill_response(value: Option<&Value>) -> Option<BatteryState> {
    let value = value?;
    if let Some(batteries) = value.get("batteries").and_then(Value::as_array) {
        return batteries
            .iter()
            .find(|battery| value_as_string(Some(*battery), &["name"]).as_deref() == Some("BAT0"))
            .and_then(|battery| battery_from_uniwill(Some(battery)))
            .or_else(|| {
                batteries
                    .iter()
                    .find_map(|battery| battery_from_uniwill(Some(battery)))
            });
    }
    if let Some(battery) = value.get("battery") {
        return battery_from_uniwill(Some(battery));
    }
    battery_from_uniwill(Some(value))
}

fn battery_from_uniwill(value: Option<&Value>) -> Option<BatteryState> {
    let status = value_as_string(value, &["status"])
        .or_else(|| value_as_string(value, &["state"]))
        .or_else(|| value_as_string(value, &["charging_state"]));
    let charging = value_as_bool(value, &["charging"]).or_else(|| {
        status.as_ref().map(|text| {
            let value = text.to_ascii_lowercase();
            value == "charging"
        })
    });
    let battery = BatteryState {
        capacity: value_as_u8(value, &["capacity"])
            .or_else(|| value_as_u8(value, &["capacity_percent"]))
            .or_else(|| value_as_u8(value, &["percent"])),
        health: normalize_health_text(
            value_as_string(value, &["health"])
                .or_else(|| value_as_string(value, &["health_percent"]))
                .or_else(|| value_as_string(value, &["life"])),
        ),
        status,
        charging,
        cycle_count: value_as_u32(value, &["cycle_count"]),
        charge_limit: value_as_u8(value, &["charge_control_end_threshold"])
            .or_else(|| value_as_u8(value, &["charge_limit"]))
            .or_else(|| value_as_u8(value, &["threshold"])),
    };

    if battery.capacity.is_some()
        || battery.health.is_some()
        || battery.status.is_some()
        || battery.charging.is_some()
        || battery.cycle_count.is_some()
        || battery.charge_limit.is_some()
    {
        Some(battery)
    } else {
        None
    }
}

fn merge_battery_state(primary: Option<BatteryState>, fallback: BatteryState) -> BatteryState {
    let Some(primary) = primary else {
        return fallback;
    };
    BatteryState {
        capacity: primary.capacity.or(fallback.capacity),
        health: primary.health.or(fallback.health),
        status: primary.status.or(fallback.status),
        charging: primary.charging.or(fallback.charging),
        cycle_count: primary.cycle_count.or(fallback.cycle_count),
        charge_limit: primary.charge_limit.or(fallback.charge_limit),
    }
}

fn normalize_health_text(value: Option<String>) -> Option<String> {
    value.map(|text| {
        let trimmed = text.trim();
        if trimmed.parse::<u8>().is_ok() {
            format!("{trimmed}%")
        } else {
            trimmed.to_string()
        }
    })
}

fn read_system_information() -> SystemInformation {
    let cpuinfo = fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
    let processor = cpuinfo.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        (key.trim() == "model name").then(|| value.trim().to_string())
    });
    let physical_cores = cpuinfo.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        (key.trim() == "cpu cores")
            .then(|| value.trim().parse::<u32>().ok())
            .flatten()
    });
    let logical_processors = u32::try_from(
        cpuinfo
            .lines()
            .filter(|line| {
                line.split_once(':')
                    .is_some_and(|(key, _)| key.trim() == "processor")
            })
            .count(),
    )
    .ok()
    .filter(|count| *count > 0);
    let memory_bytes = fs::read_to_string("/proc/meminfo").ok().and_then(|text| {
        text.lines().find_map(|line| {
            let value = line.strip_prefix("MemTotal:")?;
            value
                .split_whitespace()
                .next()?
                .parse::<u64>()
                .ok()
                .map(|kb| kb * 1024)
        })
    });
    let kernel = read_trimmed_file(Path::new("/proc/sys/kernel/osrelease"));

    SystemInformation {
        manufacturer: read_dmi_value("sys_vendor"),
        model: read_dmi_value("product_name"),
        product_version: read_dmi_value("product_version"),
        sku: read_dmi_value("product_sku"),
        serial_number: read_dmi_value("product_serial"),
        bios_vendor: read_dmi_value("bios_vendor"),
        bios_version: read_dmi_value("bios_version"),
        bios_date: read_dmi_value("bios_date"),
        board_vendor: read_dmi_value("board_vendor"),
        board_name: read_dmi_value("board_name"),
        board_version: read_dmi_value("board_version"),
        processor,
        physical_cores,
        logical_processors,
        memory_bytes,
        memory_slots: None,
        memory_devices: Vec::new(),
        operating_system: read_os_pretty_name(),
        kernel,
        architecture: std::env::consts::ARCH.to_string(),
    }
}

fn normalize_optional_device_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            normalize_device_text(trimmed.to_string())
        }
    })
}

fn normalize_memory_device(mut device: MemoryDeviceInformation) -> MemoryDeviceInformation {
    device.locator = normalize_optional_device_text(device.locator);
    device.bank_locator = normalize_optional_device_text(device.bank_locator);
    device.manufacturer = normalize_optional_device_text(device.manufacturer);
    device.serial_number = normalize_optional_device_text(device.serial_number);
    device.part_number = normalize_optional_device_text(device.part_number);
    device.memory_type = normalize_optional_device_text(device.memory_type);
    device.form_factor = normalize_optional_device_text(device.form_factor);
    device.speed_mt_s = device.speed_mt_s.filter(|value| *value > 0);
    device.configured_speed_mt_s = device.configured_speed_mt_s.filter(|value| *value > 0);
    device
}

fn merge_service_storage_details(
    storage: &mut [StorageDeviceInformation],
    details: Vec<ServiceStorageDetail>,
) {
    for detail in details {
        let Some(device) = storage.iter_mut().find(|device| device.name == detail.name) else {
            continue;
        };

        if let Some(value) = normalize_optional_device_text(detail.model) {
            device.model = Some(value);
        }
        if let Some(value) = normalize_optional_device_text(detail.serial_number) {
            device.serial_number = Some(value);
        }
        if let Some(value) = normalize_optional_device_text(detail.firmware) {
            device.firmware = Some(value);
        }
        if let Some(value) = normalize_optional_device_text(detail.protocol) {
            device.transport = value;
        }
        device.available_bytes = detail
            .available_bytes
            .map(|value| value.min(device.size_bytes));
        device.available_percent = detail.available_percent.filter(|value| *value <= 100);
        device.smart_available = detail.available;
        device.smart_passed = detail.smart_passed;
        device.health_percent = detail.health_percent;
        device.percentage_used = detail.percentage_used;
        device.available_spare_percent = detail.available_spare_percent;
        device.temperature_c = detail.temperature_c.filter(|value| *value >= 0);
        device.power_on_hours = detail.power_on_hours;
        device.power_cycles = detail.power_cycles;
        device.unsafe_shutdowns = detail.unsafe_shutdowns;
        device.media_errors = detail.media_errors;
        device.total_bytes_written = detail.total_bytes_written;
    }
}

fn read_dmi_value(name: &str) -> Option<String> {
    let path = Path::new("/sys/class/dmi/id").join(name);
    read_trimmed_file(&path).and_then(normalize_device_text)
}

fn normalize_device_text(value: String) -> Option<String> {
    let lowered = value.to_ascii_lowercase();
    if lowered == "default string"
        || lowered == "to be filled by o.e.m."
        || lowered == "not specified"
        || lowered == "unknown"
        || lowered == "none"
    {
        None
    } else {
        Some(value)
    }
}

fn read_os_pretty_name() -> Option<String> {
    let os_release = fs::read_to_string("/etc/os-release").ok()?;
    os_release.lines().find_map(|line| {
        let value = line.strip_prefix("PRETTY_NAME=")?;
        Some(value.trim_matches('"').replace("\\\"", "\""))
    })
}

fn read_storage_devices() -> Vec<StorageDeviceInformation> {
    let Ok(entries) = fs::read_dir("/sys/class/block") else {
        return Vec::new();
    };
    let mut devices = Vec::new();

    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.join("partition").exists()
            || !path.join("device").exists()
            || name.starts_with("loop")
            || name.starts_with("ram")
            || name.starts_with("zram")
            || name.starts_with("dm-")
        {
            continue;
        }

        let sectors = read_trimmed_file(&path.join("size"))
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        if sectors == 0 {
            continue;
        }
        let rotational =
            read_trimmed_file(&path.join("queue/rotational")).is_some_and(|value| value == "1");
        let removable =
            read_trimmed_file(&path.join("removable")).is_some_and(|value| value == "1");
        let transport = storage_transport(&name, &path, rotational);
        let size_bytes = sectors.saturating_mul(512);
        devices.push(StorageDeviceInformation {
            name,
            model: read_trimmed_file(&path.join("device/model")).and_then(normalize_device_text),
            vendor: read_trimmed_file(&path.join("device/vendor")).and_then(normalize_device_text),
            serial_number: read_trimmed_file(&path.join("device/serial"))
                .and_then(normalize_device_text),
            firmware: read_trimmed_file(&path.join("device/firmware_rev"))
                .or_else(|| read_trimmed_file(&path.join("device/rev")))
                .and_then(normalize_device_text),
            size_bytes,
            available_bytes: None,
            available_percent: None,
            transport,
            rotational,
            removable,
            smart_available: false,
            smart_passed: None,
            health_percent: None,
            percentage_used: None,
            available_spare_percent: None,
            temperature_c: None,
            power_on_hours: None,
            power_cycles: None,
            unsafe_shutdowns: None,
            media_errors: None,
            total_bytes_written: None,
        });
    }

    devices.sort_by(|left, right| left.name.cmp(&right.name));
    devices
}

fn storage_transport(name: &str, path: &Path, rotational: bool) -> String {
    if name.starts_with("nvme") {
        return "NVMe".to_string();
    }
    if name.starts_with("mmcblk") {
        return "eMMC / SD".to_string();
    }
    let device_path = fs::canonicalize(path.join("device"))
        .ok()
        .map(|path| path.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if device_path.contains("/usb") {
        "USB".to_string()
    } else if rotational {
        "SATA HDD".to_string()
    } else {
        "SSD".to_string()
    }
}

fn read_battery_information() -> Vec<BatteryInformation> {
    let Ok(entries) = fs::read_dir("/sys/class/power_supply") else {
        return Vec::new();
    };
    let mut batteries = Vec::new();

    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if read_power_supply_text(&path, "type").as_deref() != Some("Battery") {
            continue;
        }

        let energy_full = read_power_supply_number(&path, "energy_full");
        let energy_design = read_power_supply_number(&path, "energy_full_design");
        let charge_full = read_power_supply_number(&path, "charge_full");
        let charge_design = read_power_supply_number(&path, "charge_full_design");
        let (full_capacity, design_capacity, capacity_unit) =
            if energy_full.is_some() || energy_design.is_some() {
                (energy_full, energy_design, Some("uWh".to_string()))
            } else if charge_full.is_some() || charge_design.is_some() {
                (charge_full, charge_design, Some("uAh".to_string()))
            } else {
                (None, None, None)
            };

        /*
         * Desktop peripherals also register power_supply devices. Keep the
         * built-in pack (BAT*) or battery records which expose design data.
         */
        if !name.starts_with("BAT") && design_capacity.is_none() {
            continue;
        }
        let health_percent = match (full_capacity, design_capacity) {
            (Some(full), Some(design)) if design > 0 => Some(
                ((full as f64 / design as f64) * 100.0)
                    .round()
                    .clamp(0.0, 100.0) as u8,
            ),
            _ => None,
        };

        batteries.push(BatteryInformation {
            name,
            manufacturer: read_power_supply_text(&path, "manufacturer"),
            model_name: read_power_supply_text(&path, "model_name"),
            serial_number: read_power_supply_text(&path, "serial_number"),
            technology: read_power_supply_text(&path, "technology"),
            cycle_count: read_power_supply_number(&path, "cycle_count")
                .and_then(|value| u32::try_from(value).ok()),
            full_capacity,
            design_capacity,
            capacity_unit,
            health_percent,
            design_voltage_uv: read_power_supply_number(&path, "voltage_min_design"),
        });
    }

    batteries.sort_by(|left, right| left.name.cmp(&right.name));
    batteries
}

fn read_trimmed_file(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_battery_state() -> BatteryState {
    let battery_dir = fs::read_dir("/sys/class/power_supply")
        .ok()
        .and_then(|entries| {
            entries.filter_map(Result::ok).find_map(|entry| {
                let ty = fs::read_to_string(entry.path().join("type")).ok()?;
                if ty.trim() == "Battery" {
                    Some(entry.path())
                } else {
                    None
                }
            })
        });

    let Some(path) = battery_dir else {
        return BatteryState {
            capacity: None,
            health: None,
            status: None,
            charging: None,
            cycle_count: None,
            charge_limit: None,
        };
    };

    let capacity =
        read_power_supply_number(&path, "capacity").and_then(|value| u8::try_from(value).ok());
    let status = read_power_supply_text(&path, "status");
    let charging = status.as_ref().map(|text| {
        let value = text.to_ascii_lowercase();
        value == "charging"
    });
    let health = read_battery_health_percent(&path).map(|value| format!("{value}%"));
    let cycle_count =
        read_power_supply_number(&path, "cycle_count").and_then(|value| u32::try_from(value).ok());
    let charge_limit = read_power_supply_number(&path, "charge_control_end_threshold")
        .and_then(|value| u8::try_from(value).ok());

    BatteryState {
        capacity,
        health,
        status,
        charging,
        cycle_count,
        charge_limit,
    }
}

fn read_battery_health_percent(path: &Path) -> Option<u8> {
    let full = read_power_supply_number(path, "energy_full")
        .or_else(|| read_power_supply_number(path, "charge_full"))?;
    let design = read_power_supply_number(path, "energy_full_design")
        .or_else(|| read_power_supply_number(path, "charge_full_design"))?;
    if design == 0 {
        return None;
    }
    let percent = ((full as f64 / design as f64) * 100.0)
        .round()
        .clamp(0.0, 100.0) as u8;
    Some(percent)
}

fn read_power_supply_text(path: &Path, name: &str) -> Option<String> {
    fs::read_to_string(path.join(name))
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn read_power_supply_number(path: &Path, name: &str) -> Option<u64> {
    read_power_supply_text(path, name).and_then(|text| text.parse::<u64>().ok())
}

fn read_cpu_frequency_mhz() -> Option<u64> {
    fs::read_to_string("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|khz| khz / 1000)
}

fn read_cpu_load() -> Option<f64> {
    let stat = fs::read_to_string("/proc/stat").ok()?;
    let cpu = stat.lines().next()?;
    let parts = cpu.split_whitespace().skip(1);
    let values: Vec<u64> = parts.filter_map(|part| part.parse::<u64>().ok()).collect();
    if values.len() < 5 {
        return None;
    }
    let idle = values.get(3)? + values.get(4).copied().unwrap_or(0);
    let total: u64 = values.iter().sum();
    if total == 0 {
        return None;
    }
    Some(((total - idle) as f64 / total as f64 * 100.0).clamp(0.0, 100.0))
}

fn read_gsettings_dark_mode() -> Option<bool> {
    let color_scheme = read_gsettings_value("org.gnome.desktop.interface", "color-scheme")?;
    if let Some(is_dark) = parse_gsettings_color_scheme(&color_scheme) {
        return Some(is_dark);
    }

    let gtk_theme = read_gsettings_value("org.gnome.desktop.interface", "gtk-theme")
        .unwrap_or_default()
        .to_ascii_lowercase();
    Some(gtk_theme.contains("dark"))
}

fn read_touchpad_enabled() -> Option<bool> {
    read_kwin_touchpad_enabled()
        .or_else(read_touchpad_enabled_from_sysfs)
        .or_else(read_gnome_touchpad_enabled)
}

fn set_desktop_touchpad_enabled(enabled: bool) -> Result<bool, String> {
    if read_kwin_touchpad_enabled().is_some() {
        return set_kwin_touchpad_enabled(enabled);
    }
    if read_gnome_touchpad_enabled().is_some() {
        return set_gnome_touchpad_enabled(enabled);
    }
    Err("当前桌面环境不支持触摸板开关".to_string())
}

fn set_kwin_touchpad_enabled(enabled: bool) -> Result<bool, String> {
    let event_names = touchpad_event_names();
    if event_names.is_empty() {
        return Err("未找到触摸板输入设备".to_string());
    }

    let connection = gio::bus_get_sync(gio::BusType::Session, gio::Cancellable::NONE)
        .map_err(|error| format!("无法连接 KDE 会话总线：{error}"))?;
    let mut changed = 0usize;
    let mut last_error = None;

    for event_name in &event_names {
        let object_path = format!("/org/kde/KWin/InputDevice/{event_name}");
        let parameters = kwin_touchpad_enabled_parameters(enabled);
        match connection.call_sync(
            Some("org.kde.KWin"),
            &object_path,
            "org.freedesktop.DBus.Properties",
            "Set",
            Some(&parameters),
            None,
            gio::DBusCallFlags::NONE,
            500,
            gio::Cancellable::NONE,
        ) {
            Ok(_) => changed += 1,
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    if changed == 0 {
        return Err(format!(
            "KDE 未接受触摸板设置：{}",
            last_error.unwrap_or_else(|| "未知错误".to_string())
        ));
    }

    let confirmed =
        read_kwin_touchpad_enabled().ok_or_else(|| "无法确认 KDE 触摸板状态".to_string())?;
    if confirmed != enabled {
        return Err("KDE 返回的触摸板状态与设置不一致".to_string());
    }
    Ok(confirmed)
}

fn kwin_touchpad_enabled_parameters(enabled: bool) -> gio::glib::Variant {
    ("org.kde.KWin.InputDevice", "enabled", enabled.to_variant()).to_variant()
}

fn set_gnome_touchpad_enabled(enabled: bool) -> Result<bool, String> {
    let source = gio::SettingsSchemaSource::default()
        .ok_or_else(|| "无法读取 GNOME 设置架构".to_string())?;
    let schema = source
        .lookup("org.gnome.desktop.peripherals.touchpad", true)
        .ok_or_else(|| "当前系统缺少 GNOME 触摸板设置".to_string())?;
    let settings = gio::Settings::new_full(&schema, gio::SettingsBackend::NONE, None);
    settings
        .set_string("send-events", if enabled { "enabled" } else { "disabled" })
        .map_err(|error| format!("GNOME 未接受触摸板设置：{error}"))?;
    gio::Settings::sync();

    let confirmed =
        read_gnome_touchpad_enabled().ok_or_else(|| "无法确认 GNOME 触摸板状态".to_string())?;
    if confirmed != enabled {
        return Err("GNOME 返回的触摸板状态与设置不一致".to_string());
    }
    Ok(confirmed)
}

fn read_kwin_touchpad_enabled() -> Option<bool> {
    let event_names = touchpad_event_names();
    if event_names.is_empty() {
        return None;
    }

    let connection = gio::bus_get_sync(gio::BusType::Session, gio::Cancellable::NONE).ok()?;
    let mut found = false;
    let mut any_enabled = false;

    for event_name in event_names {
        let object_path = format!("/org/kde/KWin/InputDevice/{event_name}");
        let parameters = ("org.kde.KWin.InputDevice", "enabled").to_variant();
        let reply = connection
            .call_sync(
                Some("org.kde.KWin"),
                &object_path,
                "org.freedesktop.DBus.Properties",
                "Get",
                Some(&parameters),
                None,
                gio::DBusCallFlags::NONE,
                150,
                gio::Cancellable::NONE,
            )
            .ok();
        let enabled = reply
            .as_ref()
            .and_then(|value| value.try_child_value(0))
            .and_then(|value| value.as_variant())
            .and_then(|value| value.get::<bool>());
        if let Some(enabled) = enabled {
            found = true;
            any_enabled |= enabled;
        }
    }

    found.then_some(any_enabled)
}

fn touchpad_event_names() -> Vec<String> {
    let Ok(entries) = fs::read_dir("/sys/class/input") else {
        return Vec::new();
    };
    let mut event_names = Vec::new();

    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let Some(name) = fs::read_to_string(path.join("name")).ok() else {
            continue;
        };
        if !is_touchpad_name(&name) {
            continue;
        }
        let Ok(children) = fs::read_dir(path) else {
            continue;
        };
        event_names.extend(children.filter_map(Result::ok).filter_map(|child| {
            let name = child.file_name();
            let name = name.to_str()?;
            name.starts_with("event").then(|| name.to_string())
        }));
    }

    event_names
}

fn read_touchpad_enabled_from_sysfs() -> Option<bool> {
    let entries = fs::read_dir("/sys/class/input").ok()?;
    let states: Vec<bool> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| read_touchpad_sysfs_state(&entry.path()))
        .collect();

    (!states.is_empty()).then(|| states.into_iter().any(|enabled| enabled))
}

fn read_touchpad_sysfs_state(path: &Path) -> Option<bool> {
    let name = fs::read_to_string(path.join("name")).ok()?;
    if !is_touchpad_name(&name) {
        return None;
    }
    let inhibited = fs::read_to_string(path.join("inhibited")).ok()?;
    parse_input_inhibited(&inhibited)
}

fn is_touchpad_name(name: &str) -> bool {
    name.to_ascii_lowercase().contains("touchpad")
}

fn parse_input_inhibited(value: &str) -> Option<bool> {
    match value.trim() {
        "0" => Some(true),
        "1" => Some(false),
        _ => None,
    }
}

fn read_gnome_touchpad_enabled() -> Option<bool> {
    let send_events =
        read_gsettings_value("org.gnome.desktop.peripherals.touchpad", "send-events")?;

    match send_events.trim().to_ascii_lowercase().as_str() {
        "enabled" | "disabled-on-external-mouse" => Some(true),
        "disabled" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        dashboard_from_snapshot, first_charge_control_battery, is_touchpad_name,
        kwin_touchpad_enabled_parameters,
        merge_dashboard_snapshot, parse_input_inhibited, read_battery_information,
        read_storage_devices, read_system_information, supported_ui_language, tray_text,
        validate_curve, CurvePointInput,
    };
    use serde_json::{json, Value};

    fn curve(last_temp: u16, last_pwm: u16) -> Vec<CurvePointInput> {
        vec![
            CurvePointInput { temp: 30, pwm: 0 },
            CurvePointInput {
                temp: last_temp,
                pwm: last_pwm,
            },
        ]
    }

    #[test]
    fn selects_internal_charge_control_battery_after_peripheral_battery() {
        let response = json!({"batteries": [
            {"name": "hidpp_battery_0", "charge_control_end_threshold": null},
            {"name": "BAT0", "charge_control_end_threshold": 80}
        ]});
        let selected = first_charge_control_battery(&response).unwrap();
        assert_eq!(selected.name, "BAT0");
        assert_eq!(selected.threshold, 80);
    }

    #[test]
    fn accepts_curve_with_full_speed_failsafe() {
        assert!(validate_curve("CPU", &curve(100, 255)).is_ok());
    }

    #[test]
    fn rejects_curve_without_full_speed_failsafe() {
        let error = validate_curve("GPU", &curve(100, 230)).unwrap_err();
        assert!(error.contains("GPU"));
        assert!(error.contains("100%"));
    }

    #[test]
    fn rejects_curve_with_late_failsafe() {
        let error = validate_curve("CPU", &curve(110, 255)).unwrap_err();
        assert!(error.contains("CPU"));
        assert!(error.contains("100°C"));
    }

    #[test]
    fn parses_input_inhibition_as_enabled_state() {
        assert_eq!(parse_input_inhibited("0\n"), Some(true));
        assert_eq!(parse_input_inhibited("1\n"), Some(false));
        assert_eq!(parse_input_inhibited("unknown"), None);
    }

    #[test]
    fn identifies_touchpad_input_names() {
        assert!(is_touchpad_name("UNIW0001:00 093A:0255 Touchpad\n"));
        assert!(!is_touchpad_name("UNIW0001:00 093A:0255 Mouse\n"));
    }

    #[test]
    fn builds_kwin_touchpad_property_set_parameters() {
        let parameters = kwin_touchpad_enabled_parameters(false);
        assert_eq!(parameters.type_().as_str(), "(ssv)");
    }

    #[test]
    fn maps_supported_user_locales_and_language_lists() {
        assert_eq!(supported_ui_language("zh_CN.UTF-8"), Some("zh-CN"));
        assert_eq!(supported_ui_language("en_US.UTF-8"), Some("en"));
        assert_eq!(supported_ui_language("fr-FR"), Some("fr"));
        assert_eq!(supported_ui_language("de_DE@euro"), Some("de"));
        assert_eq!(supported_ui_language("ja_JP:de_DE:en_US"), Some("de"));
        assert_eq!(supported_ui_language("C"), None);
    }

    #[test]
    fn translates_overall_power_mode_for_every_language() {
        assert_eq!(tray_text("zh-CN", "power_menu"), "整体电源模式");
        assert_eq!(tray_text("en", "power_menu"), "Overall Power Mode");
        assert_eq!(tray_text("fr", "power_menu"), "Mode d’alimentation global");
        assert_eq!(tray_text("de", "power_menu"), "Globaler Energiemodus");
    }

    #[test]
    fn reads_only_static_physical_device_information() {
        let system = read_system_information();
        assert!(!system.architecture.is_empty());

        for disk in read_storage_devices() {
            assert!(disk.size_bytes > 0);
            assert!(!disk.name.starts_with("loop"));
            assert!(!disk.name.starts_with("zram"));
            if let Some(percent) = disk.available_percent {
                assert!(percent <= 100);
            }
            if let Some(available) = disk.available_bytes {
                assert!(available <= disk.size_bytes);
            }
        }

        for battery in read_battery_information() {
            assert!(battery.name.starts_with("BAT") || battery.design_capacity.is_some());
        }
    }

    #[test]
    fn builds_dashboard_from_atomic_service_snapshot() {
        let snapshot = json!({
            "temp1_input": 52000,
            "temp2_input": 47000,
            "fan1_input": 2300,
            "fan2_input": 2100,
            "pwm1": 96,
            "pwm2": 80,
            "power_mode": "performance",
            "system_power_mode": "performance",
            "fan_mode": "standard",
            "fan_control": "auto",
            "passive_cooling": true,
            "active_profile": 1,
            "active_source": "ac",
            "fn_lock": true,
            "super_key_enabled": false,
            "touchpad_hotkey_enabled": true,
            "keyboard_backlight": {
                "available": true,
                "global_enabled": true,
                "active_source": "ac",
                "sources": {
                    "ac": {
                        "enabled": true,
                        "brightness": 50,
                        "red": 120,
                        "green": 60,
                        "blue": 255,
                        "effect": "aurora",
                        "speed": 3,
                        "direction": "left",
                        "reactive": true
                    }
                }
            },
            "lightbar": {
                "brightness": 160,
                "max_brightness": 200,
                "multi_intensity": "255 80 0",
                "rainbow": true,
                "breathing": false,
                "settings": {
                    "global_enabled": true,
                    "active_source": "ac",
                    "sources": {
                        "ac": {
                            "enabled": true,
                            "brightness": 160,
                            "red": 255,
                            "green": 80,
                            "blue": 0,
                            "rainbow": true,
                            "breathing": false
                        },
                        "battery": {
                            "enabled": false,
                            "brightness": 96,
                            "red": 80,
                            "green": 150,
                            "blue": 255,
                            "rainbow": false,
                            "breathing": true
                        }
                    }
                }
            },
            "batteries": []
        });
        let dashboard = dashboard_from_snapshot(&snapshot);

        assert_eq!(dashboard.cpu.value, Some(52.0));
        assert_eq!(dashboard.fans[0].rpm, Some(2300));
        assert_eq!(dashboard.power_mode.as_deref(), Some("performance"));
        assert_eq!(dashboard.active_profile, Some(1));
        assert_eq!(dashboard.lightbar.rainbow, Some(true));
        assert_eq!(
            dashboard
                .keyboard_light
                .as_ref()
                .and_then(|settings| settings.get("sources"))
                .and_then(|sources| sources.get("ac"))
                .and_then(|ac| ac.get("effect"))
                .and_then(Value::as_str),
            Some("aurora")
        );
        assert_eq!(
            dashboard
                .lightbar
                .settings
                .as_ref()
                .and_then(|settings| settings.get("sources"))
                .and_then(|sources| sources.get("battery"))
                .and_then(|battery| battery.get("breathing"))
                .and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn missing_snapshot_fields_do_not_clear_valid_state() {
        let previous = dashboard_from_snapshot(&json!({
            "temp1_input": 52000,
            "fan1_input": 2300,
            "power_mode": "balanced",
            "active_profile": 2,
            "active_source": "ac",
            "lightbar": {
                "brightness": 120,
                "settings": {
                    "global_enabled": true,
                    "active_source": "ac",
                    "sources": {
                        "ac": {
                            "enabled": true,
                            "brightness": 120,
                            "red": 255,
                            "green": 80,
                            "blue": 0,
                            "rainbow": false,
                            "breathing": false
                        }
                    }
                }
            },
            "batteries": []
        }));
        let next = dashboard_from_snapshot(&json!({
            "temp1_input": null,
            "fan1_input": null,
            "power_mode": "performance",
            "active_profile": 2,
            "active_source": "ac",
            "lightbar": {"brightness": null},
            "batteries": []
        }));
        let merged = merge_dashboard_snapshot(next, &previous);

        assert_eq!(merged.cpu.value, Some(52.0));
        assert_eq!(merged.fans[0].rpm, Some(2300));
        assert_eq!(merged.lightbar.brightness, Some(120));
        assert!(merged.lightbar.settings.is_some());
        assert_eq!(merged.power_mode.as_deref(), Some("performance"));
    }
}

fn parse_gsettings_color_scheme(value: &str) -> Option<bool> {
    let value = value.to_ascii_lowercase();
    if value.contains("prefer-dark") {
        return Some(true);
    }
    if value.contains("prefer-light") || value.contains("default") {
        return Some(false);
    }
    None
}

fn read_gsettings_value(schema: &str, key: &str) -> Option<String> {
    let settings = gio::Settings::new(schema);
    Some(settings.string(key).to_string())
}

pub fn run() {
    if std::env::args_os().any(|argument| argument == "--version" || argument == "-V") {
        println!("nuc-x15-controller {}", env!("NUC_FULL_VERSION"));
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !args.iter().any(|argument| argument == "--hidden") {
                show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            setup_tray(app)?;
            start_dashboard_worker(app.handle().clone());
            start_daemon_client(app.handle().clone());
            let hidden_start = std::env::args_os().any(|argument| argument == "--hidden");
            if !hidden_start {
                show_main_window(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            get_system_dark_mode,
            get_autostart_enabled,
            set_autostart_enabled,
            set_ui_language,
            get_system_language,
            get_application_version,
            get_battery_charge_limit,
            set_battery_charge_limit,
            get_device_information,
            apply_fan_settings,
            set_fan_mode,
            set_passive_cooling,
            get_persisted_fan_profiles,
            get_lightbar_settings,
            apply_lightbar_settings,
            get_keyboard_light_settings,
            apply_keyboard_light_settings,
            set_fn_lock,
            set_win_key_enabled,
            set_touchpad_enabled,
            get_power_profiles,
            set_power_profile_power_mode,
            set_power_profile_fan_mode,
            activate_power_profile
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !APP_CLOSING.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
