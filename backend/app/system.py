"""Host and GPU telemetry, read from the machine the control plane runs on."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import time

_NVSMI_FIELDS = [
    "name", "driver_version", "memory.total", "memory.used", "utilization.gpu",
    "utilization.memory", "temperature.gpu", "power.draw", "power.limit",
    "clocks.sm", "clocks.max.sm", "pcie.link.gen.current", "pcie.link.width.current",
]

_cache: dict = {"t": 0.0, "gpus": None}


def _num(v: str):
    v = v.strip()
    try:
        return float(v)
    except ValueError:
        return None if v in ("[N/A]", "N/A", "[Not Supported]") else v


def gpus(max_age: float = 1.0) -> list[dict]:
    now = time.time()
    if _cache["gpus"] is not None and now - _cache["t"] < max_age:
        return _cache["gpus"]
    out: list[dict] = []
    exe = shutil.which("nvidia-smi")
    if exe:
        try:
            res = subprocess.run(
                [exe, f"--query-gpu={','.join(_NVSMI_FIELDS)}", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5)
            for line in res.stdout.strip().splitlines():
                vals = [_num(x) for x in line.split(",")]
                g = dict(zip(_NVSMI_FIELDS, vals))
                out.append({
                    "name": g["name"],
                    "driver": str(g["driver_version"]),
                    "memory_total_mb": g["memory.total"],
                    "memory_used_mb": g["memory.used"],
                    "utilization_gpu": g["utilization.gpu"],
                    "utilization_memory": g["utilization.memory"],
                    "temperature_c": g["temperature.gpu"],
                    "power_w": g["power.draw"],
                    "power_limit_w": g["power.limit"],
                    "clock_sm_mhz": g["clocks.sm"],
                    "clock_sm_max_mhz": g["clocks.max.sm"],
                    "pcie_gen": g["pcie.link.gen.current"],
                    "pcie_width": g["pcie.link.width.current"],
                })
        except (OSError, subprocess.SubprocessError):
            out = []
    _cache.update(t=now, gpus=out)
    return out


def _memory_bytes() -> int | None:
    if platform.system() == "Windows":
        import ctypes

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("sullAvailExtendedVirtual", ctypes.c_ulonglong)]

        st = MEMORYSTATUSEX()
        st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
        return int(st.ullTotalPhys)
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    except (ValueError, OSError, AttributeError):
        return None


def _cpu_name() -> str:
    if platform.system() == "Windows":
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            return winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        except OSError:
            pass
    return platform.processor() or platform.machine()


_host: dict | None = None


def host() -> dict:
    global _host
    if _host is None:
        _host = {
            "os": f"{platform.system()} {platform.release()}",
            "cpu": _cpu_name(),
            "logical_cores": os.cpu_count(),
            "memory_bytes": _memory_bytes(),
            "python": platform.python_version(),
        }
    return _host
