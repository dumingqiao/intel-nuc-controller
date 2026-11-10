//! Locally sampled CPU/GPU metrics that the uniwilld snapshot does not carry.
//!
//! The NVIDIA dGPU uses runtime D3 power management. Measured on the X15:
//!
//! - querying it through `nvidia-smi`/NVML while it is in D3cold wakes it
//!   (about 1.2 s) and keeps it powered for about 20 s;
//! - an awake, idle GPU suspends about 6 s after the last client exits, so
//!   querying it every 2 s keeps it awake indefinitely.
//!
//! The sampler therefore never queries a suspended GPU (the sysfs power files
//! it checks never wake the device) and only keeps polling once it has seen
//! the GPU stay awake through a pause longer than the idle timeout, which
//! means another client is using it.

use std::{
    fs,
    io::{ErrorKind, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant},
};

const SAMPLE_INTERVAL: Duration = Duration::from_secs(2);
const NVIDIA_SMI_TIMEOUT: Duration = Duration::from_secs(3);
/// After nvidia-smi is missing or keeps failing, stop spawning it for a while.
const NVIDIA_SMI_RETRY_AFTER: Duration = Duration::from_secs(300);
const NVIDIA_VENDOR_ID: &str = "0x10de";
const PCI_DEVICES: &str = "/sys/bus/pci/devices";
/// Longer than the ~6 s the driver waits before suspending an idle GPU.
const GPU_PROBE_GAP: Duration = Duration::from_secs(8);
/// How long to keep polling after the GPU proved to be in use by others.
const GPU_BUSY_WINDOW: Duration = Duration::from_secs(20);

#[derive(Clone, Debug, Default, PartialEq)]
pub struct LocalMetrics {
    pub cpu_load: Option<f64>,
    pub cpu_frequency_mhz: Option<u64>,
    pub gpu_load: Option<f64>,
    pub gpu_frequency_mhz: Option<u64>,
    /// PCI power state such as `D0` or `D3cold`, when the kernel exposes it.
    pub gpu_power_state: Option<String>,
    /// `Some(false)` while the dGPU is runtime-suspended, `None` without a dGPU.
    pub gpu_active: Option<bool>,
}

static LATEST: Mutex<Option<LocalMetrics>> = Mutex::new(None);

pub fn latest() -> LocalMetrics {
    LATEST
        .lock()
        .ok()
        .and_then(|latest| latest.clone())
        .unwrap_or_default()
}

