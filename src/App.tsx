import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Card } from "@heroui/react";
import ApexCharts, { type ApexOptions } from "apexcharts";
import {
  Activity,
  Battery,
  BatteryCharging,
  BatteryMedium,
  Check,
  ChevronDown,
  CircleGauge,
  Cpu,
  Gauge,
  HardDrive,
  Keyboard,
  Languages,
  LayoutDashboard,
  Leaf,
  Lightbulb,
  Maximize2,
  MemoryStick,
  Minimize2,
  Monitor,
  Moon,
  Palette,
  PlugZap,
  Power,
  RotateCcw,
  Rocket,
  Save,
  Server,
  Settings,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Sun,
  Thermometer,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import brandIcon from "../src-tauri/icons/icon.svg";
import {
  hasSavedLanguagePreference,
  languageOptions,
  type Language,
  useI18n,
} from "./i18n";

type Translator = ReturnType<typeof useI18n>["t"];

type SensorMetric = {
  label: string;
  value: number | null;
  unit: string;
  load: number | null;
  frequency_mhz: number | null;
  /** PCI power state of the dGPU, e.g. "D0" or "D3cold". */
  power_state?: string | null;
  /** false while the dGPU is runtime-suspended. */
  active?: boolean | null;
};

type FanMetric = {
  label: string;
  pwm: number | null;
  percent: number | null;
  rpm: number | null;
  mode: string;
};

type Dashboard = {
  connected: boolean;
  message: string;
  cpu: SensorMetric;
  gpu: SensorMetric;
  fans: FanMetric[];
  power_mode: string | null;
  system_power_mode: string | null;
  fan_mode: string | null;
  fan_control: string | null;
  passive_cooling: boolean | null;
  active_source: string | null;
  active_profile: number | null;
  keyboard: KeyboardLocks;
  keyboard_light: KeyboardLightSettingsState | null;
  lightbar: LightbarState;
  battery: BatteryState;
};

type KeyboardLocks = {
  fn_lock: boolean | null;
  super_key_enabled: boolean | null;
  touchpad_hotkey_enabled: boolean | null;
  touchpad_enabled: boolean | null;
};

type LightbarState = {
  brightness: number | null;
  max_brightness: number | null;
  color: string | null;
  rainbow: boolean | null;
  breathing: boolean | null;
  settings: LightbarSettingsState | null;
};

type BatteryState = {
  capacity: number | null;
  health: string | null;
  status: string | null;
  charging: boolean | null;
  cycle_count: number | null;
  charge_limit: number | null;
};

type BatteryChargeLimit = { name: string; threshold: number };
type ChargeMode = "full" | "health" | "custom";

type ThemeMode = "auto" | "dark" | "light";
type PowerSource = "ac" | "battery";
type FanKind = "cpu" | "gpu";
type StrategyKey = "passive" | "whisper" | "benchmark";
type FanCurvePoint = { temp: number; duty: number };
type FanProfile = {
  cpu: FanCurvePoint[];
  gpu: FanCurvePoint[];
  passive: boolean;
  whisper: boolean;
  benchmark: boolean;
};
type FanProfiles = Record<PowerSource, FanProfile>;
type PowerLevel = "performance" | "balanced" | "battery_saver";
type FanLevel = "performance" | "standard" | "quiet";
type PowerProfileBranch = {
  power_mode: number;
  power_mode_name: PowerLevel;
  fan_mode: number;
  fan_mode_name: FanLevel;
};
type PowerProfileSlot = {
  profile: number;
  name: PowerLevel;
  ac: PowerProfileBranch;
  battery: PowerProfileBranch;
};
type PowerProfilesState = {
  active_profile: number;
  active_profile_name: PowerLevel;
  active_source: string;
  profiles: PowerProfileSlot[];
};
type LightbarProfile = {
  enabled: boolean;
  brightness: number;
  red: number;
  green: number;
  blue: number;
  rainbow: boolean;
  breathing: boolean;
};
type LightbarSettingsState = {
  global_enabled: boolean;
  active_source: string;
  sources: Record<PowerSource, LightbarProfile>;
};
type KeyboardEffect =
  | "solid"
  | "breathing"
  | "wave"
  | "random"
  | "rainbow"
  | "ripple"
  | "marquee"
  | "raindrop"
  | "aurora"
  | "fireworks";
type KeyboardDirection = "left" | "right" | "up" | "down";
type KeyboardLightProfile = {
  enabled: boolean;
  brightness: number;
  red: number;
  green: number;
  blue: number;
  effect: KeyboardEffect;
  speed: number;
  direction: KeyboardDirection;
  reactive: boolean;
};
type KeyboardLightSettingsState = {
  available: boolean;
  global_enabled: boolean;
  active_source: string;
  sources: Record<PowerSource, KeyboardLightProfile>;
};
type SystemInformation = {
  manufacturer: string | null;
  model: string | null;
  product_version: string | null;
  sku: string | null;
  serial_number: string | null;
  bios_vendor: string | null;
  bios_version: string | null;
  bios_date: string | null;
  board_vendor: string | null;
  board_name: string | null;
  board_version: string | null;
  processor: string | null;
  physical_cores: number | null;
  logical_processors: number | null;
  memory_bytes: number | null;
  memory_slots: number | null;
  memory_devices: MemoryDeviceInformation[];
  operating_system: string | null;
  kernel: string | null;
  architecture: string;
};
type MemoryDeviceInformation = {
  locator: string | null;
  bank_locator: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  part_number: string | null;
  memory_type: string | null;
  form_factor: string | null;
  size_bytes: number;
  speed_mt_s: number | null;
  configured_speed_mt_s: number | null;
};
type StorageDeviceInformation = {
  name: string;
  model: string | null;
  vendor: string | null;
  serial_number: string | null;
  firmware: string | null;
  size_bytes: number;
  available_bytes: number | null;
  available_percent: number | null;
  transport: string;
  rotational: boolean;
  removable: boolean;
  smart_available: boolean;
  smart_passed: boolean | null;
  health_percent: number | null;
  percentage_used: number | null;
  available_spare_percent: number | null;
  temperature_c: number | null;
  power_on_hours: number | null;
  power_cycles: number | null;
  unsafe_shutdowns: number | null;
  media_errors: number | null;
  total_bytes_written: number | null;
};
type BatteryInformation = {
  name: string;
  manufacturer: string | null;
  model_name: string | null;
  serial_number: string | null;
  technology: string | null;
  cycle_count: number | null;
  full_capacity: number | null;
  design_capacity: number | null;
  capacity_unit: string | null;
  health_percent: number | null;
  design_voltage_uv: number | null;
};
type DeviceInformation = {
  system: SystemInformation;
  storage: StorageDeviceInformation[];
  batteries: BatteryInformation[];
  versions: VersionInformation;
};
type VersionInformation = {
  controller: SoftwareVersion;
  service: SoftwareVersion | null;
};
type SoftwareVersion = {
  name: string;
  version: string;
  build: string;
  full: string;
};
type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

const curveTemps = [30, 40, 50, 60, 70, 80, 90, 100];

const defaultFanProfiles: FanProfiles = {
  ac: {
    cpu: makeCurve([0, 10, 22, 38, 58, 76, 90, 100]),
    gpu: makeCurve([0, 0, 15, 32, 52, 72, 88, 100]),
    passive: true,
    whisper: false,
    benchmark: false,
  },
  battery: {
    cpu: makeCurve([0, 0, 12, 24, 40, 60, 82, 100]),
    gpu: makeCurve([0, 0, 0, 18, 34, 56, 78, 100]),
    passive: true,
    whisper: true,
    benchmark: false,
  },
};

const fallbackDashboard: Dashboard = {
  connected: false,
  message: "",
  cpu: { label: "CPU", value: 54, unit: "C", load: 37, frequency_mhz: 3200, power_state: null, active: null },
  gpu: { label: "GPU", value: 48, unit: "C", load: 18, frequency_mhz: 1455, power_state: "D0", active: true },
  fans: [
    { label: "CPU Fan", pwm: 92, percent: 36, rpm: 2412, mode: "manual" },
    { label: "GPU Fan", pwm: 80, percent: 31, rpm: 2202, mode: "manual" },
  ],
  power_mode: "standard",
  system_power_mode: "balanced",
  fan_mode: "standard",
  fan_control: "manual",
  passive_cooling: true,
  active_source: "ac",
  active_profile: 2,
  keyboard: {
    fn_lock: null,
    super_key_enabled: null,
    touchpad_hotkey_enabled: null,
    touchpad_enabled: null,
  },
  keyboard_light: null,
  lightbar: {
    brightness: null,
    max_brightness: null,
    color: null,
    rainbow: null,
    breathing: null,
    settings: null,
  },
  battery: {
    capacity: null,
    health: null,
    status: null,
    charging: null,
    cycle_count: null,
    charge_limit: null,
  },
};

const defaultPowerProfiles: PowerProfilesState = {
  active_profile: 2,
  active_profile_name: "balanced",
  active_source: "ac",
  profiles: [
    {
      profile: 1,
      name: "performance",
      ac: { power_mode: 1, power_mode_name: "performance", fan_mode: 1, fan_mode_name: "performance" },
      battery: { power_mode: 2, power_mode_name: "balanced", fan_mode: 1, fan_mode_name: "performance" },
    },
    {
      profile: 2,
      name: "balanced",
      ac: { power_mode: 2, power_mode_name: "balanced", fan_mode: 2, fan_mode_name: "standard" },
      battery: { power_mode: 2, power_mode_name: "balanced", fan_mode: 2, fan_mode_name: "standard" },
    },
    {
      profile: 3,
      name: "battery_saver",
      ac: { power_mode: 2, power_mode_name: "balanced", fan_mode: 3, fan_mode_name: "quiet" },
      battery: { power_mode: 3, power_mode_name: "battery_saver", fan_mode: 3, fan_mode_name: "quiet" },
    },
  ],
};

const defaultLightbarSettings: LightbarSettingsState = {
  global_enabled: true,
  active_source: "ac",
  sources: {
    ac: {
      enabled: true,
      brightness: 160,
      red: 255,
      green: 132,
      blue: 48,
      rainbow: false,
      breathing: false,
    },
    battery: {
      enabled: true,
      brightness: 96,
      red: 80,
      green: 150,
      blue: 255,
      rainbow: false,
      breathing: false,
    },
  },
};

const defaultKeyboardLightSettings: KeyboardLightSettingsState = {
  available: true,
  global_enabled: true,
  active_source: "ac",
  sources: {
    ac: {
      enabled: true,
      brightness: 50,
      red: 255,
      green: 112,
      blue: 46,
      effect: "solid",
      speed: 5,
      direction: "left",
      reactive: false,
    },
    battery: {
      enabled: true,
      brightness: 25,
      red: 92,
      green: 128,
      blue: 255,
      effect: "solid",
      speed: 5,
      direction: "left",
      reactive: false,
    },
  },
};

const defaultDeviceInformation: DeviceInformation = {
  system: {
    manufacturer: "Intel Client Systems",
    model: "NUC X15",
    product_version: null,
    sku: null,
    serial_number: null,
    bios_vendor: "Intel",
    bios_version: "--",
    bios_date: null,
    board_vendor: "Intel",
    board_name: "NUC X15",
    board_version: null,
    processor: "Intel Core Processor",
    physical_cores: 8,
    logical_processors: 16,
    memory_bytes: 64 * 1024 ** 3,
    memory_slots: 2,
    memory_devices: [
      {
        locator: "Channel A",
        bank_locator: null,
        manufacturer: "Memory Module",
        serial_number: null,
        part_number: null,
        memory_type: "DDR4",
        form_factor: "SODIMM",
        size_bytes: 32 * 1024 ** 3,
        speed_mt_s: 3200,
        configured_speed_mt_s: 3200,
      },
      {
        locator: "Channel B",
        bank_locator: null,
        manufacturer: "Memory Module",
        serial_number: null,
        part_number: null,
        memory_type: "DDR4",
        form_factor: "SODIMM",
        size_bytes: 32 * 1024 ** 3,
        speed_mt_s: 3200,
        configured_speed_mt_s: 3200,
      },
    ],
    operating_system: "Linux",
    kernel: "--",
    architecture: "x86_64",
  },
  storage: [
    {
      name: "nvme0n1",
      model: "NVMe SSD",
      vendor: null,
      serial_number: null,
      firmware: null,
      size_bytes: 1024 ** 4,
      available_bytes: 640 * 1024 ** 3,
      available_percent: 63,
      transport: "NVMe",
      rotational: false,
      removable: false,
      smart_available: false,
      smart_passed: null,
      health_percent: null,
      percentage_used: null,
      available_spare_percent: null,
      temperature_c: null,
      power_on_hours: null,
      power_cycles: null,
      unsafe_shutdowns: null,
      media_errors: null,
      total_bytes_written: null,
    },
  ],
  batteries: [
    {
      name: "BAT0",
      manufacturer: "OEM",
      model_name: "Battery Pack",
      serial_number: null,
      technology: "Li-ion",
      cycle_count: null,
      full_capacity: null,
      design_capacity: null,
      capacity_unit: null,
      health_percent: null,
      design_voltage_uv: null,
    },
  ],
  versions: {
    controller: {
      name: "nuc-x15-controller",
      version: "0.1.2",
      build: "1",
      full: "0.1.2+1",
    },
    service: null,
  },
};

function App() {
  const { language, setLanguage, t } = useI18n();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem("intel-nuc.theme");
    return saved === "dark" || saved === "light" ? saved : "auto";
  });
  const [systemDark, setSystemDark] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard>(fallbackDashboard);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [fanProfiles, setFanProfiles] = useState<FanProfiles>(() => ({
    ac: cloneFanProfile(defaultFanProfiles.ac),
    battery: cloneFanProfile(defaultFanProfiles.battery),
  }));
  const isRefreshInFlight = useRef(false);
  const navigation = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { id: "fans", label: t("nav.fans"), icon: Wind },
    { id: "power", label: t("nav.power"), icon: Zap },
    { id: "lightbar", label: t("nav.lightbar"), icon: Lightbulb },
    { id: "keyboard", label: t("nav.keyboard"), icon: Keyboard },
    { id: "device", label: t("nav.device"), icon: Monitor },
    { id: "settings", label: t("nav.settings"), icon: Settings },
  ];

  const refresh = async () => {
    if (isRefreshInFlight.current) return;
    isRefreshInFlight.current = true;
    try {
      const next = await invoke<Dashboard>("get_dashboard");
      setDashboard(normalizeDashboard(next));
    } catch (error) {
      setDashboard({
        ...fallbackDashboard,
        connected: false,
        message: String(error),
      });
    } finally {
      isRefreshInFlight.current = false;
    }
  };

  useEffect(() => {
    let disposed = false;
    void refresh();
    if (!isTauriRuntime()) {
      return () => {
        disposed = true;
      };
    }

    const unlisten = listen<Dashboard>("dashboard-updated", (event) => {
      if (!disposed) setDashboard(normalizeDashboard(event.payload));
    });
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("intel-nuc.theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!isTauriRuntime() || hasSavedLanguagePreference()) return;
    let disposed = false;
    void invoke<Language>("get_system_language")
      .then((systemLanguage) => {
        if (
          !disposed &&
          !hasSavedLanguagePreference() &&
          (systemLanguage === "zh-CN" ||
            systemLanguage === "en" ||
            systemLanguage === "fr" ||
            systemLanguage === "de")
        ) {
          setLanguage(systemLanguage);
        }
      })
      .catch(() => {
        if (!disposed && !hasSavedLanguagePreference()) setLanguage("en");
      });
    return () => {
      disposed = true;
    };
  }, [setLanguage]);

  useEffect(() => {
    if (isTauriRuntime()) {
      void invoke("set_ui_language", { language }).catch(() => undefined);
    }
  }, [language]);

  useEffect(() => {
    let disposed = false;
    let isThemeCheckInFlight = false;
    let currentSystemDark = systemDark;
    const syncGsettingsTheme = async () => {
      if (isThemeCheckInFlight || disposed) return;
      isThemeCheckInFlight = true;
      try {
        const isDark = await invoke<boolean>("get_system_dark_mode");
        if (isDark !== currentSystemDark && !disposed) {
          currentSystemDark = isDark;
          setSystemDark(isDark);
        }
      } catch {
        const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
        if (isDark !== currentSystemDark && !disposed) {
          currentSystemDark = isDark;
          setSystemDark(isDark);
        }
      } finally {
        isThemeCheckInFlight = false;
      }
    };

    void syncGsettingsTheme();
    const themeTimer = window.setInterval(() => void syncGsettingsTheme(), 2000);

    return () => {
      disposed = true;
      window.clearInterval(themeTimer);
    };
  }, []);

  const resolvedDark = themeMode === "auto" ? systemDark : themeMode === "dark";
  const shellClass = resolvedDark ? "app app-dark" : "app app-light";
  const pageMeta = activeSection === "fans"
    ? { eyebrow: t("eyebrow.coolingControl"), title: t("page.fans") }
    : activeSection === "power"
      ? { eyebrow: t("eyebrow.powerStrategy"), title: t("page.power") }
      : activeSection === "lightbar"
        ? { eyebrow: t("eyebrow.ambientLighting"), title: t("page.lightbar") }
      : activeSection === "keyboard"
        ? { eyebrow: t("eyebrow.keyboardLighting"), title: t("page.keyboard") }
      : activeSection === "device"
        ? { eyebrow: t("eyebrow.deviceIdentity"), title: t("page.device") }
      : activeSection === "settings"
        ? { eyebrow: t("eyebrow.preferences"), title: t("page.settings") }
      : { eyebrow: t("eyebrow.hardwareOverview"), title: t("page.dashboard") };

  return (
    <main className={shellClass} style={{ colorScheme: resolvedDark ? "dark" : "light" }}>
      <TitleBar />
      <ResizeHandles />
      <div className="app-layout">
        <aside className="sidebar glass-panel">
          <div className="brand">
            <div className="brand-mark">
              <img src={brandIcon} alt="" />
            </div>
            <div>
              <p className="brand-name">Intel NUC</p>
              <p className="brand-subtitle">Control Center</p>
            </div>
          </div>

          <nav className="nav-list" aria-label={t("nav.dashboard")}>
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={activeSection === item.id ? "nav-item nav-item-active" : "nav-item"}
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="content">
          <header className="page-header">
            <div>
              <p className="eyebrow">{pageMeta.eyebrow}</p>
              <h1>{pageMeta.title}</h1>
            </div>
          </header>

          {activeSection === "fans" ? (
            <FanCurvePage
              dashboard={dashboard}
              dark={resolvedDark}
              profiles={fanProfiles}
              setProfiles={setFanProfiles}
            />
          ) : activeSection === "power" ? (
            <PowerModePage dashboard={dashboard} />
          ) : activeSection === "lightbar" ? (
            <LightbarPage dashboard={dashboard} />
          ) : activeSection === "keyboard" ? (
            <KeyboardLightPage
              dashboard={dashboard}
              onKeyboardStateChange={(patch) =>
                setDashboard((current) => ({
                  ...current,
                  keyboard: { ...current.keyboard, ...patch },
                }))
              }
            />
          ) : activeSection === "device" ? (
            <DeviceInfoPage />
          ) : activeSection === "settings" ? (
            <SystemSettingsPage
              dashboard={dashboard}
              language={language}
              onLanguageChange={setLanguage}
              onThemeChange={setThemeMode}
              themeMode={themeMode}
            />
          ) : (
            <DashboardPage dashboard={dashboard} />
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardPage({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useI18n();
  return (
    <>
      {!dashboard.connected ? (
        <div className="alert-strip glass-panel">
          <Activity size={17} />
          <span>{t("dashboard.serviceUnavailable")}</span>
        </div>
      ) : null}

      <div className="dashboard-stack">
        <div className="metric-grid">
          <SensorCard metric={dashboard.cpu} tone="cpu" />
          <SensorCard metric={dashboard.gpu} tone="gpu" />
        </div>

        <div className="status-card-grid">
          <KeyboardLockCard locks={dashboard.keyboard} />
          <LightbarCard lightbar={dashboard.lightbar} />
          <PerformanceCard
            fanMode={dashboard.fan_mode}
            powerMode={dashboard.power_mode}
            systemPowerMode={dashboard.system_power_mode}
          />
          <BatteryCard battery={dashboard.battery} />
        </div>

        <section className="fans-section glass-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("section.cooling")}</p>
              <h2>{t("section.fanStatus")}</h2>
            </div>
          </div>
          <div className="fan-grid">
            {dashboard.fans.map((fan) => (
              <FanCard fan={fan} key={fan.label} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function SystemSettingsPage({
  dashboard,
  language,
  onLanguageChange,
  onThemeChange,
  themeMode,
}: {
  dashboard: Dashboard;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onThemeChange: (theme: ThemeMode) => void;
  themeMode: ThemeMode;
}) {
  const { t } = useI18n();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartPending, setAutostartPending] = useState(false);
  const [error, setError] = useState("");
  const [appVersion, setAppVersion] = useState(
    defaultDeviceInformation.versions.controller.full,
  );

  useEffect(() => {
    let disposed = false;
    if (!isTauriRuntime()) {
      setAutostart(false);
      return;
    }
    void invoke<boolean>("get_autostart_enabled")
      .then((enabled) => {
        if (!disposed) setAutostart(enabled);
      })
      .catch((readError) => {
        if (!disposed) {
          setAutostart(false);
          setError(t("settings.startupReadFailed", { error: String(readError) }));
        }
      });
    return () => {
      disposed = true;
    };
  }, [t]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void invoke<string>("get_application_version")
      .then(setAppVersion)
      .catch(() => undefined);
  }, []);

  const updateAutostart = async () => {
    if (autostartPending || autostart === null) return;
    const next = !autostart;
    setAutostart(next);
    setAutostartPending(true);
    setError("");
    if (!isTauriRuntime()) {
      setAutostartPending(false);
      return;
    }
    try {
      setAutostart(await invoke<boolean>("set_autostart_enabled", { enabled: next }));
    } catch (updateError) {
      setAutostart(!next);
      setError(t("settings.startupUpdateFailed", { error: String(updateError) }));
    } finally {
      setAutostartPending(false);
    }
  };

  return (
    <div className="system-settings-page">
      {error ? (
        <div className="settings-error glass-panel">
          <Activity size={17} />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="settings-grid">
        <section className="settings-card glass-panel">
          <header>
            <span><Palette size={20} /></span>
            <div><p>{t("settings.appearance")}</p><h2>{t("settings.colorScheme")}</h2></div>
          </header>
          <ThemeSelector value={themeMode} onChange={onThemeChange} />
        </section>

        <section className="settings-card glass-panel">
          <header>
            <span><Server size={20} /></span>
            <div><p>{t("common.status")}</p><h2>{t("settings.service")}</h2></div>
          </header>
          <div className={dashboard.connected ? "settings-service settings-service-online" : "settings-service settings-service-offline"}>
            <i />
            <strong>{dashboard.connected ? t("settings.serviceOnline") : t("settings.serviceOffline")}</strong>
          </div>
        </section>

        <section className="settings-card glass-panel">
          <header>
            <span><Rocket size={20} /></span>
            <div><p>{t("eyebrow.preferences")}</p><h2>{t("settings.startup")}</h2></div>
          </header>
          <button
            aria-checked={autostart === true}
            className={`settings-toggle ${autostart ? "settings-toggle-on" : ""}`}
            disabled={autostartPending || autostart === null}
            onClick={() => void updateAutostart()}
            role="switch"
            type="button"
          >
            <span>
              <strong>{t("settings.startupLabel")}</strong>
              <small>{t("settings.startupHint")}</small>
            </span>
            <b><i /></b>
          </button>
        </section>

        <section className="settings-card glass-panel">
          <header>
            <span><Languages size={20} /></span>
            <div><p>{t("eyebrow.preferences")}</p><h2>{t("settings.language")}</h2></div>
          </header>
          <div className="language-options">
            {languageOptions.map((option) => (
              <button
                aria-pressed={language === option.value}
                className={language === option.value ? "language-option language-option-active" : "language-option"}
                key={option.value}
                onClick={() => onLanguageChange(option.value)}
                type="button"
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </section>

        <BatteryChargeCard connected={dashboard.connected} />
      </div>
      <div className="settings-version">
        <span>{t("settings.version")}</span>
        <strong>{appVersion}</strong>
      </div>
    </div>
  );
}

function BatteryChargeCard({ connected }: { connected: boolean }) {
  const { t } = useI18n();
  const [battery, setBattery] = useState<BatteryChargeLimit | null>(null);
  const [mode, setMode] = useState<ChargeMode>("custom");
  const [customLimit, setCustomLimit] = useState(80);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isTauriRuntime()) {
      setBattery({ name: "BAT0", threshold: 80 });
      setMode("custom");
      setLoading(false);
      return;
    }
    if (!connected) {
      setBattery(null);
      setFeedback("");
      setLoading(false);
      return;
    }
    let disposed = false;
    setLoading(true);
    setError("");
    void invoke<BatteryChargeLimit | null>("get_battery_charge_limit")
      .then((next) => {
        if (disposed) return;
        setBattery(next);
        if (next) {
          setMode(next.threshold === 100 ? "full" : next.threshold === 65 ? "health" : "custom");
          setCustomLimit(next.threshold);
        }
        setLoading(false);
      })
      .catch((readError) => {
        if (disposed) return;
        setBattery(null);
        setError(t("settings.chargeReadFailed", { error: String(readError) }));
        setLoading(false);
      });
    return () => { disposed = true; };
  }, [connected, t]);

  const applyLimit = async (nextMode: ChargeMode, threshold: number) => {
    if (!battery || pending || !Number.isInteger(threshold) || threshold < 1 || threshold > 100) return;
    setPending(true);
    setError("");
    setFeedback("");
    if (!isTauriRuntime()) {
      setBattery({ ...battery, threshold });
      setMode(nextMode);
      setFeedback(t("settings.chargeApplied", { threshold }));
      setPending(false);
      return;
    }
    try {
      const applied = await invoke<BatteryChargeLimit>("set_battery_charge_limit", {
        name: battery.name,
        threshold,
      });
      setBattery(applied);
      setMode(nextMode);
      setFeedback(t("settings.chargeApplied", { threshold: applied.threshold }));
    } catch (writeError) {
      setError(t("settings.chargeApplyFailed", { error: String(writeError) }));
    } finally {
      setPending(false);
    }
  };

  const disabled = pending || loading || !battery || (isTauriRuntime() && !connected);
  return (
    <section className="settings-card settings-charge-card glass-panel">
      <header>
        <span><BatteryCharging size={20} /></span>
        <div><p>{t("settings.chargeKicker")}</p><h2>{t("settings.chargeHealth")}</h2></div>
      </header>
      {loading ? <p className="charge-status">{t("common.loading")}</p> : battery ? (
        <>
          <p className="charge-status">{connected || !isTauriRuntime() ? `${t("settings.chargeCurrent", { threshold: battery.threshold })} · ${battery.name}` : t("settings.serviceOffline")}</p>
          <div className="charge-options" aria-label={t("settings.chargeHealth")}>
            <button aria-pressed={mode === "full"} className={mode === "full" ? "charge-option charge-option-active" : "charge-option"} disabled={disabled} onClick={() => void applyLimit("full", 100)} type="button">
              <strong>{t("settings.chargeFull")}</strong><small>100%</small>
            </button>
            <button aria-pressed={mode === "health"} className={mode === "health" ? "charge-option charge-option-active" : "charge-option"} disabled={disabled} onClick={() => void applyLimit("health", 65)} type="button">
              <strong>{t("settings.chargeProtect")}</strong><small>65%</small>
            </button>
            <button aria-pressed={mode === "custom"} className={mode === "custom" ? "charge-option charge-option-active" : "charge-option"} disabled={disabled} onClick={() => { setMode("custom"); setFeedback(""); }} type="button">
              <strong>{t("settings.chargeCustom")}</strong><small>{customLimit}%</small>
            </button>
          </div>
          {mode === "custom" ? (
            <div className="charge-custom">
              <label htmlFor="charge-custom-limit">{t("settings.chargeTarget", { threshold: customLimit })}</label>
              <div>
                <input id="charge-custom-limit" type="range" min={1} max={100} step={1} value={customLimit} disabled={disabled} onChange={(event) => { setCustomLimit(Number(event.target.value)); setFeedback(""); }} />
                <button disabled={disabled} onClick={() => void applyLimit("custom", customLimit)} type="button">{pending ? t("common.applying") : t("common.apply")}</button>
              </div>
            </div>
          ) : null}
        </>
      ) : <p className="charge-status">{connected ? t("settings.chargeUnavailable") : t("settings.serviceOffline")}</p>}
      {feedback ? <p className="charge-feedback">{feedback}</p> : null}
      {error ? <p className="charge-feedback charge-feedback-error" role="alert">{error}</p> : null}
    </section>
  );
}

function PowerModePage({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useI18n();
  const [state, setState] = useState<PowerProfilesState>(defaultPowerProfiles);
  const [pending, setPending] = useState<string | null>("loading");
  const [feedback, setFeedback] = useState(t("power.loading"));
  const [hasError, setHasError] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let disposed = false;

    if (!isTauriRuntime()) {
      setPending(null);
      setFeedback("");
      return () => {
        disposed = true;
      };
    }

    void invoke<PowerProfilesState>("get_power_profiles")
      .then((next) => {
        if (disposed || currentRequest !== requestId.current) return;
        setState(normalizePowerProfiles(next));
        setFeedback("");
        setHasError(false);
      })
      .catch((error) => {
        if (disposed || currentRequest !== requestId.current) return;
        setFeedback(t("power.readFailed", { error: String(error) }));
        setHasError(true);
      })
      .finally(() => {
        if (!disposed && currentRequest === requestId.current) setPending(null);
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (
      !isTauriRuntime()
      || pending
      || dashboard.active_profile === null
      || (
        state.active_profile === dashboard.active_profile
        && state.active_source === dashboard.active_source
      )
    ) {
      return;
    }

    const currentRequest = ++requestId.current;
    let disposed = false;
    void invoke<PowerProfilesState>("get_power_profiles")
      .then((next) => {
        if (!disposed && currentRequest === requestId.current) {
          setState(normalizePowerProfiles(next));
        }
      })
      .catch(() => {
        // The dashboard already exposes the disconnect state; keep the last
        // valid card configuration until the persistent connection returns.
      });
    return () => {
      disposed = true;
    };
  }, [dashboard.active_profile, dashboard.active_source, pending, state.active_profile, state.active_source]);

  const selectPowerLevel = async (profile: number, source: PowerSource, mode: PowerLevel) => {
    if (pending) return;
    const key = `${profile}-${source}-power`;
    const previous = state;
    const optimistic = updatePowerProfileLevel(state, profile, source, mode);
    setState(optimistic);
    setPending(key);
    setHasError(false);
    setFeedback(t("power.saving", {
      source: powerSourceLabel(source, t),
      mode: powerLevelLabel(mode, t),
    }));

    if (!isTauriRuntime()) {
      setFeedback(t("power.saved", { source: powerSourceLabel(source, t) }));
      setPending(null);
      return;
    }

    try {
      const next = await invoke<PowerProfilesState>("set_power_profile_power_mode", { profile, source, mode });
      setState(normalizePowerProfiles(next));
      setFeedback(
        state.active_profile === profile && state.active_source === source
          ? t("power.activeChanged", {
              source: powerSourceLabel(source, t),
              mode: powerLevelLabel(mode, t),
            })
          : t("power.saved", { source: powerSourceLabel(source, t) }),
      );
    } catch (error) {
      setState(previous);
      setHasError(true);
      setFeedback(t("power.saveFailed", { error: String(error) }));
    } finally {
      setPending(null);
    }
  };

  const selectFanLevel = async (profile: number, source: PowerSource, mode: FanLevel) => {
    if (pending) return;
    const key = `${profile}-${source}-fan`;
    const previous = state;
    const optimistic = updatePowerProfileFanLevel(state, profile, source, mode);
    setState(optimistic);
    setPending(key);
    setHasError(false);
    setFeedback(t("power.fanSaving", {
      source: powerSourceLabel(source, t),
      mode: fanLevelLabel(mode, t),
    }));

    if (!isTauriRuntime()) {
      setFeedback(t("power.fanSaved", { source: powerSourceLabel(source, t) }));
      setPending(null);
      return;
    }

    try {
      const next = await invoke<PowerProfilesState>("set_power_profile_fan_mode", { profile, source, mode });
      setState(normalizePowerProfiles(next));
      setFeedback(
        state.active_profile === profile && state.active_source === source
          ? t("power.fanChanged", {
              source: powerSourceLabel(source, t),
              mode: fanLevelLabel(mode, t),
            })
          : t("power.fanSaved", { source: powerSourceLabel(source, t) }),
      );
    } catch (error) {
      setState(previous);
      setHasError(true);
      setFeedback(t("power.fanSaveFailed", { error: String(error) }));
    } finally {
      setPending(null);
    }
  };

  const activateProfile = async (profile: number) => {
    if (pending || state.active_profile === profile) return;
    const previous = state;
    setState({ ...state, active_profile: profile });
    setPending(`activate-${profile}`);
    setHasError(false);
    setFeedback(t("power.activating", { profile: powerProfileTitle(profile, t) }));

    if (!isTauriRuntime()) {
      setState((current) => ({
        ...current,
        active_profile: profile,
        active_profile_name: powerProfileName(profile),
      }));
      setFeedback(t("power.activated", { profile: powerProfileTitle(profile, t) }));
      setPending(null);
      return;
    }

    try {
      const next = await invoke<PowerProfilesState>("activate_power_profile", { profile });
      const normalized = normalizePowerProfiles(next);
      setState(normalized);
      const source = normalized.active_source === "battery" ? "battery" : "ac";
      const slot = normalized.profiles.find((item) => item.profile === profile);
      const branch = slot?.[source];
      setFeedback(
        `${powerProfileTitle(profile, t)}: ${powerLevelLabel(branch?.power_mode_name ?? "balanced", t)} · ${fanLevelLabel(branch?.fan_mode_name ?? "standard", t)}`,
      );
    } catch (error) {
      setState(previous);
      setHasError(true);
      setFeedback(t("power.activateFailed", { error: String(error) }));
    } finally {
      setPending(null);
    }
  };

  const activeSlot = state.profiles.find((profile) => profile.profile === state.active_profile);
  const activeSource = state.active_source === "battery" ? "battery" : "ac";
  const activeBranch = activeSlot?.[activeSource];

  return (
    <div className="power-page">
      {feedback ? (
        <div className={`power-feedback glass-panel ${hasError ? "power-feedback-error" : ""}`}>
          <Activity size={17} />
          <span>{feedback}</span>
          <div className="power-live-state">
            {activeSource === "ac" ? <PlugZap size={15} /> : <BatteryMedium size={15} />}
            <span>{powerSourceLabel(activeSource, t)}</span>
            <i />
            <strong>
              {powerLevelLabel(activeBranch?.power_mode_name ?? "balanced", t)}
              {" · "}
              {fanLevelLabel(activeBranch?.fan_mode_name ?? "standard", t)}
            </strong>
          </div>
        </div>
      ) : null}

      <section className="power-overview glass-panel">
        <div className="power-overview-copy">
          <span className={`power-orb power-orb-${state.active_profile}`}>
            {state.active_profile === 1 ? <Zap size={26} /> : state.active_profile === 2 ? <CircleGauge size={26} /> : <Leaf size={26} />}
          </span>
          <div>
            <p className="eyebrow">{t("power.activeProfile")}</p>
            <h2>{powerProfileTitle(state.active_profile, t)}</h2>
            <p>{powerProfileDescription(state.active_profile, t)}</p>
          </div>
        </div>
        <div className="power-overview-stats">
          <div>
            <span>{t("power.powerMode")}</span>
            <strong>{powerLevelLabel(activeBranch?.power_mode_name ?? "balanced", t)}</strong>
          </div>
          <div>
            <span>{t("power.fanMode")}</span>
            <strong>{fanLevelLabel(activeBranch?.fan_mode_name ?? "standard", t)}</strong>
          </div>
          <div>
            <span>{t("power.systemPolicy")}</span>
            <strong>{powerModeLabel(dashboard.system_power_mode ?? "unknown", t)}</strong>
          </div>
          <div>
            <span>{t("power.batteryLevel")}</span>
            <strong>{dashboard.battery.capacity === null ? "--" : `${dashboard.battery.capacity}%`}</strong>
          </div>
        </div>
      </section>

      <div className="power-profile-grid">
        {state.profiles.map((profile) => {
          const active = state.active_profile === profile.profile;
          const Icon = profile.profile === 1 ? Zap : profile.profile === 2 ? CircleGauge : Leaf;
          return (
            <article
              className={`power-profile-card power-profile-${profile.profile} glass-panel ${active ? "power-profile-active" : ""}`}
              key={profile.profile}
            >
              <header className="power-profile-head">
                <span className="power-profile-icon"><Icon size={21} /></span>
                <div>
                  <p>{powerProfileKicker(profile.profile, t)}</p>
                  <h3>{powerProfileTitle(profile.profile, t)}</h3>
                </div>
                {active ? <span className="active-profile-badge"><Check size={12} />{t("common.current")}</span> : null}
              </header>

              <p className="power-profile-description">{powerProfileDescription(profile.profile, t)}</p>

              <PowerBranchEditor
                activeSource={activeSource}
                disabled={pending !== null}
                fanPending={pending === `${profile.profile}-ac-fan`}
                fanValue={profile.ac.fan_mode_name}
                label={t("power.ac")}
                onFanSelect={(mode) => void selectFanLevel(profile.profile, "ac", mode)}
                onPowerSelect={(mode) => void selectPowerLevel(profile.profile, "ac", mode)}
                powerPending={pending === `${profile.profile}-ac-power`}
                powerValue={profile.ac.power_mode_name}
                source="ac"
              />
              <PowerBranchEditor
                activeSource={activeSource}
                disabled={pending !== null}
                fanPending={pending === `${profile.profile}-battery-fan`}
                fanValue={profile.battery.fan_mode_name}
                label={t("power.battery")}
                onFanSelect={(mode) => void selectFanLevel(profile.profile, "battery", mode)}
                onPowerSelect={(mode) => void selectPowerLevel(profile.profile, "battery", mode)}
                powerPending={pending === `${profile.profile}-battery-power`}
                powerValue={profile.battery.power_mode_name}
                source="battery"
              />

              <button
                className={active ? "profile-activate profile-activate-current" : "profile-activate"}
                disabled={pending !== null || active}
                onClick={() => void activateProfile(profile.profile)}
                type="button"
              >
                {pending === `activate-${profile.profile}` ? <ChevronDown className="saving-icon" size={16} /> : active ? <Check size={16} /> : <Power size={16} />}
                {pending === `activate-${profile.profile}` ? t("common.applying") : active ? t("power.inUse") : t("power.enableProfile")}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PowerBranchEditor({
  activeSource,
  disabled,
  fanPending,
  fanValue,
  label,
  onFanSelect,
  onPowerSelect,
  powerPending,
  powerValue,
  source,
}: {
  activeSource: PowerSource;
  disabled: boolean;
  fanPending: boolean;
  fanValue: FanLevel;
  label: string;
  onFanSelect: (mode: FanLevel) => void;
  onPowerSelect: (mode: PowerLevel) => void;
  powerPending: boolean;
  powerValue: PowerLevel;
  source: PowerSource;
}) {
  const { t } = useI18n();
  const powerOptions: Array<{ value: PowerLevel; label: string }> = [
    { value: "performance", label: t("common.performance") },
    { value: "balanced", label: t("common.balanced") },
    { value: "battery_saver", label: t("common.saver") },
  ];
  const fanOptions: Array<{ value: FanLevel; label: string }> = [
    { value: "performance", label: t("common.performance") },
    { value: "standard", label: t("common.standard") },
    { value: "quiet", label: t("common.quiet") },
  ];
  return (
    <div className="power-branch">
      <div className="power-branch-heading">
        <span>{source === "ac" ? <PlugZap size={15} /> : <BatteryMedium size={15} />}{label}</span>
        {activeSource === source ? <small>{t("power.currentPower")}</small> : null}
      </div>
      <div className="branch-mode-row">
        <span>{t("power.powerMode")}</span>
        <ModeSelector
          disabled={disabled}
          onSelect={onPowerSelect}
          options={powerOptions}
          pending={powerPending}
          value={powerValue}
        />
      </div>
      <div className="branch-mode-row">
        <span>{t("power.fanMode")}</span>
        <ModeSelector
          disabled={disabled}
          onSelect={onFanSelect}
          options={fanOptions}
          pending={fanPending}
          value={fanValue}
        />
      </div>
    </div>
  );
}

function ModeSelector<T extends string>({
  disabled,
  onSelect,
  options,
  pending,
  value,
}: {
  disabled: boolean;
  onSelect: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  pending: boolean;
  value: T;
}) {
  return (
    <div className={`power-level-selector ${pending ? "power-level-pending" : ""}`}>
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={value === option.value ? "power-level-option power-level-option-active" : "power-level-option"}
          disabled={disabled}
          key={option.value}
          onClick={() => onSelect(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LightbarPage({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<LightbarSettingsState>(defaultLightbarSettings);
  const [source, setSource] = useState<PowerSource>(
    dashboard.active_source === "battery" ? "battery" : "ac",
  );
  const [recentColors, setRecentColors] = useState<string[]>(readRecentLightbarColors);
  const [pending, setPending] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [feedback, setFeedback] = useState(t("lightbar.loading"));
  const requestId = useRef(0);

  useEffect(() => {
    let disposed = false;
    if (!isTauriRuntime()) {
      setPending(false);
      setFeedback("");
      return;
    }

    void invoke<LightbarSettingsState>("get_lightbar_settings")
      .then((next) => {
        if (disposed) return;
        const normalized = normalizeLightbarSettings(next);
        setSettings(normalized);
        setSource(normalized.active_source === "battery" ? "battery" : "ac");
        setFeedback("");
        setHasError(false);
      })
      .catch((error) => {
        if (disposed) return;
        setFeedback(t("lightbar.readFailed", { error: String(error) }));
        setHasError(true);
      })
      .finally(() => {
        if (!disposed) setPending(false);
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (dashboard.active_source === "ac" || dashboard.active_source === "battery") {
      setSettings((current) => ({ ...current, active_source: dashboard.active_source ?? "ac" }));
    }
  }, [dashboard.active_source]);

  useEffect(() => {
    if (!dashboard.lightbar.settings || dirty || pending) return;
    const pushed = normalizeLightbarSettings(dashboard.lightbar.settings);
    setSettings((current) => lightbarSettingsEqual(current, pushed) ? current : pushed);
  }, [dashboard.lightbar.settings, dirty, pending]);

  const persist = async (
    next: LightbarSettingsState,
    targetSource: PowerSource,
    successMessage: string,
  ) => {
    const currentRequest = ++requestId.current;
    const branch = next.sources[targetSource];
    setPending(true);
    setHasError(false);
    setFeedback(t("lightbar.applying"));

    if (!isTauriRuntime()) {
      setSettings(next);
      setDirty(false);
      setFeedback(successMessage);
      setPending(false);
      return;
    }

    try {
      const saved = await invoke<LightbarSettingsState>("apply_lightbar_settings", {
        settings: {
          source: targetSource,
          globalEnabled: next.global_enabled,
          enabled: branch.enabled,
          brightness: branch.brightness,
          red: branch.red,
          green: branch.green,
          blue: branch.blue,
          rainbow: branch.rainbow,
          breathing: branch.breathing,
        },
      });
      if (currentRequest !== requestId.current) return;
      const normalized = normalizeLightbarSettings(saved);
      setSettings(normalized);
      setDirty(false);
      setFeedback(successMessage);
      const color = lightbarHex(branch);
      setRecentColors((current) => persistRecentLightbarColor(color, current));
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setHasError(true);
      setFeedback(t("lightbar.applyFailed", { error: String(error) }));
    } finally {
      if (currentRequest === requestId.current) setPending(false);
    }
  };

  const updateBranch = (patch: Partial<LightbarProfile>) => {
    setSettings((current) => ({
      ...current,
      sources: {
        ...current.sources,
        [source]: { ...current.sources[source], ...patch },
      },
    }));
    setDirty(true);
  };

  const applySwitch = (patch: Partial<LightbarProfile>, message: string) => {
    const next = {
      ...settings,
      sources: {
        ...settings.sources,
        [source]: { ...settings.sources[source], ...patch },
      },
    };
    setSettings(next);
    setDirty(false);
    void persist(next, source, message);
  };

  const setGlobalEnabled = (enabled: boolean) => {
    const next = { ...settings, global_enabled: enabled };
    setSettings(next);
    setDirty(false);
    void persist(next, source, enabled ? t("lightbar.globalOn") : t("lightbar.globalOff"));
  };

  const selectColor = (hex: string) => {
    const rgb = hexToRgb(hex);
    updateBranch(rgb);
  };

  const resetSource = () => {
    const defaults = defaultLightbarSettings.sources[source];
    const next = {
      ...settings,
      sources: {
        ...settings.sources,
        [source]: { ...defaults },
      },
    };
    setSettings(next);
    setDirty(false);
    void persist(next, source, t("lightbar.resetDone", { source: powerSourceLabel(source, t) }));
  };

  const branch = settings.sources[source];
  const previewActive = settings.global_enabled && branch.enabled;
  const liveSource: PowerSource = settings.active_source === "battery" ? "battery" : "ac";
  const liveBranch = settings.sources[liveSource];
  const liveActive = settings.global_enabled && liveBranch.enabled;
  const hex = lightbarHex(branch);
  const colorPreviewForeground = lightbarForeground(hex);
  const previewStyle = branch.rainbow
    ? undefined
    : { "--lightbar-color": hex } as React.CSSProperties;

  return (
    <div className="lightbar-page">
      {feedback ? (
        <div className={`lightbar-feedback glass-panel ${hasError ? "lightbar-feedback-error" : ""}`}>
          <Activity size={17} />
          <span>{feedback}</span>
          <div className="lightbar-live-state">
            {settings.active_source === "battery" ? <BatteryMedium size={15} /> : <PlugZap size={15} />}
            <span>{powerSourceLabel(settings.active_source === "battery" ? "battery" : "ac", t)}</span>
            <i />
            <strong>{liveActive ? (liveBranch.rainbow ? t("dashboard.rainbow") : liveBranch.breathing ? t("dashboard.breathing") : t("dashboard.steady")) : t("common.off")}</strong>
          </div>
        </div>
      ) : null}

      <section className="lightbar-hero glass-panel">
        <div className="lightbar-hero-copy">
          <span className={`lightbar-bulb ${liveActive ? "lightbar-bulb-on" : ""}`}>
            <Lightbulb size={25} />
          </span>
          <div>
            <p className="eyebrow">{t("eyebrow.ambientLighting")}</p>
            <h2>{t("lightbar.ambient")}</h2>
          </div>
        </div>
        <button
          aria-checked={settings.global_enabled}
          className={`lightbar-master-switch ${settings.global_enabled ? "lightbar-master-on" : ""}`}
          disabled={pending}
          onClick={() => setGlobalEnabled(!settings.global_enabled)}
          role="switch"
          type="button"
        >
          <Power size={16} />
          <span>{t("lightbar.master")}</span>
          <strong>{settings.global_enabled ? t("common.on") : t("common.off")}</strong>
        </button>
      </section>

      <section className="lightbar-workspace glass-panel">
        <div className="lightbar-source-tabs">
          {(["ac", "battery"] as PowerSource[]).map((item) => (
            <button
              className={source === item ? "lightbar-source-tab lightbar-source-active" : "lightbar-source-tab"}
              key={item}
              onClick={() => setSource(item)}
              type="button"
            >
              {item === "ac" ? <PlugZap size={16} /> : <BatteryMedium size={16} />}
              <span>{powerSourceLabel(item, t)}</span>
              {settings.active_source === item ? <small>{t("common.current")}</small> : null}
            </button>
          ))}
        </div>

        <div className="lightbar-editor">
          <div className="lightbar-preview-panel">
            <div
              className={[
                "lightbar-preview",
                previewActive ? "lightbar-preview-on" : "",
                branch.rainbow ? "lightbar-preview-rainbow" : "",
                branch.breathing ? "lightbar-preview-breathing" : "",
              ].filter(Boolean).join(" ")}
              style={previewStyle}
            >
              <div className="lightbar-preview-glow" />
              <div className="lightbar-preview-device">
                <span /><span /><span /><span /><span />
              </div>
            </div>
            <div className="lightbar-preview-meta">
              <div>
                <span>{t("lightbar.currentColor")}</span>
                <strong>{branch.rainbow ? t("lightbar.dynamicRainbow") : hex.toUpperCase()}</strong>
              </div>
              <div>
                <span>{t("common.brightness")}</span>
                <strong>{Math.round((branch.brightness / 255) * 100)}%</strong>
              </div>
            </div>
            <StrategySwitch
              checked={branch.enabled}
              disabled={pending || !settings.global_enabled}
              icon={<Power size={18} />}
              label={t("lightbar.enableFor", { source: powerSourceLabel(source, t) })}
              onChange={(enabled) => applySwitch(
                { enabled },
                enabled
                  ? t("lightbar.sourceOn", { source: powerSourceLabel(source, t) })
                  : t("lightbar.sourceOff", { source: powerSourceLabel(source, t) }),
              )}
            />
          </div>

          <div className="lightbar-controls">
            <div className="lightbar-control-section">
              <div className="lightbar-section-title">
                <div>
                  <p className="eyebrow">{t("common.color")}</p>
                  <h3>{t("lightbar.colorBrightness")}</h3>
                </div>
                <label
                  className="lightbar-color-input"
                  style={{ background: hex, color: colorPreviewForeground }}
                >
                  <input
                    aria-label={t("lightbar.currentColor")}
                    disabled={pending || branch.rainbow}
                    onChange={(event) => selectColor(event.currentTarget.value)}
                    type="color"
                    value={hex}
                  />
                  <span>{hex.toUpperCase()}</span>
                </label>
              </div>

              <label className="lightbar-range">
                <span><strong>{t("common.brightness")}</strong><small>{Math.round((branch.brightness / 255) * 100)}%</small></span>
                <input
                  disabled={pending}
                  max="255"
                  min="0"
                  onChange={(event) => updateBranch({ brightness: Number(event.currentTarget.value) })}
                  type="range"
                  value={branch.brightness}
                />
              </label>

              <div className="lightbar-rgb-grid">
                {([
                  ["red", "R", branch.red],
                  ["green", "G", branch.green],
                  ["blue", "B", branch.blue],
                ] as const).map(([channel, label, value]) => (
                  <label className={`lightbar-channel lightbar-channel-${channel}`} key={channel}>
                    <span>{label}</span>
                    <input
                      disabled={pending || branch.rainbow}
                      max="255"
                      min="0"
                      onChange={(event) => updateBranch({ [channel]: Number(event.currentTarget.value) })}
                      type="range"
                      value={value}
                    />
                    <strong>{value}</strong>
                  </label>
                ))}
              </div>

              <div className="lightbar-recent">
                <span>{t("lightbar.recentColors")}</span>
                <div>
                  {recentColors.map((color) => (
                    <button
                      aria-pressed={color.toLowerCase() === hex.toLowerCase()}
                      aria-label={`使用颜色 ${color}`}
                      className={color.toLowerCase() === hex.toLowerCase() ? "lightbar-recent-active" : ""}
                      disabled={pending}
                      key={color}
                      onClick={() => selectColor(color)}
                      style={{ background: color }}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="lightbar-effects">
              <StrategySwitch
                checked={branch.rainbow}
                description={t("lightbar.rainbowHint")}
                disabled={pending || !settings.global_enabled || !branch.enabled}
                icon={<Sparkles size={18} />}
                label={t("lightbar.rainbowMode")}
                onChange={(rainbow) => applySwitch({ rainbow }, rainbow ? t("lightbar.rainbowOn") : t("lightbar.rainbowOff"))}
              />
              <StrategySwitch
                checked={branch.breathing}
                description={t("lightbar.sleepBreathingHint")}
                disabled={pending || !settings.global_enabled || !branch.enabled}
                icon={<Moon size={18} />}
                label={t("lightbar.sleepBreathing")}
                onChange={(breathing) => applySwitch({ breathing }, breathing ? t("lightbar.breathingOn") : t("lightbar.breathingOff"))}
              />
            </div>

            <div className="lightbar-actions">
              <button className="secondary-action" disabled={pending} onClick={resetSource} type="button">
                <RotateCcw size={16} />
                {t("common.reset")}
              </button>
              <button
                className="primary-action"
                disabled={pending || !dirty}
                onClick={() => void persist(settings, source, t("lightbar.applied", { source: powerSourceLabel(source, t) }))}
                type="button"
              >
                <Save size={16} />
                {pending ? t("common.applying") : dirty ? t("common.apply") : t("common.applied")}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeviceInfoPage() {
  const { t } = useI18n();
  const [information, setInformation] = useState<DeviceInformation>(
    defaultDeviceInformation,
  );
  const [activeTab, setActiveTab] = useState<"system" | "storage" | "battery">(
    "system",
  );
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(t("device.loading"));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let disposed = false;
    if (!isTauriRuntime()) {
      setLoading(false);
      setFeedback("");
      return;
    }

    void invoke<DeviceInformation>("get_device_information")
      .then((next) => {
        if (disposed) return;
        setInformation(next);
        setFeedback("");
        setHasError(false);
      })
      .catch((error) => {
        if (disposed) return;
        setFeedback(t("device.readFailed", { error: String(error) }));
        setHasError(true);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, []);

  const system = information.system;
  const model = system.model || system.board_name || t("device.unknownDevice");
  const memoryTypes = Array.from(
    new Set(system.memory_devices.map((device) => device.memory_type).filter(Boolean)),
  ).join(" / ");
  const memorySpeeds = Array.from(
    new Set(
      system.memory_devices
        .map((device) => device.configured_speed_mt_s || device.speed_mt_s)
        .filter((speed): speed is number => speed !== null && speed > 0),
    ),
  );
  const memoryRows: Array<[string, string]> = [
    [t("device.totalCapacity"), formatBytes(system.memory_bytes)],
    [
      t("device.slots"),
      system.memory_slots === null
        ? t("device.modules", { count: system.memory_devices.length })
        : `${system.memory_devices.length} / ${system.memory_slots}`,
    ],
    [t("device.memoryType"), memoryTypes || "--"],
    [t("device.memorySpeed"), memorySpeeds.length ? memorySpeeds.map((speed) => `${speed} MT/s`).join(" / ") : "--"],
    ...system.memory_devices.map(
      (device, index): [string, string] => [
        device.locator || t("device.memoryModule", { index: index + 1 }),
        [
          formatBytes(device.size_bytes),
          device.manufacturer,
          device.part_number,
          device.form_factor,
        ]
          .filter(Boolean)
          .join(" · ") || "--",
      ],
    ),
  ];
  const tabs = [
    { id: "system" as const, label: t("device.system"), count: null, icon: <Monitor size={17} /> },
    { id: "storage" as const, label: t("device.storage"), count: information.storage.length, icon: <HardDrive size={17} /> },
    { id: "battery" as const, label: t("device.battery"), count: information.batteries.length, icon: <Battery size={17} /> },
  ];

  return (
    <div className="device-info-page">
      {loading || hasError ? (
        <div className={`device-info-feedback glass-panel ${hasError ? "device-info-feedback-error" : ""}`}>
          <Activity size={17} />
          <span>{feedback}</span>
          <strong>{loading ? t("common.loading") : t("common.readFailed")}</strong>
        </div>
      ) : null}

      <section className="device-info-hero glass-panel">
        <span className="device-info-hero-icon"><Monitor size={27} /></span>
        <div>
          <p className="eyebrow">{t("eyebrow.deviceIdentity")}</p>
          <h2>{model}</h2>
          <p>
            {[system.manufacturer, system.sku].filter(Boolean).join(" · ") || t("device.localHardware")}
          </p>
        </div>
        <div className="device-info-hero-meta">
          <span>{t("device.os")}<strong>{infoValue(system.operating_system)}</strong></span>
          <span>{t("device.firmware")}<strong>{infoValue(system.bios_version)}</strong></span>
        </div>
      </section>

      <div className="device-info-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "device-info-tab device-info-tab-active" : "device-info-tab"}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count === null ? null : <small>{tab.count}</small>}
          </button>
        ))}
      </div>

      {activeTab === "system" ? (
        <div className="device-info-grid">
          <DeviceInfoCard
            icon={<Monitor size={19} />}
            kicker={t("device.identity")}
            rows={[
              [t("device.manufacturer"), infoValue(system.manufacturer)],
              [t("device.productModel"), infoValue(system.model)],
              [t("device.productVersion"), infoValue(system.product_version)],
              [t("device.systemSku"), infoValue(system.sku)],
              [t("device.serial"), infoValue(system.serial_number)],
            ]}
            title={t("device.identity")}
          />
          <DeviceInfoCard
            icon={<ShieldCheck size={19} />}
            kicker={t("device.firmware")}
            rows={[
              [t("device.biosVendor"), infoValue(system.bios_vendor)],
              [t("device.biosVersion"), infoValue(system.bios_version)],
              [t("device.releaseDate"), infoValue(system.bios_date)],
              [t("device.boardVendor"), infoValue(system.board_vendor)],
              [t("device.boardModel"), infoValue(system.board_name)],
              [t("device.boardVersion"), infoValue(system.board_version)],
            ]}
            title={t("device.firmwareBoard")}
          />
          <DeviceInfoCard
            icon={<Cpu size={19} />}
            kicker={t("device.compute")}
            rows={[
              [t("device.processor"), infoValue(system.processor)],
              [
                t("device.cores"),
                system.physical_cores === null && system.logical_processors === null
                  ? "--"
                  : t("device.coreThreads", {
                      cores: system.physical_cores ?? "--",
                      threads: system.logical_processors ?? "--",
                    }),
              ],
              [t("device.os"), infoValue(system.operating_system)],
              [t("device.kernel"), infoValue(system.kernel)],
              [t("device.arch"), infoValue(system.architecture)],
            ]}
            title={t("device.compute")}
          />
          <DeviceInfoCard
            icon={<MemoryStick size={19} />}
            kicker={t("device.memory")}
            rows={memoryRows}
            title={t("device.memory")}
          />
        </div>
      ) : null}

      {activeTab === "storage" ? (
        information.storage.length ? (
          <div className="storage-device-grid">
            {information.storage.map((disk) => {
              const availableText = disk.available_bytes === null
                ? "--"
                : formatBytes(disk.available_bytes);
              const availablePercent = disk.available_percent === null
                ? "--"
                : `${disk.available_percent}%`;
              return (
              <article className="storage-device-card glass-panel" key={disk.name}>
                <header>
                  <span><HardDrive size={21} /></span>
                  <div>
                    <p>{disk.transport}</p>
                    <h3>{[disk.vendor, disk.model].filter(Boolean).join(" ") || disk.name}</h3>
                  </div>
                  <strong>{formatBytes(disk.size_bytes)}</strong>
                </header>
                <div className="storage-capacity">
                  <div className="storage-capacity-meta">
                    <span>{t("device.availableSpace")}</span>
                    <strong>{availableText} · {availablePercent}</strong>
                  </div>
                  <div
                    aria-label={t("device.availableSpace")}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={disk.available_percent ?? undefined}
                    className="storage-capacity-bar"
                    role="progressbar"
                  >
                    <span style={{ width: `${disk.available_percent ?? 0}%` }} />
                  </div>
                </div>
                <dl>
                  <div><dt>{t("device.node")}</dt><dd>/dev/{disk.name}</dd></div>
                  <div><dt>{t("device.totalCapacity")}</dt><dd>{formatBytes(disk.size_bytes)}</dd></div>
                  <div><dt>{t("device.mediaType")}</dt><dd>{disk.rotational ? t("device.hdd") : t("device.ssd")}</dd></div>
                  <div><dt>{t("device.serial")}</dt><dd>{infoValue(disk.serial_number)}</dd></div>
                  <div><dt>{t("device.firmware")}</dt><dd>{infoValue(disk.firmware)}</dd></div>
                  <div><dt>{t("device.availableSpace")}</dt><dd>{availableText}</dd></div>
                  <div><dt>{t("device.lifeRemaining")}</dt><dd>{disk.health_percent === null ? "--" : `${disk.health_percent}%`}</dd></div>
                  <div><dt>{t("common.temperature")}</dt><dd>{disk.temperature_c === null ? "--" : `${disk.temperature_c} °C`}</dd></div>
                </dl>
              </article>
              );
            })}
          </div>
        ) : (
          <DeviceInfoEmpty icon={<HardDrive size={25} />} text={t("device.noStorage")} />
        )
      ) : null}

      {activeTab === "battery" ? (
        information.batteries.length ? (
          <div className="battery-info-grid">
            {information.batteries.map((battery) => (
              <article className="battery-info-card glass-panel" key={battery.name}>
                <header>
                  <span><Battery size={22} /></span>
                  <div>
                    <p>{battery.name}</p>
                    <h3>{battery.model_name || t("device.internalBattery")}</h3>
                  </div>
                  <strong>
                    {battery.health_percent === null ? "--" : `${battery.health_percent}%`}
                    <small>{t("device.batteryHealth")}</small>
                  </strong>
                </header>
                <div className="battery-health-track">
                  <span style={{ width: `${battery.health_percent ?? 0}%` }} />
                </div>
                <dl>
                  <div><dt>{t("device.manufacturer")}</dt><dd>{infoValue(battery.manufacturer)}</dd></div>
                  <div><dt>{t("device.chemistry")}</dt><dd>{infoValue(battery.technology)}</dd></div>
                  <div><dt>{t("device.serial")}</dt><dd>{infoValue(battery.serial_number)}</dd></div>
                  <div><dt>{t("device.cycleCount")}</dt><dd>{formatCount(battery.cycle_count, t, "common.countTimes")}</dd></div>
                  <div><dt>{t("device.fullCapacity")}</dt><dd>{formatBatteryCapacity(battery.full_capacity, battery.capacity_unit)}</dd></div>
                  <div><dt>{t("device.designCapacity")}</dt><dd>{formatBatteryCapacity(battery.design_capacity, battery.capacity_unit)}</dd></div>
                  <div><dt>{t("device.designVoltage")}</dt><dd>{battery.design_voltage_uv === null ? "--" : `${(battery.design_voltage_uv / 1_000_000).toFixed(2)} V`}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <DeviceInfoEmpty icon={<Battery size={25} />} text={t("device.noBattery")} />
        )
      ) : null}
    </div>
  );
}

function DeviceInfoCard({
  className = "",
  icon,
  kicker,
  rows,
  title,
}: {
  className?: string;
  icon: React.ReactNode;
  kicker: string;
  rows: Array<[string, string]>;
  title: string;
}) {
  return (
    <article className={`device-info-card glass-panel ${className}`}>
      <header>
        <span>{icon}</span>
        <div><p>{kicker}</p><h3>{title}</h3></div>
      </header>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </article>
  );
}

function DeviceInfoEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="device-info-empty glass-panel">
      <span>{icon}</span>
      <strong>{text}</strong>
    </div>
  );
}

function KeyboardLightPage({
  dashboard,
  onKeyboardStateChange,
}: {
  dashboard: Dashboard;
  onKeyboardStateChange: (patch: Partial<KeyboardLocks>) => void;
}) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<KeyboardLightSettingsState>(
    defaultKeyboardLightSettings,
  );
  const [source, setSource] = useState<PowerSource>(
    dashboard.active_source === "battery" ? "battery" : "ac",
  );
  const [recentColors, setRecentColors] = useState<string[]>(readRecentKeyboardColors);
  const [pending, setPending] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [feedback, setFeedback] = useState(t("keyboard.loading"));
  const [controlPending, setControlPending] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    let disposed = false;
    if (!isTauriRuntime()) {
      setPending(false);
      setFeedback("");
      return;
    }

    void invoke<KeyboardLightSettingsState>("get_keyboard_light_settings")
      .then((next) => {
        if (disposed) return;
        const normalized = normalizeKeyboardLightSettings(next);
        setSettings(normalized);
        setSource(normalized.active_source === "battery" ? "battery" : "ac");
        setFeedback(
          normalized.available
            ? ""
            : t("keyboard.unavailable"),
        );
        setHasError(!normalized.available);
      })
      .catch((error) => {
        if (disposed) return;
        setFeedback(t("keyboard.readFailed", { error: String(error) }));
        setHasError(true);
      })
      .finally(() => {
        if (!disposed) setPending(false);
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!dashboard.keyboard_light || dirty || pending) return;
    const pushed = normalizeKeyboardLightSettings(dashboard.keyboard_light);
    setSettings((current) =>
      keyboardLightSettingsEqual(current, pushed) ? current : pushed,
    );
  }, [dashboard.keyboard_light, dirty, pending]);

  const persist = async (
    next: KeyboardLightSettingsState,
    targetSource: PowerSource,
    successMessage: string,
  ) => {
    const currentRequest = ++requestId.current;
    const branch = next.sources[targetSource];
    setPending(true);
    setHasError(false);
    setFeedback(t("keyboard.applying"));

    if (!isTauriRuntime()) {
      setSettings(next);
      setDirty(false);
      setFeedback(successMessage);
      setPending(false);
      return;
    }

    try {
      const saved = await invoke<KeyboardLightSettingsState>(
        "apply_keyboard_light_settings",
        {
          settings: {
            source: targetSource,
            globalEnabled: next.global_enabled,
            enabled: branch.enabled,
            brightness: branch.brightness,
            red: branch.red,
            green: branch.green,
            blue: branch.blue,
            effect: branch.effect,
            speed: branch.speed,
            direction: branch.direction,
            reactive: branch.reactive,
          },
        },
      );
      if (currentRequest !== requestId.current) return;
      const normalized = normalizeKeyboardLightSettings(saved);
      setSettings(normalized);
      setDirty(false);
      setFeedback(successMessage);
      setRecentColors((current) =>
        persistRecentKeyboardColor(keyboardLightHex(branch), current),
      );
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setHasError(true);
      setFeedback(t("keyboard.applyFailed", { error: String(error) }));
    } finally {
      if (currentRequest === requestId.current) setPending(false);
    }
  };

  const updateBranch = (patch: Partial<KeyboardLightProfile>) => {
    setSettings((current) => ({
      ...current,
      sources: {
        ...current.sources,
        [source]: { ...current.sources[source], ...patch },
      },
    }));
    setDirty(true);
  };

  const applySwitch = (
    patch: Partial<KeyboardLightProfile>,
    message: string,
  ) => {
    const next = {
      ...settings,
      sources: {
        ...settings.sources,
        [source]: { ...settings.sources[source], ...patch },
      },
    };
    setSettings(next);
    setDirty(false);
    void persist(next, source, message);
  };

  const setGlobalEnabled = (enabled: boolean) => {
    const next = { ...settings, global_enabled: enabled };
    setSettings(next);
    setDirty(false);
    void persist(next, source, enabled ? t("keyboard.globalOn") : t("keyboard.globalOff"));
  };

  const resetSource = () => {
    const next = {
      ...settings,
      sources: {
        ...settings.sources,
        [source]: { ...defaultKeyboardLightSettings.sources[source] },
      },
    };
    setSettings(next);
    setDirty(false);
    void persist(next, source, t("keyboard.resetDone", { source: powerSourceLabel(source, t) }));
  };

  const toggleKeyboardControl = async (
    control: "fn" | "win" | "touchpad",
    current: boolean | null,
  ) => {
    if (controlPending || current === null) return;
    const enabled = !current;
    const command = control === "fn"
      ? "set_fn_lock"
      : control === "win"
        ? "set_win_key_enabled"
        : "set_touchpad_enabled";
    const field: keyof KeyboardLocks = control === "fn"
      ? "fn_lock"
      : control === "win"
        ? "super_key_enabled"
        : "touchpad_enabled";
    const name = control === "fn" ? t("keyboard.fnLock") : control === "win" ? t("keyboard.winKey") : t("keyboard.touchpad");

    setControlPending(control);
    setHasError(false);
    setFeedback(`${name}: ${enabled ? t("common.on") : t("common.off")}…`);
    if (!isTauriRuntime()) {
      onKeyboardStateChange({ [field]: enabled });
      setFeedback(`${name}: ${enabled ? t("common.on") : t("common.off")}`);
      setControlPending(null);
      return;
    }

    try {
      const confirmed = await invoke<boolean>(command, { enabled });
      onKeyboardStateChange({ [field]: confirmed });
      setFeedback(`${name}: ${confirmed ? t("common.on") : t("common.off")}`);
    } catch (error) {
      setHasError(true);
      setFeedback(t("keyboard.controlFailed", { name, error: String(error) }));
    } finally {
      setControlPending(null);
    }
  };

  const branch = settings.sources[source];
  const activeSource: PowerSource =
    settings.active_source === "battery" ? "battery" : "ac";
  const liveBranch = settings.sources[activeSource];
  const liveActive =
    settings.global_enabled && liveBranch.enabled && settings.available;
  const previewActive =
    settings.global_enabled && branch.enabled && settings.available;
  const hex = keyboardLightHex(branch);
  const usesColor = !["wave", "rainbow", "marquee"].includes(branch.effect);
  const supportsReactive = ["random", "ripple", "aurora", "fireworks"].includes(
    branch.effect,
  );
  const supportsDirection = branch.effect === "wave";
  const effects: Array<{
    id: KeyboardEffect;
    name: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    { id: "solid", name: t("keyboard.effect.solid"), description: t("keyboard.effect.solidDesc"), icon: <Sun size={17} /> },
    { id: "breathing", name: t("keyboard.effect.breathing"), description: t("keyboard.effect.breathingDesc"), icon: <Activity size={17} /> },
    { id: "wave", name: t("keyboard.effect.wave"), description: t("keyboard.effect.waveDesc"), icon: <Wind size={17} /> },
    { id: "rainbow", name: t("keyboard.effect.rainbow"), description: t("keyboard.effect.rainbowDesc"), icon: <Sparkles size={17} /> },
    { id: "ripple", name: t("keyboard.effect.ripple"), description: t("keyboard.effect.rippleDesc"), icon: <CircleGauge size={17} /> },
    { id: "raindrop", name: t("keyboard.effect.raindrop"), description: t("keyboard.effect.raindropDesc"), icon: <Snowflake size={17} /> },
    { id: "aurora", name: t("keyboard.effect.aurora"), description: t("keyboard.effect.auroraDesc"), icon: <Moon size={17} /> },
    { id: "fireworks", name: t("keyboard.effect.fireworks"), description: t("keyboard.effect.fireworksDesc"), icon: <Zap size={17} /> },
    { id: "random", name: t("keyboard.effect.random"), description: t("keyboard.effect.randomDesc"), icon: <Keyboard size={17} /> },
    { id: "marquee", name: t("keyboard.effect.marquee"), description: t("keyboard.effect.marqueeDesc"), icon: <ChevronDown size={17} /> },
  ];
  const keyboardRows = [
    ["Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Del"],
    ["~", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Back"],
    ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]"],
    ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter"],
    ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
    ["Ctrl", "Fn", "Win", "Alt", "Space", "Alt", "Menu", "Ctrl", "←", "↑", "↓", "→"],
  ];

  return (
    <div className="keyboard-light-page">
      {feedback ? (
        <div className={`keyboard-feedback glass-panel ${hasError ? "keyboard-feedback-error" : ""}`}>
          <Activity size={17} />
          <span>{feedback}</span>
          <div className="keyboard-live-state">
            {activeSource === "battery" ? <BatteryMedium size={15} /> : <PlugZap size={15} />}
            <span>{powerSourceLabel(activeSource, t)}</span>
            <i />
            <strong>{liveActive ? keyboardEffectLabel(liveBranch.effect, t) : t("common.off")}</strong>
          </div>
        </div>
      ) : null}

      <section className="keyboard-hero glass-panel">
        <div className="keyboard-hero-copy">
          <span className={`keyboard-hero-icon ${liveActive ? "keyboard-hero-icon-on" : ""}`}>
            <Keyboard size={25} />
          </span>
          <div>
            <p className="eyebrow">{t("eyebrow.keyboardLighting")}</p>
            <h2>{t("keyboard.studio")}</h2>
          </div>
        </div>
        <button
          aria-checked={settings.global_enabled}
          className={`lightbar-master-switch ${settings.global_enabled ? "lightbar-master-on" : ""}`}
          disabled={pending || !settings.available}
          onClick={() => setGlobalEnabled(!settings.global_enabled)}
          role="switch"
          type="button"
        >
          <Power size={16} />
          <span>{t("keyboard.master")}</span>
          <strong>{settings.global_enabled ? t("common.on") : t("common.off")}</strong>
        </button>
      </section>

      <section className="keyboard-workspace glass-panel">
        <div className="lightbar-source-tabs">
          {(["ac", "battery"] as PowerSource[]).map((item) => (
            <button
              className={source === item ? "lightbar-source-tab lightbar-source-active" : "lightbar-source-tab"}
              key={item}
              onClick={() => setSource(item)}
              type="button"
            >
              {item === "ac" ? <PlugZap size={16} /> : <BatteryMedium size={16} />}
              <span>{powerSourceLabel(item, t)}</span>
              {settings.active_source === item ? <small>{t("common.current")}</small> : null}
            </button>
          ))}
        </div>

        <div className="keyboard-device-controls">
          <button
            aria-pressed={dashboard.keyboard.fn_lock === true}
            className={dashboard.keyboard.fn_lock ? "keyboard-device-button keyboard-device-on" : "keyboard-device-button"}
            disabled={controlPending !== null || dashboard.keyboard.fn_lock === null}
            onClick={() => void toggleKeyboardControl("fn", dashboard.keyboard.fn_lock)}
            type="button"
          >
            <span><Keyboard size={18} /></span>
            <div><strong>{t("keyboard.fnLock")}</strong><small>{t("keyboard.fnHint")}</small></div>
            <b>{controlPending === "fn" ? t("common.processing") : dashboard.keyboard.fn_lock ? t("keyboard.locked") : t("keyboard.normal")}</b>
          </button>
          <button
            aria-pressed={dashboard.keyboard.super_key_enabled === true}
            className={dashboard.keyboard.super_key_enabled ? "keyboard-device-button keyboard-device-on" : "keyboard-device-button"}
            disabled={controlPending !== null || dashboard.keyboard.super_key_enabled === null}
            onClick={() => void toggleKeyboardControl("win", dashboard.keyboard.super_key_enabled)}
            type="button"
          >
            <span><ShieldCheck size={18} /></span>
            <div><strong>{t("keyboard.winKey")}</strong><small>{t("keyboard.winHint")}</small></div>
            <b>{controlPending === "win" ? t("common.processing") : dashboard.keyboard.super_key_enabled ? t("common.on") : t("common.off")}</b>
          </button>
          <button
            aria-pressed={dashboard.keyboard.touchpad_enabled === true}
            className={dashboard.keyboard.touchpad_enabled ? "keyboard-device-button keyboard-device-on" : "keyboard-device-button"}
            disabled={controlPending !== null || dashboard.keyboard.touchpad_enabled === null}
            onClick={() => void toggleKeyboardControl("touchpad", dashboard.keyboard.touchpad_enabled)}
            type="button"
          >
            <span><Monitor size={18} /></span>
            <div><strong>{t("keyboard.touchpad")}</strong><small>{t("keyboard.touchpadHint")}</small></div>
            <b>{controlPending === "touchpad" ? t("common.processing") : dashboard.keyboard.touchpad_enabled ? t("common.on") : t("common.off")}</b>
          </button>
        </div>

        <div className="keyboard-preview-wrap">
          <div
            className={[
              "keyboard-preview",
              previewActive ? "keyboard-preview-on" : "",
              `keyboard-effect-${branch.effect}`,
              `keyboard-direction-${branch.direction}`,
            ].join(" ")}
            style={{
              "--keyboard-color": hex,
              "--keyboard-speed": `${0.75 + branch.speed * 0.18}s`,
              "--keyboard-brightness": `${branch.brightness / 50}`,
            } as React.CSSProperties}
          >
            <div className="keyboard-aura" />
            <div className="keyboard-keybed">
              {keyboardRows.map((row, rowIndex) => (
                <div className="keyboard-row" key={rowIndex}>
                  {row.map((key, keyIndex) => (
                    <span
                      className={[
                        key === "Space" ? "key-space" : "",
                        ["Tab", "Caps", "Shift", "Enter", "Back"].includes(key) ? "key-wide" : "",
                      ].filter(Boolean).join(" ")}
                      key={`${key}-${keyIndex}`}
                      style={{ "--key-index": rowIndex * 16 + keyIndex } as React.CSSProperties}
                    >
                      {key}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="keyboard-preview-meta">
            <div><span>{t("keyboard.currentEffect")}</span><strong>{keyboardEffectLabel(branch.effect, t)}</strong></div>
            <div><span>{t("common.brightness")}</span><strong>{Math.round((branch.brightness / 50) * 100)}%</strong></div>
            <div><span>{t("common.speed")}</span><strong>{t("keyboard.level", { value: 11 - branch.speed })}</strong></div>
          </div>
        </div>

        <div className="keyboard-editor">
          <div className="keyboard-effect-panel">
            <div className="keyboard-panel-heading">
              <div><p className="eyebrow">{t("dashboard.effect")}</p><h3>{t("keyboard.selectEffect")}</h3></div>
            </div>
            <div className="keyboard-effect-grid">
              {effects.map((effect) => (
                <button
                  aria-pressed={branch.effect === effect.id}
                  className={branch.effect === effect.id ? "keyboard-effect-card keyboard-effect-active" : "keyboard-effect-card"}
                  disabled={pending || !settings.available}
                  key={effect.id}
                  onClick={() => updateBranch({ effect: effect.id })}
                  type="button"
                >
                  <span>{effect.icon}</span>
                  <strong>{effect.name}</strong>
                  <small>{effect.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="keyboard-control-panel">
            <div className="keyboard-panel-heading">
              <div><p className="eyebrow">{t("common.color")}</p><h3>{t("keyboard.colorMotion")}</h3></div>
              <label
                className="lightbar-color-input"
                style={{ background: hex, color: lightbarForeground(hex) }}
              >
                <input
                  aria-label={t("common.color")}
                  disabled={pending || !usesColor}
                  onChange={(event) => updateBranch(hexToRgb(event.currentTarget.value))}
                  type="color"
                  value={hex}
                />
                <span>{usesColor ? hex.toUpperCase() : t("keyboard.autoColor")}</span>
              </label>
            </div>

            <label className="lightbar-range">
              <span><strong>{t("common.brightness")}</strong><small>{Math.round((branch.brightness / 50) * 100)}%</small></span>
              <input
                disabled={pending}
                max="50"
                min="0"
                onChange={(event) => updateBranch({ brightness: Number(event.currentTarget.value) })}
                type="range"
                value={branch.brightness}
              />
            </label>
            <label className="lightbar-range">
              <span><strong>{t("keyboard.motionSpeed")}</strong><small>{t("keyboard.level", { value: 11 - branch.speed })}</small></span>
              <input
                disabled={pending || branch.effect === "solid" || branch.effect === "rainbow"}
                max="10"
                min="0"
                onChange={(event) => updateBranch({ speed: 10 - Number(event.currentTarget.value) })}
                type="range"
                value={10 - branch.speed}
              />
            </label>

            <div className="keyboard-recent">
              <span>{t("keyboard.commonColors")}</span>
              <div>
                {recentColors.map((color) => (
                  <button
                    aria-label={`使用颜色 ${color}`}
                    aria-pressed={color.toLowerCase() === hex.toLowerCase()}
                    className={color.toLowerCase() === hex.toLowerCase() ? "keyboard-color-active" : ""}
                    disabled={pending || !usesColor}
                    key={color}
                    onClick={() => updateBranch(hexToRgb(color))}
                    style={{ background: color }}
                    type="button"
                  />
                ))}
              </div>
            </div>

            {supportsDirection ? (
              <div className="keyboard-direction">
                <span>{t("keyboard.direction")}</span>
                <div>
                  {(["left", "right", "up", "down"] as KeyboardDirection[]).map((direction) => (
                    <button
                      className={branch.direction === direction ? "keyboard-direction-active" : ""}
                      key={direction}
                      onClick={() => updateBranch({ direction })}
                      type="button"
                    >
                      {keyboardDirectionLabel(direction, t)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <StrategySwitch
              checked={branch.enabled}
              disabled={pending || !settings.global_enabled || !settings.available}
              icon={<Power size={18} />}
              label={t("keyboard.enableFor", { source: powerSourceLabel(source, t) })}
              onChange={(enabled) => applySwitch(
                { enabled },
                enabled
                  ? t("keyboard.sourceOn", { source: powerSourceLabel(source, t) })
                  : t("keyboard.sourceOff", { source: powerSourceLabel(source, t) }),
              )}
            />
            {supportsReactive ? (
              <StrategySwitch
                checked={branch.reactive}
                description={t("keyboard.reactiveHint")}
                disabled={pending || !branch.enabled || !settings.available}
                icon={<Zap size={18} />}
                label={t("keyboard.reactive")}
                onChange={(reactive) => updateBranch({ reactive })}
              />
            ) : null}

            <div className="lightbar-actions">
              <button className="secondary-action" disabled={pending} onClick={resetSource} type="button">
                <RotateCcw size={16} />
                {t("common.reset")}
              </button>
              <button
                className="primary-action"
                disabled={pending || !dirty || !settings.available}
                onClick={() => void persist(settings, source, t("keyboard.applied", { source: powerSourceLabel(source, t) }))}
                type="button"
              >
                <Save size={16} />
                {pending ? t("common.applying") : dirty ? t("common.apply") : t("common.applied")}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FanCurvePage({
  dashboard,
  dark,
  profiles,
  setProfiles,
}: {
  dashboard: Dashboard;
  dark: boolean;
  profiles: FanProfiles;
  setProfiles: React.Dispatch<React.SetStateAction<FanProfiles>>;
}) {
  const { t } = useI18n();
  const actualSource = getPowerSource(dashboard);
  const [activeSource, setActiveSource] = useState<PowerSource>(actualSource);
  const [selectedFan, setSelectedFan] = useState<FanKind>("cpu");
  const [selectedPoint, setSelectedPoint] = useState(3);
  const [applyState, setApplyState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [updatingStrategy, setUpdatingStrategy] = useState<StrategyKey | null>(null);
  const [feedback, setFeedback] = useState("");
  // Master switch: true = daemon curve loop, false = firmware fan table of the
  // active power profile's fan mode. Null until the daemon has reported it.
  const [curveControl, setCurveControl] = useState<boolean | null>(
    dashboard.fan_control === "manual" ? true : dashboard.fan_control === "auto" ? false : null,
  );
  const [updatingCurveControl, setUpdatingCurveControl] = useState(false);
  const curveControlOff = curveControl === false;
  const baseFanModes = useRef<Record<PowerSource, string>>({
    ac: normalizeBaseFanMode(dashboard.fan_mode),
    battery: "standard",
  });
  const profile = profiles[activeSource];
  const selectedCurve = profile[selectedFan];
  const point = selectedCurve[selectedPoint] ?? selectedCurve[0];
  const safetyPointSelected = selectedPoint === selectedCurve.length - 1;

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;

    void invoke<Record<PowerSource, unknown>>("get_persisted_fan_profiles")
      .then((saved) => {
        if (!disposed) {
          for (const source of ["ac", "battery"] as const) {
            const entry = saved?.[source] as { mode?: { base_mode?: string } } | undefined;
            const baseMode = entry?.mode?.base_mode;
            if (baseMode) baseFanModes.current[source] = normalizeBaseFanMode(baseMode);
          }
          setProfiles((current) => mergePersistedFanProfiles(current, saved));
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [setProfiles]);

  useEffect(() => {
    setActiveSource(actualSource);
  }, [actualSource]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    void invoke<{ curve_control?: boolean }>("get_fan_curve_control")
      .then((response) => {
        if (!disposed && typeof response?.curve_control === "boolean") setCurveControl(response.curve_control);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    // Whisper/Benchmark report themselves instead of the curve state, so only
    // follow the pushed snapshot when it states manual or auto explicitly.
    // React to snapshot changes only, so a stale snapshot cannot undo a
    // toggle that just succeeded.
    if (dashboard.fan_control === "manual") setCurveControl(true);
    else if (dashboard.fan_control === "auto") setCurveControl(false);
  }, [dashboard.fan_control]);

  const toggleCurveControl = async (enabled: boolean) => {
    if (updatingCurveControl) return;
    const previous = curveControl;
    setCurveControl(enabled);
    setUpdatingCurveControl(true);
    setApplyState("idle");
    setFeedback(t(enabled ? "fan.curveControlEnabling" : "fan.curveControlDisabling"));

    if (!isTauriRuntime()) {
      setFeedback(t(enabled ? "fan.curveControlEnabled" : "fan.curveControlDisabled"));
      setUpdatingCurveControl(false);
      return;
    }

    try {
      const response = await invoke<{ curve_control?: boolean }>("set_fan_curve_control", { enabled });
      if (typeof response?.curve_control === "boolean") setCurveControl(response.curve_control);
      setFeedback(t(enabled ? "fan.curveControlEnabled" : "fan.curveControlDisabled"));
    } catch (error) {
      setCurveControl(previous);
      setApplyState("error");
      setFeedback(t("fan.curveControlFailed", { error: String(error) }));
    } finally {
      setUpdatingCurveControl(false);
    }
  };

  useEffect(() => {
    const mode = dashboard.fan_mode;
    if (mode === "performance" || mode === "standard" || mode === "quiet") {
      baseFanModes.current[actualSource] = mode;
    }
    if (!dashboard.connected) return;

    setProfiles((current) => {
      const currentProfile = current[actualSource];
      const nextPassive = dashboard.passive_cooling ?? currentProfile.passive;
      const nextWhisper = mode === "whisper";
      const nextBenchmark = mode === "benchmark";
      if (
        currentProfile.passive === nextPassive
        && currentProfile.whisper === nextWhisper
        && currentProfile.benchmark === nextBenchmark
      ) {
        return current;
      }
      return {
        ...current,
        [actualSource]: {
          ...currentProfile,
          passive: nextPassive,
          whisper: nextWhisper,
          benchmark: nextBenchmark,
        },
      };
    });
  }, [actualSource, dashboard.connected, dashboard.fan_mode, dashboard.passive_cooling, setProfiles]);

  useEffect(() => {
    if (selectedPoint >= selectedCurve.length) setSelectedPoint(Math.max(0, selectedCurve.length - 1));
  }, [selectedCurve.length, selectedPoint]);

  const updateProfile = (update: Partial<FanProfile>) => {
    setProfiles((current) => ({
      ...current,
      [activeSource]: { ...current[activeSource], ...update },
    }));
    setApplyState("idle");
    setFeedback(t("fan.unsaved"));
  };

  const updateDuty = (nextDuty: number) => {
    const curve = profile[selectedFan];
    // The daemon requires every curve to end at full speed at or below 100°C.
    // Keep that failsafe point immutable instead of allowing an invalid curve
    // to reach the service.
    if (selectedPoint === curve.length - 1) return;
    const lower = selectedPoint > 0 ? curve[selectedPoint - 1].duty : 0;
    const upper = selectedPoint < curve.length - 1 ? curve[selectedPoint + 1].duty : 100;
    const duty = Math.round(clamp(nextDuty, lower, upper));
    const nextCurve = curve.map((item, index) => index === selectedPoint ? { ...item, duty } : item);
    updateProfile({ [selectedFan]: nextCurve });
  };

  const setStrategy = async (key: StrategyKey, enabled: boolean) => {
    if (updatingStrategy) return;
    const source = activeSource;
    const previousProfile = cloneFanProfile(profile);
    let nextProfile: FanProfile;

    if (key === "passive") {
      nextProfile = {
        ...profile,
        passive: enabled,
      };
    } else if (key === "whisper") {
      nextProfile = { ...profile, whisper: enabled, benchmark: enabled ? false : profile.benchmark };
    } else {
      nextProfile = { ...profile, benchmark: enabled, whisper: enabled ? false : profile.whisper };
    }

    if (key !== "passive" && enabled && source === actualSource) {
      const currentMode = dashboard.fan_mode;
      if (currentMode && currentMode !== "whisper" && currentMode !== "benchmark") {
        baseFanModes.current[source] = currentMode;
      }
    }

    const nextProfiles = { ...profiles, [source]: nextProfile };
    setProfiles(nextProfiles);
    setUpdatingStrategy(key);
    setApplyState("idle");
    setFeedback(t("fan.applyingStrategy", { strategy: strategyLabel(key, t) }));

    if (!isTauriRuntime()) {
      setFeedback(t("fan.strategyApplied", { strategy: strategyLabel(key, t) }));
      setUpdatingStrategy(null);
      return;
    }

    try {
      if (key === "passive") {
        await invoke("set_passive_cooling", { enabled, source });
      } else {
        await invoke("set_fan_mode", {
          mode: profileFanMode(nextProfile, baseFanModes.current[source]),
          source,
        });
      }
      const saved = await invoke<Record<PowerSource, unknown>>("get_persisted_fan_profiles").catch(() => null);
      if (saved) setProfiles((current) => mergePersistedFanProfiles(current, saved));
      setFeedback(t("fan.strategyApplied", { strategy: strategyLabel(key, t) }));
    } catch (error) {
      setProfiles((current) => ({ ...current, [source]: previousProfile }));
      setApplyState("error");
      setFeedback(t("fan.strategyFailed", { strategy: strategyLabel(key, t), error: String(error) }));
    } finally {
      setUpdatingStrategy(null);
    }
  };

  const resetProfile = () => {
    setProfiles((current) => ({
      ...current,
      [activeSource]: cloneFanProfile(defaultFanProfiles[activeSource]),
    }));
    setSelectedPoint(3);
    setApplyState("idle");
    setFeedback(t("fan.resetDone", { source: powerSourceLabel(activeSource, t) }));
  };

  const applyProfile = async () => {
    setApplyState("saving");
    if (!isTauriRuntime()) {
      setApplyState("saved");
      setFeedback(t("fan.profileApplied", { source: powerSourceLabel(activeSource, t) }));
      return;
    }

    try {
      await invoke("apply_fan_settings", {
        settings: profileToSettings(profile, baseFanModes.current[activeSource], activeSource),
      });
      const saved = await invoke<Record<PowerSource, unknown>>("get_persisted_fan_profiles").catch(() => null);
      if (saved) setProfiles((current) => mergePersistedFanProfiles(current, saved));
      else setProfiles((current) => ({
        ...current,
        [activeSource]: { ...current[activeSource], whisper: false, benchmark: false },
      }));
      setApplyState("saved");
      setFeedback(t("fan.profileApplied", { source: powerSourceLabel(activeSource, t) }));
    } catch (error) {
      setApplyState("error");
      setFeedback(t("fan.applyFailed", { error: String(error) }));
    }
  };

  return (
    <div className="fan-page">
      <div className={`curve-feedback glass-panel ${applyState === "error" ? "curve-feedback-error" : ""}`}>
        {feedback ? <Activity size={17} /> : null}
        {feedback ? <span>{feedback}</span> : null}
        <div className="live-readings" aria-label={t("fan.liveTemps")}>
          <span><i className="series-dot cpu-dot" />CPU {temperatureLabel(dashboard.cpu.value)}</span>
          <span><i className="series-dot gpu-dot" />GPU {temperatureLabel(dashboard.gpu.value)}</span>
        </div>
      </div>

      <div className="fan-workspace">
        <section
          aria-disabled={curveControlOff}
          className={`curve-panel glass-panel ${curveControlOff ? "curve-panel-disabled" : ""}`}
        >
          <div className="curve-panel-head">
            <div>
              <p className="eyebrow">{t("fan.duty")}</p>
              <h2>{t("fan.tempDuty")}</h2>
            </div>
            <div className="source-tabs" aria-label={t("fan.powerProfiles")}>
              <button
              className={activeSource === "ac" ? "source-tab source-tab-active" : "source-tab"}
                disabled={updatingStrategy !== null}
                onClick={() => setActiveSource("ac")}
                type="button"
              >
                <PlugZap size={15} />
                {t("power.ac")}
                {actualSource === "ac" ? <small>{t("common.current")}</small> : null}
              </button>
              <button
                className={activeSource === "battery" ? "source-tab source-tab-active" : "source-tab"}
                disabled={updatingStrategy !== null}
                onClick={() => setActiveSource("battery")}
                type="button"
              >
                <BatteryMedium size={15} />
                {t("power.battery")}
                {actualSource === "battery" ? <small>{t("common.current")}</small> : null}
              </button>
            </div>
          </div>

          <div className="chart-legend" aria-label={t("fan.curveSelection")}>
            <button
              className={selectedFan === "cpu" ? "legend-button legend-button-active" : "legend-button"}
              onClick={() => setSelectedFan("cpu")}
              type="button"
            >
              <i className="series-dot cpu-dot" />{t("fan.cpuFan")}
            </button>
            <button
              className={selectedFan === "gpu" ? "legend-button legend-button-active" : "legend-button"}
              onClick={() => setSelectedFan("gpu")}
              type="button"
            >
              <i className="series-dot gpu-dot" />{t("fan.gpuFan")}
            </button>
          </div>

          {curveControlOff ? (
            <p className="curve-disabled-banner">
              <Wind size={15} />
              {t("fan.curveDisabledBanner")}
            </p>
          ) : null}

          <div className="curve-editable" inert={curveControlOff ? true : undefined}>
          <FanCurveChart
            cpu={profile.cpu}
            gpu={profile.gpu}
            dark={dark}
            selectedFan={selectedFan}
            selectedPoint={selectedPoint}
            onSelect={(fan, index) => {
              setSelectedFan(fan);
              setSelectedPoint(index);
            }}
          />

          <div className="point-editor">
            <div className="point-list" aria-label={t("fan.points", { fan: selectedFan.toUpperCase() })}>
              {selectedCurve.map((item, index) => (
                <button
                  className={index === selectedPoint ? `point-button point-button-active point-${selectedFan}` : "point-button"}
                  key={item.temp}
                  onClick={() => setSelectedPoint(index)}
                  type="button"
                >
                  <span>{item.temp}°</span>
                  <strong>{item.duty}%</strong>
                </button>
              ))}
            </div>
            <div className="duty-control">
              <div className="duty-copy">
                <span>{selectedFan.toUpperCase()} · {point.temp}°C</span>
                <strong>{safetyPointSelected ? `100% · ${t("fan.safePoint")}` : `${point.duty}%`}</strong>
              </div>
              <button aria-label={t("fan.decreaseDuty")} disabled={safetyPointSelected} onClick={() => updateDuty(point.duty - 1)} type="button">−</button>
              <input
                aria-label={t("fan.duty")}
                disabled={safetyPointSelected}
                max={100}
                min={0}
                onChange={(event) => updateDuty(Number(event.target.value))}
                step={1}
                type="range"
                value={point.duty}
              />
              <button aria-label={t("fan.increaseDuty")} disabled={safetyPointSelected} onClick={() => updateDuty(point.duty + 1)} type="button">＋</button>
            </div>
          </div>
          </div>
        </section>

        <aside className="cooling-rail">
          <section className="curve-master glass-panel">
            <StrategySwitch
              checked={curveControl !== false}
              description={updatingCurveControl
                ? t("common.applying")
                : t(curveControlOff ? "fan.curveControlOffHint" : "fan.curveControlOnHint")}
              disabled={updatingCurveControl || curveControl === null || updatingStrategy !== null}
              icon={<Wind size={17} />}
              label={t("fan.curveControl")}
              onChange={(enabled) => void toggleCurveControl(enabled)}
            />
          </section>

          <section className="strategy-panel glass-panel">
            <div className="strategy-heading">
              <div>
                <p className="eyebrow">{t("section.cooling")}</p>
                <h2>{t("fan.strategy")}</h2>
              </div>
              <ShieldCheck size={19} />
            </div>

            <StrategySwitch
              checked={profile.passive}
              description={updatingStrategy === "passive" ? t("common.applying") : t("fan.passiveHint")}
              disabled={updatingStrategy !== null}
              icon={<Snowflake size={17} />}
              label={t("fan.passive")}
              onChange={(enabled) => void setStrategy("passive", enabled)}
            />
            <StrategySwitch
              checked={profile.whisper}
              description={updatingStrategy === "whisper" ? t("common.applying") : t("fan.whisperHint")}
              disabled={updatingStrategy !== null}
              icon={<Sparkles size={17} />}
              label="NVIDIA WhisperMode"
              onChange={(enabled) => void setStrategy("whisper", enabled)}
            />
            <StrategySwitch
              checked={profile.benchmark}
              description={updatingStrategy === "benchmark" ? t("common.applying") : t("fan.benchmarkHint")}
              disabled={updatingStrategy !== null}
              icon={<Gauge size={17} />}
              label={t("fan.benchmark")}
              onChange={(enabled) => void setStrategy("benchmark", enabled)}
              tone="hot"
            />
          </section>

          <section className={`curve-actions glass-panel ${curveControlOff ? "curve-actions-locked" : ""}`}>
            <div className="profile-summary">
              <span>{t("fan.editing")}</span>
              <strong>{t("fan.plan", { source: powerSourceLabel(activeSource, t) })}</strong>
            </div>
            {curveControlOff
              ? <p className="curve-override-hint">{t("fan.curveDisabledHint")}</p>
              : (profile.whisper || profile.benchmark) && <p className="curve-override-hint">{t("fan.curveOverrideHint")}</p>}
            <div className="action-buttons">
              <button className="secondary-action" disabled={curveControlOff} onClick={resetProfile} type="button">
                <RotateCcw size={15} />{t("common.reset")}
              </button>
              <button className="primary-action" disabled={applyState === "saving" || curveControlOff || updatingCurveControl} onClick={() => void applyProfile()} type="button">
                {applyState === "saved" ? <Check size={16} /> : applyState === "saving" ? <ChevronDown className="saving-icon" size={16} /> : <Save size={16} />}
                {applyState === "saving" ? t("common.applying") : applyState === "saved" ? t("common.applied") : t("common.saveApply")}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function FanCurveChart({
  cpu,
  gpu,
  dark,
  selectedFan,
  selectedPoint,
  onSelect,
}: {
  cpu: FanCurvePoint[];
  gpu: FanCurvePoint[];
  dark: boolean;
  selectedFan: FanKind;
  selectedPoint: number;
  onSelect: (fan: FanKind, index: number) => void;
}) {
  const { t } = useI18n();
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ApexCharts | null>(null);
  const series = useMemo(() => curveSeries(cpu, gpu, t), [cpu, gpu, t]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!elementRef.current) return;
    const textColor = dark ? "#a8a8a8" : "#535353";
    const gridColor = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
    const options: ApexOptions = {
      chart: {
        type: "line",
        height: 336,
        background: "transparent",
        fontFamily: 'Inter, "SF Pro Display", "Segoe UI", sans-serif',
        foreColor: textColor,
        animations: { enabled: true, speed: 240, dynamicAnimation: { speed: 180 } },
        toolbar: { show: false },
        zoom: { enabled: false },
        selection: { enabled: false },
        events: {
          dataPointSelection: (_event, _chart, config) => {
            if (!config || config.seriesIndex < 0 || config.dataPointIndex < 0) return;
            selectRef.current(config.seriesIndex === 0 ? "cpu" : "gpu", config.dataPointIndex);
          },
        },
      },
      series,
      colors: ["#f29d49", "#58a6ff"],
      stroke: { curve: "straight", lineCap: "round", width: 3 },
      markers: {
        size: 5,
        strokeWidth: 2,
        strokeColors: dark ? "#171717" : "#ffffff",
        hover: { size: 7 },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: {
        borderColor: gridColor,
        strokeDashArray: 4,
        padding: { left: 8, right: 16, top: 4, bottom: 0 },
      },
      xaxis: {
        type: "numeric",
        min: 30,
        max: 100,
        tickAmount: 7,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: { colors: textColor, fontSize: "11px" },
          formatter: (value) => `${Math.round(Number(value))}°`,
        },
        title: { text: t("fan.axisTemp"), style: { color: textColor, fontSize: "11px", fontWeight: 500 } },
      },
      yaxis: {
        min: 0,
        max: 100,
        tickAmount: 5,
        forceNiceScale: false,
        labels: {
          style: { colors: [textColor], fontSize: "11px" },
          formatter: (value) => `${Math.round(value)}%`,
        },
        title: { text: t("fan.axisDuty"), style: { color: textColor, fontSize: "11px", fontWeight: 500 } },
      },
      tooltip: {
        shared: false,
        intersect: true,
        theme: dark ? "dark" : "light",
        x: { formatter: (value) => `${Math.round(Number(value))}°C` },
        y: { formatter: (value) => `${Math.round(value)}%` },
      },
    };
    const chart = new ApexCharts(elementRef.current, options);
    chartRef.current = chart;
    void chart.render();
    return () => {
      chartRef.current = null;
      void chart.destroy();
    };
  }, [dark, t]);

  useEffect(() => {
    if (chartRef.current) {
      void chartRef.current.updateOptions({
        series,
        xaxis: { type: "numeric", min: 30, max: 100, tickAmount: 7 },
      }, false, true);
    }
  }, [series]);

  useEffect(() => {
    if (!chartRef.current) return;
    const color = selectedFan === "cpu" ? "#f29d49" : "#58a6ff";
    void chartRef.current.updateOptions({
      markers: {
        discrete: [{
          seriesIndex: selectedFan === "cpu" ? 0 : 1,
          dataPointIndex: selectedPoint,
          fillColor: color,
          strokeColor: dark ? "#ffffff" : "#111111",
          size: 8,
        }],
      },
    }, false, false);
  }, [dark, selectedFan, selectedPoint]);

  return <div className="fan-curve-chart" ref={elementRef} />;
}

function StrategySwitch({
  checked,
  description,
  disabled,
  icon,
  label,
  onChange,
  tone = "default",
}: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
  tone?: "default" | "hot";
}) {
  return (
    <button
      aria-checked={checked}
      className={`strategy-switch ${checked ? "strategy-switch-on" : ""} ${tone === "hot" ? "strategy-switch-hot" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className="strategy-icon">{icon}</span>
      <span className="strategy-copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="switch-track"><i /></span>
    </button>
  );
}

function ThemeSelector({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  const { t } = useI18n();
  const items: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
    { value: "auto", label: t("common.auto"), icon: <Monitor size={14} /> },
    { value: "dark", label: t("common.dark"), icon: <Moon size={14} /> },
    { value: "light", label: t("common.light"), icon: <Sun size={14} /> },
  ];

  return (
    <div className="theme-selector" aria-label={t("settings.colorScheme")}>
      {items.map((item) => (
        <button
          className={value === item.value ? "theme-option theme-option-active" : "theme-option"}
          key={item.value}
          onClick={() => onChange(item.value)}
          type="button"
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function KeyboardLockCard({ locks }: { locks: KeyboardLocks }) {
  const { t } = useI18n();
  return (
    <InfoCard
      icon={<Keyboard size={18} />}
      eyebrow={t("common.status")}
      title={t("dashboard.keyboardLocks")}
      rows={[
        ["Fn", boolLabel(locks.fn_lock, t("dashboard.locked"), t("dashboard.unlocked"))],
        ["Super", boolLabel(locks.super_key_enabled, t("common.enabled"), t("common.disabled"))],
        [t("dashboard.touchpad"), boolLabel(locks.touchpad_enabled, t("common.enabled"), t("dashboard.locked"))],
      ]}
    />
  );
}

function LightbarCard({ lightbar }: { lightbar: LightbarState }) {
  const { t } = useI18n();
  const color = parseRgb(lightbar.color);
  const brightness = lightbar.brightness === null ? null : lightbar.max_brightness ? (lightbar.brightness / lightbar.max_brightness) * 100 : lightbar.brightness;
  const brightnessText = brightness === null ? "--" : `${Math.round(clamp(brightness, 0, 100))}%`;
  const stripStyle = lightbar.rainbow
    ? "linear-gradient(90deg, #ff4b4b, #ffd166, #5ee173, #4cc9f0, #8b5cf6)"
    : color.css;

  return (
    <section className="info-card lightbar-card glass-panel">
      <div className="info-card-head">
        <div className="icon-box">
          <Lightbulb size={18} />
        </div>
        <div>
          <p className="eyebrow">{t("common.status")}</p>
          <h2>{t("dashboard.lightbar")}</h2>
        </div>
      </div>
      <div className="info-card-rows">
        <div className="info-row lightbar-color-row">
          <span>{t("common.color")}</span>
          <div className="lightbar-strip" aria-label={lightbar.rainbow ? t("dashboard.rainbow") : color.label}>
            {[18, 32, 48, 32, 18].map((width, index) => (
              <span
                className="lightbar-segment"
                key={`${width}-${index}`}
                style={{ width, background: stripStyle }}
              />
            ))}
          </div>
        </div>
        <div className="info-row">
          <span>{t("common.brightness")}</span>
          <strong>{brightnessText}</strong>
        </div>
        <div className="info-row">
          <span>{t("dashboard.breathing")}</span>
          <strong>{boolLabel(lightbar.breathing, t("common.on"), t("common.off"))}</strong>
        </div>
        <div className="info-row">
          <span>{t("dashboard.effect")}</span>
          <strong>
            {lightbar.rainbow === null
              ? "--"
              : lightbar.rainbow
                ? t("dashboard.rainbow")
                : lightbar.breathing
                  ? t("dashboard.sleepBreathing")
                  : t("dashboard.steady")}
          </strong>
        </div>
      </div>
    </section>
  );
}

function PerformanceCard({
  fanMode,
  powerMode,
  systemPowerMode,
}: {
  fanMode: string | null;
  powerMode: string | null;
  systemPowerMode: string | null;
}) {
  const { t } = useI18n();
  const mode = powerMode ?? "unknown";
  return (
    <InfoCard
      icon={<Wind size={18} />}
      eyebrow={t("dashboard.performanceStrategy")}
      title={powerModeLabel(mode, t)}
      rows={[
        [t("common.performance"), powerModeLabel(mode, t)],
        [t("dashboard.system"), powerModeLabel(systemPowerMode ?? "unknown", t)],
        [t("dashboard.fan"), powerModeLabel(fanMode ?? "unknown", t)],
      ]}
    />
  );
}

function BatteryCard({ battery }: { battery: BatteryState }) {
  const { t } = useI18n();
  const Icon = battery.charging ? BatteryCharging : Battery;
  return (
    <InfoCard
      icon={<Icon size={18} />}
      eyebrow={t("common.power")}
      title={battery.capacity === null ? t("common.power") : `${battery.capacity}%`}
      rows={[
        [t("common.status"), battery.status ?? "--"],
        [t("common.health"), battery.health ?? "--"],
        [t("common.limit"), battery.charge_limit === null ? "--" : `${battery.charge_limit}%`],
        [t("common.cycles"), battery.cycle_count === null ? "--" : String(battery.cycle_count)],
      ]}
    />
  );
}

function InfoCard({
  icon,
  eyebrow,
  title,
  rows,
  swatch,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  rows: Array<[string, string]>;
  swatch?: string;
}) {
  return (
    <section className="info-card glass-panel">
      <div className="info-card-head">
        <div className="icon-box">{icon}</div>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {swatch ? <span className="lightbar-swatch" style={{ background: swatch }} /> : null}
      </div>
      <div className="info-card-rows">
        {rows.map(([label, value]) => (
          <div className="info-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function TitleBar() {
  const { t } = useI18n();
  const appWindow = isTauriRuntime() ? getCurrentWindow() : null;

  const onDrag = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !appWindow) return;
    if (event.detail === 2) {
      await appWindow.toggleMaximize();
      return;
    }
    await appWindow.startDragging();
  };

  const runWindowAction = async (event: React.MouseEvent<HTMLButtonElement>, action: () => Promise<void>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await action();
    } catch (error) {
      console.error("Window action failed", error);
    }
  };

  const closeWindow = async () => {
    if (!appWindow) return;
    await appWindow.close();
  };

  return (
    <div className="titlebar">
      <div className="titlebar-drag" onMouseDown={onDrag}>
        <img className="titlebar-icon" src={brandIcon} alt="" />
        <span>Intel NUC Control Center</span>
      </div>
      <div className="window-controls">
        <button aria-label={t("window.minimize")} onClick={(event) => void runWindowAction(event, () => appWindow?.minimize() ?? Promise.resolve())}>
          <Minimize2 size={15} />
        </button>
        <button aria-label={t("window.maximize")} onClick={(event) => void runWindowAction(event, () => appWindow?.toggleMaximize() ?? Promise.resolve())}>
          <Maximize2 size={14} />
        </button>
        <button aria-label={t("window.close")} className="close-control" onClick={(event) => void runWindowAction(event, closeWindow)}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function ResizeHandles() {
  const directions: Array<{ className: string; direction: ResizeDirection }> = [
    { className: "resize-handle resize-n", direction: "North" },
    { className: "resize-handle resize-e", direction: "East" },
    { className: "resize-handle resize-s", direction: "South" },
    { className: "resize-handle resize-w", direction: "West" },
    { className: "resize-handle resize-ne", direction: "NorthEast" },
    { className: "resize-handle resize-se", direction: "SouthEast" },
    { className: "resize-handle resize-sw", direction: "SouthWest" },
    { className: "resize-handle resize-nw", direction: "NorthWest" },
  ];

  const startResize = async (event: React.MouseEvent<HTMLDivElement>, direction: ResizeDirection) => {
    if (event.button !== 0 || !isTauriRuntime()) return;
    event.preventDefault();
    await getCurrentWindow().startResizeDragging(direction);
  };

  return (
    <>
      {directions.map((item) => (
        <div
          aria-hidden="true"
          className={item.className}
          key={item.direction}
          onMouseDown={(event) => void startResize(event, item.direction)}
        />
      ))}
    </>
  );
}

function SensorCard({ metric, tone }: { metric: SensorMetric; tone: "cpu" | "gpu" }) {
  const { t } = useI18n();
  const temperature = clamp(metric.value ?? 0, 0, 100);
  const load = clamp(metric.load ?? 0, 0, 100);
  const tempText = metric.value === null ? "--" : `${Math.round(metric.value)}°${metric.unit}`;
  const loadText = metric.load === null ? "--" : `${Math.round(metric.load)}%`;
  const asleep = metric.active === false;
  const freqText = asleep
    ? t("sensor.gpuSleeping", { state: metric.power_state ?? "D3" })
    : metric.frequency_mhz === null
      ? "--"
      : `${(metric.frequency_mhz / 1000).toFixed(2)} GHz`;

  return (
    <Card className={`metric-card glass-card ${tone}`}>
      <Card.Header className="card-heading">
        <div className="icon-box">{tone === "cpu" ? <Cpu size={20} /> : <Gauge size={20} />}</div>
        <div>
          <Card.Title>{metric.label}</Card.Title>
          <Card.Description>{t("sensor.summary")}</Card.Description>
        </div>
      </Card.Header>
      <Card.Content className="sensor-content">
        <div className="sensor-primary">
          <strong>{tempText}</strong>
          <span>{t("sensor.currentTemp")}</span>
        </div>
        <div className="sensor-lines">
          <MetricLine icon={<Thermometer size={15} />} label={t("common.temperature")} value={tempText} bar={temperature} />
          <MetricLine icon={<Activity size={15} />} label={t("common.usage")} value={loadText} bar={load} />
          <MetricLine icon={<Zap size={15} />} label={t("common.frequency")} value={freqText} />
        </div>
      </Card.Content>
    </Card>
  );
}

function FanCard({ fan }: { fan: FanMetric }) {
  const { t } = useI18n();
  const percent = clamp(fan.percent ?? 0, 0, 100);
  const dutyText = fan.percent === null ? "--%" : `${Math.round(percent)}%`;
  const rpmText = fan.rpm === null ? "-- RPM" : `${fan.rpm} RPM`;
  const rpmForAnimation = fan.rpm ?? 0;
  const isSpinning = rpmForAnimation > 0;
  const spinRatio = clamp(rpmForAnimation / 5200, 0, 1);
  const durationSeconds = 2.6 - spinRatio * 2.2;
  const duration = `${Math.max(0.32, durationSeconds).toFixed(2)}s`;

  return (
    <Card className="fan-card glass-card">
      <Card.Header className="card-heading">
        <div className="icon-box">
          <Wind size={20} />
        </div>
        <div>
          <Card.Title>{fanDisplayLabel(fan.label, t)}</Card.Title>
        </div>
      </Card.Header>
      <Card.Content className="fan-content">
        <div
          className={isSpinning ? "fan-visual fan-visual-spinning" : "fan-visual fan-visual-stopped"}
          style={{ "--fan-duration": duration } as React.CSSProperties}
        >
          <div className="fan-hub" />
          <div className="fan-blade blade-a" />
          <div className="fan-blade blade-b" />
          <div className="fan-blade blade-c" />
        </div>
        <div className="fan-readout">
          <strong>{rpmText}</strong>
          <span>{t("fan.axisDuty")} {dutyText}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}

function MetricLine({
  icon,
  label,
  value,
  bar,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bar?: number;
}) {
  return (
    <div className="metric-line">
      <div className="metric-line-main">
        <span>{icon}</span>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {bar !== undefined ? (
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${clamp(bar, 0, 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function normalizeDashboard(next: Dashboard): Dashboard {
  return {
    ...fallbackDashboard,
    ...next,
    cpu: { ...fallbackDashboard.cpu, ...next.cpu },
    gpu: { ...fallbackDashboard.gpu, ...next.gpu },
    fans: next.fans?.length ? next.fans : fallbackDashboard.fans,
    keyboard: { ...fallbackDashboard.keyboard, ...next.keyboard },
    keyboard_light: next.keyboard_light ?? fallbackDashboard.keyboard_light,
    lightbar: { ...fallbackDashboard.lightbar, ...next.lightbar },
    battery: { ...fallbackDashboard.battery, ...next.battery },
  };
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function infoValue(value: string | null | undefined) {
  return value?.trim() || "--";
}

function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return "--";
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** exponent;
  return `${amount >= 100 ? amount.toFixed(0) : amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${units[exponent]}`;
}

function formatCount(value: number | null, t: Translator, key: "common.countTimes" | "common.countItems") {
  return value === null ? "--" : t(key, { count: value.toLocaleString() });
}

function formatBatteryCapacity(value: number | null, unit: string | null) {
  if (value === null || !unit) return "--";
  if (unit === "uWh") return `${(value / 1_000_000).toFixed(2)} Wh`;
  if (unit === "uAh") return `${(value / 1_000_000).toFixed(2)} Ah`;
  return `${value} ${unit}`;
}

function boolLabel(value: boolean | null, trueLabel: string, falseLabel: string) {
  if (value === null) return "--";
  return value ? trueLabel : falseLabel;
}

function powerModeLabel(mode: string, t: Translator) {
  if (mode === "performance") return t("common.performance");
  if (mode === "quiet" || mode === "silent") return t("common.quiet");
  if (mode === "whisper") return "WhisperMode";
  if (mode === "benchmark") return t("fan.benchmark");
  if (mode === "power-saver" || mode === "powersave" || mode === "power_saver" || mode === "save-power") return t("common.saver");
  if (mode === "standard" || mode === "balanced" || mode === "balance") return t("common.balanced");
  return "--";
}

function fanDisplayLabel(label: string, t: Translator) {
  if (label.toLowerCase().includes("cpu")) return t("fan.cpuFan");
  if (label.toLowerCase().includes("gpu")) return t("fan.gpuFan");
  return label;
}

function parseRgb(value: string | null) {
  if (!value) return { label: "--", css: "transparent" };
  const parts = value
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  if (parts.length < 3) return { label: value, css: "transparent" };
  const [red, green, blue] = parts.map((part) => clamp(part, 0, 255));
  return {
    label: `${red} ${green} ${blue}`,
    css: `rgb(${red}, ${green}, ${blue})`,
  };
}

function makeCurve(duties: number[]): FanCurvePoint[] {
  return curveTemps.map((temp, index) => ({ temp, duty: duties[index] ?? 0 }));
}

function cloneFanProfile(profile: FanProfile): FanProfile {
  return {
    ...profile,
    cpu: profile.cpu.map((point) => ({ ...point })),
    gpu: profile.gpu.map((point) => ({ ...point })),
  };
}

function mergePersistedFanProfiles(current: FanProfiles, saved: Record<PowerSource, unknown>): FanProfiles {
  const next: FanProfiles = {
    ac: cloneFanProfile(current.ac),
    battery: cloneFanProfile(current.battery),
  };

  for (const source of ["ac", "battery"] as const) {
    const entry = saved?.[source] as Record<string, unknown> | undefined;
    if (!entry) continue;

    for (const fan of ["cpu", "gpu"] as const) {
      const response = entry[fan] as Record<string, unknown> | undefined;
      const curve = response?.curve as { points?: Array<{ temp?: number; pwm?: number }> } | undefined;
      if (response?.persisted !== true || !Array.isArray(curve?.points) || curve.points.length < 2) continue;
      next[source][fan] = curve.points.map((point) => ({
        temp: Math.round(clamp(Number(point.temp), 20, 110)),
        duty: Math.round(clamp(Number(point.pwm) / 2.55, 0, 100)),
      }));
      next[source][fan][next[source][fan].length - 1].duty = 100;
    }

    const modeResponse = entry.mode as Record<string, unknown> | undefined;
    if (modeResponse?.persisted === true && typeof modeResponse.mode === "string") {
      next[source].whisper = modeResponse.mode === "whisper";
      next[source].benchmark = modeResponse.mode === "benchmark";
    }
    const passiveResponse = entry.passive as Record<string, unknown> | undefined;
    if (passiveResponse?.persisted === true && typeof passiveResponse.passive_cooling === "boolean") {
      next[source].passive = passiveResponse.passive_cooling;
    }
  }

  return next;
}

function curveSeries(cpu: FanCurvePoint[], gpu: FanCurvePoint[], t: ReturnType<typeof useI18n>["t"]) {
  return [
    { name: t("fan.cpuFan"), data: cpu.map((point) => ({ x: point.temp, y: point.duty })) },
    { name: t("fan.gpuFan"), data: gpu.map((point) => ({ x: point.temp, y: point.duty })) },
  ];
}

function toPwmPoint(point: FanCurvePoint) {
  const duty = clamp(point.duty, 0, 100);
  return { temp: point.temp, pwm: duty >= 100 ? 255 : Math.round(duty * 2.55) };
}

function curveToPwmPoints(curve: FanCurvePoint[]) {
  return curve.map((point, index) => (
    index === curve.length - 1
      ? { temp: point.temp, pwm: 255 }
      : toPwmPoint(point)
  ));
}

function profileFanMode(profile: FanProfile, fallbackMode = "standard") {
  return profile.benchmark ? "benchmark" : profile.whisper ? "whisper" : fallbackMode;
}

function profileToSettings(profile: FanProfile, fallbackMode = "standard", source: PowerSource = "ac") {
  return {
    cpuPoints: curveToPwmPoints(profile.cpu),
    gpuPoints: curveToPwmPoints(profile.gpu),
    fanMode: normalizeBaseFanMode(fallbackMode),
    passiveCooling: profile.passive,
    source,
  };
}

function strategyLabel(key: StrategyKey, t: Translator) {
  if (key === "passive") return t("fan.passive");
  if (key === "whisper") return "NVIDIA WhisperMode";
  return t("fan.benchmark");
}

function normalizeBaseFanMode(mode: string | null) {
  if (mode === "performance" || mode === "quiet" || mode === "standard") return mode;
  return "standard";
}

function getPowerSource(dashboard: Dashboard): PowerSource {
  if (dashboard.active_source === "ac" || dashboard.active_source === "battery") {
    return dashboard.active_source;
  }
  const status = dashboard.battery.status?.toLowerCase() ?? "";
  return status.includes("discharg") ? "battery" : "ac";
}

function powerSourceLabel(source: PowerSource, t: Translator) {
  return source === "ac" ? t("power.ac") : t("power.battery");
}

function temperatureLabel(value: number | null) {
  return value === null ? "--" : `${Math.round(value)}°C`;
}

function normalizePowerProfiles(next: PowerProfilesState): PowerProfilesState {
  if (!next || !Array.isArray(next.profiles) || next.profiles.length !== 3) {
    return defaultPowerProfiles;
  }
  return {
    active_profile: clamp(Math.round(Number(next.active_profile)), 1, 3),
    active_profile_name: powerProfileName(next.active_profile),
    active_source: next.active_source === "battery" ? "battery" : "ac",
    profiles: next.profiles.map((profile, index) => ({
      profile: clamp(Math.round(Number(profile.profile ?? index + 1)), 1, 3),
      name: powerProfileName(profile.profile ?? index + 1),
      ac: normalizePowerBranch(profile.ac),
      battery: normalizePowerBranch(profile.battery),
    })),
  };
}

function normalizeLightbarSettings(next: LightbarSettingsState): LightbarSettingsState {
  const normalizeSource = (source: PowerSource): LightbarProfile => {
    const fallback = defaultLightbarSettings.sources[source];
    const value = next?.sources?.[source];
    return {
      enabled: typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
      brightness: clamp(Math.round(Number(value?.brightness ?? fallback.brightness)), 0, 255),
      red: clamp(Math.round(Number(value?.red ?? fallback.red)), 0, 255),
      green: clamp(Math.round(Number(value?.green ?? fallback.green)), 0, 255),
      blue: clamp(Math.round(Number(value?.blue ?? fallback.blue)), 0, 255),
      rainbow: typeof value?.rainbow === "boolean" ? value.rainbow : fallback.rainbow,
      breathing: typeof value?.breathing === "boolean" ? value.breathing : fallback.breathing,
    };
  };

  return {
    global_enabled: typeof next?.global_enabled === "boolean" ? next.global_enabled : true,
    active_source: next?.active_source === "battery" ? "battery" : "ac",
    sources: {
      ac: normalizeSource("ac"),
      battery: normalizeSource("battery"),
    },
  };
}

function normalizeKeyboardLightSettings(
  next: KeyboardLightSettingsState,
): KeyboardLightSettingsState {
  const effects: KeyboardEffect[] = [
    "solid", "breathing", "wave", "random", "rainbow",
    "ripple", "marquee", "raindrop", "aurora", "fireworks",
  ];
  const directions: KeyboardDirection[] = ["left", "right", "up", "down"];
  const normalizeSource = (source: PowerSource): KeyboardLightProfile => {
    const fallback = defaultKeyboardLightSettings.sources[source];
    const value = next?.sources?.[source];
    return {
      enabled: typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
      brightness: clamp(Math.round(Number(value?.brightness ?? fallback.brightness)), 0, 50),
      red: clamp(Math.round(Number(value?.red ?? fallback.red)), 0, 255),
      green: clamp(Math.round(Number(value?.green ?? fallback.green)), 0, 255),
      blue: clamp(Math.round(Number(value?.blue ?? fallback.blue)), 0, 255),
      effect: effects.includes(value?.effect) ? value.effect : fallback.effect,
      speed: clamp(Math.round(Number(value?.speed ?? fallback.speed)), 0, 10),
      direction: directions.includes(value?.direction) ? value.direction : fallback.direction,
      reactive: typeof value?.reactive === "boolean" ? value.reactive : fallback.reactive,
    };
  };

  return {
    available: typeof next?.available === "boolean" ? next.available : false,
    global_enabled:
      typeof next?.global_enabled === "boolean" ? next.global_enabled : true,
    active_source: next?.active_source === "battery" ? "battery" : "ac",
    sources: {
      ac: normalizeSource("ac"),
      battery: normalizeSource("battery"),
    },
  };
}

function keyboardLightSettingsEqual(
  left: KeyboardLightSettingsState,
  right: KeyboardLightSettingsState,
) {
  const sameSource = (source: PowerSource) => {
    const a = left.sources[source];
    const b = right.sources[source];
    return a.enabled === b.enabled
      && a.brightness === b.brightness
      && a.red === b.red
      && a.green === b.green
      && a.blue === b.blue
      && a.effect === b.effect
      && a.speed === b.speed
      && a.direction === b.direction
      && a.reactive === b.reactive;
  };

  return left.available === right.available
    && left.global_enabled === right.global_enabled
    && left.active_source === right.active_source
    && sameSource("ac")
    && sameSource("battery");
}

function keyboardLightHex(profile: KeyboardLightProfile) {
  const channel = (value: number) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(profile.red)}${channel(profile.green)}${channel(profile.blue)}`;
}

function keyboardEffectLabel(effect: KeyboardEffect, t: Translator) {
  return t(`keyboard.effect.${effect}` as Parameters<Translator>[0]);
}

function keyboardDirectionLabel(direction: KeyboardDirection, t: Translator) {
  return t(`keyboard.direction.${direction}` as Parameters<Translator>[0]);
}

function readRecentKeyboardColors() {
  const defaults = ["#ff7030", "#8b5cf6", "#4f8cff", "#22d3a7", "#f2d24f", "#f4f4f5"];
  try {
    const saved = JSON.parse(window.localStorage.getItem("nuc-keyboard-recent-colors") ?? "[]");
    if (Array.isArray(saved)) {
      const colors = saved.filter((value): value is string => /^#[0-9a-f]{6}$/i.test(value));
      return [...new Set([...colors, ...defaults])].slice(0, 7);
    }
  } catch {
    // Recent colors are optional.
  }
  return defaults;
}

function persistRecentKeyboardColor(color: string, current: string[]) {
  const next = [
    color.toLowerCase(),
    ...current.filter((item) => item.toLowerCase() !== color.toLowerCase()),
  ].slice(0, 7);
  try {
    window.localStorage.setItem("nuc-keyboard-recent-colors", JSON.stringify(next));
  } catch {
    // Hardware persistence is independent of the optional color history.
  }
  return next;
}

function lightbarSettingsEqual(left: LightbarSettingsState, right: LightbarSettingsState) {
  const sameSource = (source: PowerSource) => {
    const leftSource = left.sources[source];
    const rightSource = right.sources[source];
    return leftSource.enabled === rightSource.enabled
      && leftSource.brightness === rightSource.brightness
      && leftSource.red === rightSource.red
      && leftSource.green === rightSource.green
      && leftSource.blue === rightSource.blue
      && leftSource.rainbow === rightSource.rainbow
      && leftSource.breathing === rightSource.breathing;
  };

  return left.global_enabled === right.global_enabled
    && left.active_source === right.active_source
    && sameSource("ac")
    && sameSource("battery");
}

function lightbarHex(profile: LightbarProfile) {
  const channel = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(profile.red)}${channel(profile.green)}${channel(profile.blue)}`;
}

function hexToRgb(hex: string): Pick<LightbarProfile, "red" | "green" | "blue"> {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    green: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    blue: Number.parseInt(normalized.slice(4, 6), 16) || 0,
  };
}

function lightbarForeground(hex: string) {
  const { red, green, blue } = hexToRgb(hex);
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? "#ffffff" : "#0b0f14";
}

function readRecentLightbarColors() {
  const defaults = ["#ff8430", "#5096ff", "#8b5cf6", "#22c55e", "#f8d34f", "#f4f4f5"];
  try {
    const saved = JSON.parse(window.localStorage.getItem("nuc-lightbar-recent-colors") ?? "[]");
    if (Array.isArray(saved)) {
      const colors = saved.filter((value): value is string => /^#[0-9a-f]{6}$/i.test(value));
      return [...new Set([...colors, ...defaults])].slice(0, 7);
    }
  } catch {
    // Use the curated defaults when local storage is unavailable or malformed.
  }
  return defaults;
}

function persistRecentLightbarColor(color: string, current: string[]) {
  const next = [color.toLowerCase(), ...current.filter((item) => item.toLowerCase() !== color.toLowerCase())].slice(0, 7);
  try {
    window.localStorage.setItem("nuc-lightbar-recent-colors", JSON.stringify(next));
  } catch {
    // The color history is optional; hardware persistence still succeeded.
  }
  return next;
}

function normalizePowerBranch(branch: PowerProfileBranch | undefined): PowerProfileBranch {
  const powerMode = normalizePowerLevel(branch?.power_mode_name);
  const fanMode = normalizeFanLevel(branch?.fan_mode_name);
  return {
    power_mode: powerLevelNumber(powerMode),
    power_mode_name: powerMode,
    fan_mode: fanLevelNumber(fanMode),
    fan_mode_name: fanMode,
  };
}

function updatePowerProfileLevel(
  state: PowerProfilesState,
  profileNumber: number,
  source: PowerSource,
  mode: PowerLevel,
): PowerProfilesState {
  return {
    ...state,
    profiles: state.profiles.map((profile) => profile.profile === profileNumber
      ? {
          ...profile,
          [source]: {
            ...profile[source],
            power_mode: powerLevelNumber(mode),
            power_mode_name: mode,
          },
        }
      : profile),
  };
}

function updatePowerProfileFanLevel(
  state: PowerProfilesState,
  profileNumber: number,
  source: PowerSource,
  mode: FanLevel,
): PowerProfilesState {
  return {
    ...state,
    profiles: state.profiles.map((profile) => profile.profile === profileNumber
      ? {
          ...profile,
          [source]: {
            ...profile[source],
            fan_mode: fanLevelNumber(mode),
            fan_mode_name: mode,
          },
        }
      : profile),
  };
}

function normalizePowerLevel(value: string | undefined): PowerLevel {
  if (value === "performance") return "performance";
  if (value === "battery_saver" || value === "power_saver" || value === "quiet") return "battery_saver";
  return "balanced";
}

function powerLevelNumber(mode: PowerLevel) {
  return mode === "performance" ? 1 : mode === "balanced" ? 2 : 3;
}

function powerLevelLabel(mode: PowerLevel, t: Translator) {
  return mode === "performance"
    ? t("power.profile.performanceKicker")
    : mode === "balanced"
      ? t("power.profile.balancedKicker")
      : t("power.profile.saverKicker");
}

function normalizeFanLevel(value: string | undefined): FanLevel {
  if (value === "performance") return "performance";
  if (value === "quiet" || value === "silent") return "quiet";
  return "standard";
}

function fanLevelNumber(mode: FanLevel) {
  return mode === "performance" ? 1 : mode === "standard" ? 2 : 3;
}

function fanLevelLabel(mode: FanLevel, t: Translator) {
  return mode === "performance"
    ? t("common.performance")
    : mode === "standard"
      ? t("common.standard")
      : t("common.quiet");
}

function powerProfileName(profile: number): PowerLevel {
  return profile === 1 ? "performance" : profile === 3 ? "battery_saver" : "balanced";
}

function powerProfileTitle(profile: number, t: Translator) {
  return profile === 1
    ? t("power.profile.performance")
    : profile === 3
      ? t("power.profile.saver")
      : t("power.profile.balanced");
}

function powerProfileKicker(profile: number, t: Translator) {
  return profile === 1
    ? t("power.profile.performanceKicker")
    : profile === 3
      ? t("power.profile.saverKicker")
      : t("power.profile.balancedKicker");
}

function powerProfileDescription(profile: number, t: Translator) {
  if (profile === 1) return t("power.profile.performanceDesc");
  if (profile === 3) return t("power.profile.saverDesc");
  return t("power.profile.balancedDesc");
}

export default App;