/// Samples metrics every two seconds and calls `on_change` whenever a value
/// visible on the dashboard changes.
pub fn start<F>(closing: &'static AtomicBool, on_change: F)
where
    F: Fn(&LocalMetrics) + Send + 'static,
{
    thread::spawn(move || {
        let mut sampler = Sampler::default();
        while !closing.load(Ordering::Relaxed) {
            let next = sampler.sample();
            let changed = match LATEST.lock() {
                Ok(mut latest) => {
                    let changed = latest.as_ref() != Some(&next);
                    *latest = Some(next.clone());
                    changed
                }
                Err(_) => false,
            };
            if changed {
                on_change(&next);
            }
            thread::sleep(SAMPLE_INTERVAL);
        }
    });
}

#[derive(Default)]
struct Sampler {
    previous_cpu_times: Option<CpuTimes>,
    nvidia_device: Option<PathBuf>,
    nvidia_smi_blocked_until: Option<Instant>,
    gpu_poll: GpuPollPolicy,
    last_gpu_sample: Option<GpuSample>,
}

/// Decides when querying an awake GPU cannot be what keeps it awake.
#[derive(Debug, Default)]
struct GpuPollPolicy {
    last_query: Option<Instant>,
    busy_until: Option<Instant>,
}

impl GpuPollPolicy {
    /// Called while the GPU is awake: returns whether to query it now.
    fn should_query(&mut self, now: Instant) -> bool {
        if self.busy_until.is_some_and(|until| now < until) {
            return true;
        }
        // Awake although we have not touched it for longer than the idle
        // timeout: someone else is using the GPU.
        let quiet_long_enough = self
            .last_query
            .is_none_or(|last| now.duration_since(last) >= GPU_PROBE_GAP);
        if quiet_long_enough {
            self.busy_until = Some(now + GPU_BUSY_WINDOW);
        }
        quiet_long_enough
    }

    fn queried(&mut self, now: Instant) {
        self.last_query = Some(now);
    }

    fn gpu_suspended(&mut self) {
        self.busy_until = None;
    }
}

impl Sampler {
    fn sample(&mut self) -> LocalMetrics {
        let cpu_times = read_cpu_times();
        let cpu_load = match (self.previous_cpu_times, cpu_times) {
            (Some(previous), Some(current)) => cpu_load_between(previous, current),
            _ => None,
        };
        if cpu_times.is_some() {
            self.previous_cpu_times = cpu_times;
        }

        let mut metrics = LocalMetrics {
            cpu_load,
            cpu_frequency_mhz: read_cpu_frequency_mhz(),
            ..LocalMetrics::default()
        };
        self.sample_gpu(&mut metrics);
        metrics
    }

    fn sample_gpu(&mut self, metrics: &mut LocalMetrics) {
        if self
            .nvidia_device
            .as_ref()
            .is_none_or(|device| !device.exists())
        {
            self.nvidia_device = find_nvidia_gpu(Path::new(PCI_DEVICES));
        }
        let Some(device) = self.nvidia_device.clone() else {
            return;
        };

        metrics.gpu_power_state = read_trimmed(&device.join("power_state"));
        let active = gpu_runtime_active(&device);
        metrics.gpu_active = Some(active);
        if !active {
            // A powered-off GPU does no work; report that instead of waking it.
            metrics.gpu_load = Some(0.0);
            self.gpu_poll.gpu_suspended();
            self.last_gpu_sample = None;
            return;
        }

        // Between polls (and during the probe gap) keep showing the last values.
        if let Some(sample) = &self.last_gpu_sample {
            metrics.gpu_frequency_mhz = sample.frequency_mhz;
            metrics.gpu_load = sample.load;
        }
        if self
            .nvidia_smi_blocked_until
            .is_some_and(|until| Instant::now() < until)
        {
            return;
        }
        if !self.gpu_poll.should_query(Instant::now()) {
            return;
        }
        // Re-check right before spawning to keep the wake-up race window small.
        if !gpu_runtime_active(&device) {
            metrics.gpu_active = Some(false);
            metrics.gpu_load = Some(0.0);
            metrics.gpu_frequency_mhz = None;
            self.gpu_poll.gpu_suspended();
            self.last_gpu_sample = None;
            return;
        }

        let bus_id = device
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string();
        let result = query_nvidia_smi(&bus_id);
        self.gpu_poll.queried(Instant::now());
        match result {
            Ok(sample) => {
                metrics.gpu_frequency_mhz = sample.frequency_mhz;
                metrics.gpu_load = sample.load;
                self.last_gpu_sample = Some(sample);
                self.nvidia_smi_blocked_until = None;
            }
            Err(NvidiaSmiError::Missing) => {
                self.nvidia_smi_blocked_until = Some(Instant::now() + NVIDIA_SMI_RETRY_AFTER);
            }
            Err(NvidiaSmiError::Failed) => {}
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct CpuTimes {
    busy: u64,
    total: u64,
}

fn read_cpu_times() -> Option<CpuTimes> {
    parse_cpu_times(&fs::read_to_string("/proc/stat").ok()?)
}

fn parse_cpu_times(stat: &str) -> Option<CpuTimes> {
    let line = stat.lines().find(|line| line.starts_with("cpu "))?;
    let values: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|part| part.parse().ok())
        .collect();
    if values.len() < 5 {
        return None;
    }
    // user nice system idle iowait irq softirq steal [guest guest_nice]
    // guest time is already included in user/nice, so leave it out of total.
    let total: u64 = values.iter().take(8).sum();
    let idle = values[3] + values[4];
    Some(CpuTimes {
        busy: total.saturating_sub(idle),
        total,
    })
}

/// Usage over the interval between two samples, not the average since boot.
fn cpu_load_between(previous: CpuTimes, current: CpuTimes) -> Option<f64> {
    let total = current.total.checked_sub(previous.total)?;
    let busy = current.busy.checked_sub(previous.busy)?;
    if total == 0 {
        return None;
    }
    Some((busy as f64 / total as f64 * 100.0).clamp(0.0, 100.0))
}

/// Average current frequency across all online cores.
fn read_cpu_frequency_mhz() -> Option<u64> {
    let entries = fs::read_dir("/sys/devices/system/cpu").ok()?;
    let mut sum_khz = 0u64;
    let mut count = 0u64;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name
            .strip_prefix("cpu")
            .is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
        {
            continue;
        }
        if let Some(khz) = read_trimmed(&entry.path().join("cpufreq/scaling_cur_freq"))
            .and_then(|value| value.parse::<u64>().ok())
        {
            sum_khz += khz;
            count += 1;
        }
    }
    (count > 0).then(|| sum_khz / count / 1000)
}

fn find_nvidia_gpu(pci_devices: &Path) -> Option<PathBuf> {
    let mut devices: Vec<PathBuf> = fs::read_dir(pci_devices)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            read_trimmed(&path.join("vendor")).as_deref() == Some(NVIDIA_VENDOR_ID)
                // PCI class 0x03xxxx: display controller (skips the HDMI audio function).
                && read_trimmed(&path.join("class")).is_some_and(|class| class.starts_with("0x03"))
        })
        .collect();
    devices.sort();
    devices.into_iter().next()
}

fn gpu_runtime_active(device: &Path) -> bool {
    // "unsupported" means runtime PM is off, so the GPU is always powered.
    matches!(
        read_trimmed(&device.join("power/runtime_status")).as_deref(),
        Some("active" | "unsupported") | None
    )
}

#[derive(Clone, Debug, PartialEq)]
struct GpuSample {
    frequency_mhz: Option<u64>,
    load: Option<f64>,
}

#[derive(Debug)]
enum NvidiaSmiError {
    Missing,
    Failed,
}

fn query_nvidia_smi(bus_id: &str) -> Result<GpuSample, NvidiaSmiError> {
    let mut child = Command::new("nvidia-smi")
        .args([
            "-i",
            bus_id,
            "--query-gpu=clocks.gr,utilization.gpu",
            "--format=csv,noheader,nounits",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                NvidiaSmiError::Missing
            } else {
                NvidiaSmiError::Failed
            }
        })?;

    let deadline = Instant::now() + NVIDIA_SMI_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(NvidiaSmiError::Failed);
            }
        }
    };
    let mut output = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        let _ = stdout.read_to_string(&mut output);
    }
    if !status.success() {
        return Err(NvidiaSmiError::Failed);
    }
    parse_nvidia_smi(&output).ok_or(NvidiaSmiError::Failed)
}

fn parse_nvidia_smi(output: &str) -> Option<GpuSample> {
    let line = output.lines().find(|line| !line.trim().is_empty())?;
    let mut fields = line.split(',').map(str::trim);
    let frequency_mhz = fields.next().and_then(|value| value.parse::<u64>().ok());
    let load = fields
        .next()
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| value.clamp(0.0, 100.0));
    (frequency_mhz.is_some() || load.is_some()).then_some(GpuSample { frequency_mhz, load })
}

fn read_trimmed(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_load_uses_interval_not_boot_average() {
        let boot = parse_cpu_times("cpu  1000 0 1000 98000 0 0 0 0 0 0\ncpu0 1 2 3 4 5\n").unwrap();
        // 100 busy jiffies out of 200 during the interval: 50%, even though the
        // since-boot average is about 2%.
        let now = parse_cpu_times("cpu  1050 0 1050 98100 0 0 0 0 0 0\n").unwrap();
        assert_eq!(cpu_load_between(boot, now), Some(50.0));
        assert_eq!(cpu_load_between(now, now), None);
    }

    #[test]
    fn gpu_polling_pauses_longer_than_idle_timeout() {
        let start = Instant::now();
        let at = |secs: u64| start + Duration::from_secs(secs);
        let mut policy = GpuPollPolicy::default();

        // First sight of an awake GPU that we never touched: someone else woke it.
        assert!(policy.should_query(at(0)));
        policy.queried(at(0));
        // Poll freely inside the busy window.
        assert!(policy.should_query(at(2)));
        policy.queried(at(18));
        // Window over: stay quiet for the probe gap so an idle GPU can suspend.
        assert!(!policy.should_query(at(20)));
        assert!(!policy.should_query(at(24)));
        // Still awake after the gap: in use by another client, poll again.
        assert!(policy.should_query(at(26)));
        policy.queried(at(26));
        assert!(policy.should_query(at(28)));

        // After it suspends, the next wake is treated as a fresh observation.
        policy.gpu_suspended();
        assert!(!policy.should_query(at(30)));
        assert!(policy.should_query(at(40)));
    }

    #[test]
    fn parses_nvidia_smi_output() {
        assert_eq!(
            parse_nvidia_smi("1290, 7\n"),
            Some(GpuSample { frequency_mhz: Some(1290), load: Some(7.0) })
        );
        assert_eq!(
            parse_nvidia_smi("210, [N/A]\n"),
            Some(GpuSample { frequency_mhz: Some(210), load: None })
        );
        assert_eq!(parse_nvidia_smi("[N/A], [N/A]\n"), None);
        assert_eq!(parse_nvidia_smi(""), None);
    }

    #[test]
    fn finds_nvidia_display_function_only() {
        let root = std::env::temp_dir().join(format!("nuc-metrics-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for (bus, vendor, class) in [
            ("0000:00:02.0", "0x8086", "0x030000"),
            ("0000:01:00.1", "0x10de", "0x040300"),
            ("0000:01:00.0", "0x10de", "0x030000"),
        ] {
            let dir = root.join(bus);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("vendor"), format!("{vendor}\n")).unwrap();
            fs::write(dir.join("class"), format!("{class}\n")).unwrap();
        }
        assert_eq!(find_nvidia_gpu(&root), Some(root.join("0000:01:00.0")));

        let device = root.join("0000:01:00.0");
        fs::create_dir_all(device.join("power")).unwrap();
        fs::write(device.join("power/runtime_status"), "suspended\n").unwrap();
        assert!(!gpu_runtime_active(&device));
        fs::write(device.join("power/runtime_status"), "active\n").unwrap();
        assert!(gpu_runtime_active(&device));
        let _ = fs::remove_dir_all(&root);
    }
}

#[cfg(test)]
mod hardware_check {
    use super::*;

    #[test]
    #[ignore = "wakes the real dGPU"]
    fn sampler_lets_gpu_suspend() {
        let device = find_nvidia_gpu(Path::new(PCI_DEVICES)).expect("no NVIDIA GPU");
        while gpu_runtime_active(&device) {
            thread::sleep(Duration::from_millis(500));
        }
        let start = Instant::now();
        let _ = query_nvidia_smi(device.file_name().unwrap().to_str().unwrap()); // external wake
        let mut sampler = Sampler::default();
        let mut saw_clock = false;
        while start.elapsed() < Duration::from_secs(90) {
            let m = sampler.sample();
            println!("t={:>4.1}s active={:?} state={:?} clock={:?} load={:?} cpu={:?}MHz {:?}%",
                start.elapsed().as_secs_f32(), m.gpu_active, m.gpu_power_state,
                m.gpu_frequency_mhz, m.gpu_load, m.cpu_frequency_mhz, m.cpu_load.map(|l| l.round()));
            saw_clock |= m.gpu_frequency_mhz.is_some();
            if m.gpu_active == Some(false) {
                assert!(saw_clock, "never read the clock while awake");
                return;
            }
            thread::sleep(SAMPLE_INTERVAL);
        }
        panic!("sampler kept the GPU awake for 90 s");
    }
}
