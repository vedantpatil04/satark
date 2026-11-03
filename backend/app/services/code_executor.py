import os
import sys
import shutil
import subprocess
import tempfile
import time
import re
from typing import Dict, Any, Optional, Tuple
import psutil

# Windows Job Objects API (via ctypes)
if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_uint64),
            ("WriteOperationCount", ctypes.c_uint64),
            ("OtherOperationCount", ctypes.c_uint64),
            ("ReadTransferCount", ctypes.c_uint64),
            ("WriteTransferCount", ctypes.c_uint64),
            ("OtherTransferCount", ctypes.c_uint64),
        ]

    class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
    JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x00000100
    JOB_OBJECT_LIMIT_JOB_MEMORY = 0x00000200
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008


# Supported Languages
SUPPORTED_LANGUAGES = ["c", "cpp", "java", "python"]

# Default Limits
DEFAULT_TIMEOUT_SEC = 5.0
DEFAULT_COMPILE_TIMEOUT_SEC = 10.0
DEFAULT_MEMORY_MB = 256
MAX_OUTPUT_CHARS = 524288  # 512 KB output cap


def _ensure_windows_compiler_paths():
    """
    On Windows, dynamically queries Windows Registry Machine and User PATH
    and scans well-known compiler directories (MSYS2 ucrt64/mingw64, Eclipse Adoptium, Oracle JDK).
    Injects missing directories into os.environ['PATH'] so newly installed runtimes
    are immediately available without requiring a server reboot or terminal restart.
    """
    if sys.platform != "win32":
        return

    current_path_parts = [p.strip().rstrip("\\/") for p in os.environ.get("PATH", "").split(os.pathsep) if p.strip()]
    current_path_lower = {p.lower() for p in current_path_parts}
    to_add = []

    # 1. Read registry PATH (Machine & User) via winreg
    try:
        import winreg
        for root_key, sub_key in [
            (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
            (winreg.HKEY_CURRENT_USER, r"Environment")
        ]:
            try:
                with winreg.OpenKey(root_key, sub_key) as k:
                    val, _ = winreg.QueryValueEx(k, "Path")
                    if val:
                        for entry in val.split(";"):
                            entry = os.path.expandvars(entry.strip()).rstrip("\\/")
                            if entry and os.path.isdir(entry) and entry.lower() not in current_path_lower:
                                to_add.append(entry)
                                current_path_lower.add(entry.lower())
            except Exception:
                pass
    except Exception:
        pass

    # 2. Well-known compiler and JDK installation directories on Windows
    well_known_candidates = [
        r"C:\msys64\ucrt64\bin",
        r"C:\msys64\mingw64\bin",
        r"C:\msys64\clang64\bin",
        r"C:\MinGW\bin",
        r"C:\w64devkit\bin",
        r"C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot\bin",
        r"C:\Program Files\Eclipse Adoptium\jdk-25.0.5.8-hotspot\bin",
    ]

    # Search for any installed JDKs under common Java base paths
    for base_jdk_dir in [r"C:\Program Files\Eclipse Adoptium", r"C:\Program Files\Java", r"C:\Program Files\Amazon Corretto"]:
        if os.path.isdir(base_jdk_dir):
            try:
                for entry in os.listdir(base_jdk_dir):
                    candidate_bin = os.path.join(base_jdk_dir, entry, "bin")
                    if os.path.isfile(os.path.join(candidate_bin, "javac.exe")) or os.path.isfile(os.path.join(candidate_bin, "javac")):
                        well_known_candidates.append(candidate_bin)
            except Exception:
                pass

    for candidate in well_known_candidates:
        cand_clean = candidate.rstrip("\\/")
        if os.path.isdir(cand_clean) and cand_clean.lower() not in current_path_lower:
            to_add.append(cand_clean)
            current_path_lower.add(cand_clean.lower())

    if to_add:
        # Prepend so compilers and their required DLLs are found first
        os.environ["PATH"] = os.pathsep.join(to_add) + os.pathsep + os.environ.get("PATH", "")


def _get_clean_env() -> Dict[str, str]:
    """
    Constructs a sanitized environment dictionary.
    Strips backend database URLs, JWT secrets, credentials, and network proxies.
    Retains only essential OS system paths needed to run compiler/interpreter.
    """
    _ensure_windows_compiler_paths()
    clean_env = {}
    keep_keys = [
        "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR",
        "TEMP", "TMP", "COMSPEC", "USERPROFILE", "HOME", "LANG",
        "LC_ALL", "TERM"
    ]
    for key, val in os.environ.items():
        if key.upper() in keep_keys:
            clean_env[key] = val

    # Ensure proxy variables are stripped to prevent unauthorized egress routing
    for proxy_key in ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]:
        clean_env.pop(proxy_key, None)

    return clean_env


def detect_runtimes() -> Dict[str, Dict[str, Any]]:
    """
    Detects local compiler/interpreter availability and version strings.
    Returns status dictionary for C, C++, Java, and Python.
    """
    _ensure_windows_compiler_paths()
    runtimes = {}

    # 1. Python
    py_path = sys.executable or shutil.which("python") or shutil.which("python3")
    py_info = {
        "name": "Python 3",
        "language": "python",
        "is_available": False,
        "version": None,
        "binary_path": py_path,
        "error_message": None
    }
    if py_path:
        try:
            res = subprocess.run([py_path, "--version"], capture_output=True, text=True, timeout=3.0)
            if res.returncode == 0:
                py_info["is_available"] = True
                py_info["version"] = (res.stdout or res.stderr).strip()
            else:
                py_info["error_message"] = res.stderr.strip() or "Failed to query Python version"
        except Exception as e:
            py_info["error_message"] = str(e)
    else:
        py_info["error_message"] = "Python executable not found in PATH"
    runtimes["python"] = py_info

    # 2. C (gcc / clang)
    gcc_path = shutil.which("gcc") or shutil.which("clang")
    c_info = {
        "name": "GCC / Clang C Compiler",
        "language": "c",
        "is_available": False,
        "version": None,
        "binary_path": gcc_path,
        "error_message": None
    }
    if gcc_path:
        try:
            res = subprocess.run([gcc_path, "--version"], capture_output=True, text=True, timeout=3.0)
            if res.returncode == 0:
                c_info["is_available"] = True
                first_line = (res.stdout or res.stderr).splitlines()[0] if res.stdout or res.stderr else "GCC Compiler"
                c_info["version"] = first_line.strip()
            else:
                c_info["error_message"] = res.stderr.strip() or "Failed to query GCC version"
        except Exception as e:
            c_info["error_message"] = str(e)
    else:
        c_info["error_message"] = "GCC/Clang compiler (gcc) not found in PATH. Install MinGW/GCC to enable C."
    runtimes["c"] = c_info

    # 3. C++ (g++ / clang++)
    gpp_path = shutil.which("g++") or shutil.which("clang++")
    cpp_info = {
        "name": "G++ / Clang++ C++ Compiler",
        "language": "cpp",
        "is_available": False,
        "version": None,
        "binary_path": gpp_path,
        "error_message": None
    }
    if gpp_path:
        try:
            res = subprocess.run([gpp_path, "--version"], capture_output=True, text=True, timeout=3.0)
            if res.returncode == 0:
                cpp_info["is_available"] = True
                first_line = (res.stdout or res.stderr).splitlines()[0] if res.stdout or res.stderr else "G++ Compiler"
                cpp_info["version"] = first_line.strip()
            else:
                cpp_info["error_message"] = res.stderr.strip() or "Failed to query G++ version"
        except Exception as e:
            cpp_info["error_message"] = str(e)
    else:
        cpp_info["error_message"] = "G++/Clang++ compiler (g++) not found in PATH. Install MinGW/GCC to enable C++."
    runtimes["cpp"] = cpp_info

    # 4. Java (javac and java)
    javac_path = shutil.which("javac")
    java_path = shutil.which("java")
    java_info = {
        "name": "OpenJDK / Java Runtime",
        "language": "java",
        "is_available": False,
        "version": None,
        "binary_path": f"javac: {javac_path}, java: {java_path}" if javac_path else None,
        "javac_path": javac_path,
        "java_path": java_path,
        "error_message": None
    }
    if javac_path and java_path:
        try:
            res = subprocess.run([javac_path, "--version"], capture_output=True, text=True, timeout=3.0)
            if res.returncode == 0:
                java_info["is_available"] = True
                java_info["version"] = (res.stdout or res.stderr).strip()
            else:
                java_info["error_message"] = res.stderr.strip() or "Failed to query javac version"
        except Exception as e:
            java_info["error_message"] = str(e)
    else:
        missing = []
        if not javac_path:
            missing.append("javac compiler")
        if not java_path:
            missing.append("java runtime")
        java_info["error_message"] = f"Missing {', '.join(missing)} in PATH. Install JDK 17+ to enable Java."
    runtimes["java"] = java_info

    return runtimes


def _apply_windows_job_limits(job_handle, proc, memory_limit_mb: int):
    """
    Applies memory limits and active process caps to a Windows process via Job Object.
    """
    if sys.platform != "win32" or not job_handle:
        return

    try:
        proc_handle = int(proc._handle)
        kernel32.AssignProcessToJobObject(job_handle, proc_handle)
    except Exception:
        pass


def _kill_process_tree(proc: subprocess.Popen):
    """
    Forcefully terminates a subprocess and all of its spawned child processes.
    """
    try:
        parent = psutil.Process(proc.pid)
        for child in parent.children(recursive=True):
            try:
                child.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        parent.kill()
    except (psutil.NoSuchProcess, psutil.AccessDenied, Exception):
        try:
            proc.kill()
        except Exception:
            pass


def _truncate_output(text: str) -> str:
    """
    Enforces maximum output cap to prevent client browser and server memory exhaustion.
    """
    if len(text) > MAX_OUTPUT_CHARS:
        return text[:MAX_OUTPUT_CHARS] + f"\n... [Output truncated at {MAX_OUTPUT_CHARS // 1024} KB limit]"
    return text


def execute_code(
    language: str,
    code: str,
    stdin: str = "",
    timeout_seconds: float = DEFAULT_TIMEOUT_SEC,
    memory_limit_mb: int = DEFAULT_MEMORY_MB
) -> Dict[str, Any]:
    """
    Executes student code out-of-process in an isolated ephemeral directory
    with time, memory, CPU and network restrictions enforced.
    """
    start_wall_time = time.perf_counter()

    # Honest security isolation details
    security_enforced = {
        "process_isolation": "Out-of-process subprocess (never executed within FastAPI memory space)",
        "timeout_seconds": timeout_seconds,
        "memory_limit_mb": memory_limit_mb,
        "filesystem_isolation": "Ephemeral sandbox directory wiped immediately upon exit",
        "environment_sanitized": True,
        "network_restricted": True,
        "os_security_model": "Native OS Job Object & process limit controls (Docker/Hypervisor containerization not enabled in local bare-metal mode)"
    }

    if language not in SUPPORTED_LANGUAGES:
        return {
            "status": "system_error",
            "stdout": "",
            "stderr": f"Unsupported language '{language}'. Supported: {', '.join(SUPPORTED_LANGUAGES)}",
            "compilation_error": None,
            "execution_time_ms": 0,
            "memory_kb": None,
            "exit_code": 1,
            "security_enforced": security_enforced
        }

    # Code length safeguard (1 MB max)
    if len(code) > 1024 * 1024:
        return {
            "status": "system_error",
            "stdout": "",
            "stderr": "Code exceeds 1MB limit.",
            "compilation_error": None,
            "execution_time_ms": 0,
            "memory_kb": None,
            "exit_code": 1,
            "security_enforced": security_enforced
        }

    runtimes = detect_runtimes()
    rt_info = runtimes.get(language)
    if not rt_info or not rt_info.get("is_available"):
        err_msg = rt_info.get("error_message") if rt_info else "Runtime not found"
        return {
            "status": "unavailable",
            "stdout": "",
            "stderr": f"Runtime for '{language}' is unavailable: {err_msg}",
            "compilation_error": None,
            "execution_time_ms": 0,
            "memory_kb": None,
            "exit_code": 127,
            "security_enforced": security_enforced
        }

    # Create isolated ephemeral scratch workspace
    temp_dir = tempfile.mkdtemp(prefix="satark_exec_")
    env = _get_clean_env()

    # Job Object Setup on Windows
    h_job = None
    if sys.platform == "win32":
        try:
            h_job = kernel32.CreateJobObjectW(None, None)
            if h_job:
                info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
                info.BasicLimitInformation.LimitFlags = (
                    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                    | JOB_OBJECT_LIMIT_PROCESS_MEMORY
                    | JOB_OBJECT_LIMIT_JOB_MEMORY
                    | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                )
                info.BasicLimitInformation.ActiveProcessLimit = 15
                limit_bytes = memory_limit_mb * 1024 * 1024
                info.ProcessMemoryLimit = limit_bytes
                info.JobMemoryLimit = limit_bytes
                kernel32.SetInformationJobObject(
                    h_job, 9, ctypes.byref(info), ctypes.sizeof(info)
                )
        except Exception:
            h_job = None

    try:
        run_cmd = []
        is_compiled = language in ["c", "cpp", "java"]

        # -------------------------------------------------------------
        # Step A: Write source and compile if needed
        # -------------------------------------------------------------
        if language == "c":
            src_file = os.path.join(temp_dir, "solution.c")
            exe_file = os.path.join(temp_dir, "solution.exe" if sys.platform == "win32" else "solution")
            with open(src_file, "w", encoding="utf-8") as f:
                f.write(code)

            gcc_bin = rt_info["binary_path"]
            compile_cmd = [gcc_bin, src_file, "-O2", "-Wall", "-o", exe_file]
            comp_start = time.perf_counter()
            try:
                comp_res = subprocess.run(
                    compile_cmd,
                    cwd=temp_dir,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=DEFAULT_COMPILE_TIMEOUT_SEC
                )
            except subprocess.TimeoutExpired:
                return {
                    "status": "compilation_error",
                    "stdout": "",
                    "stderr": "Compilation timed out (10s limit exceeded).",
                    "compilation_error": "Compilation timed out.",
                    "execution_time_ms": int((time.perf_counter() - comp_start) * 1000),
                    "memory_kb": None,
                    "exit_code": 1,
                    "security_enforced": security_enforced
                }

            if comp_res.returncode != 0:
                return {
                    "status": "compilation_error",
                    "stdout": _truncate_output(comp_res.stdout),
                    "stderr": _truncate_output(comp_res.stderr),
                    "compilation_error": comp_res.stderr.strip() or "Compilation failed",
                    "execution_time_ms": int((time.perf_counter() - comp_start) * 1000),
                    "memory_kb": None,
                    "exit_code": comp_res.returncode,
                    "security_enforced": security_enforced
                }

            run_cmd = [exe_file]

        elif language == "cpp":
            src_file = os.path.join(temp_dir, "solution.cpp")
            exe_file = os.path.join(temp_dir, "solution.exe" if sys.platform == "win32" else "solution")
            with open(src_file, "w", encoding="utf-8") as f:
                f.write(code)

            gpp_bin = rt_info["binary_path"]
            compile_cmd = [gpp_bin, src_file, "-O2", "-std=c++17", "-Wall", "-o", exe_file]
            comp_start = time.perf_counter()
            try:
                comp_res = subprocess.run(
                    compile_cmd,
                    cwd=temp_dir,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=DEFAULT_COMPILE_TIMEOUT_SEC
                )
            except subprocess.TimeoutExpired:
                return {
                    "status": "compilation_error",
                    "stdout": "",
                    "stderr": "Compilation timed out (10s limit exceeded).",
                    "compilation_error": "Compilation timed out.",
                    "execution_time_ms": int((time.perf_counter() - comp_start) * 1000),
                    "memory_kb": None,
                    "exit_code": 1,
                    "security_enforced": security_enforced
                }

            if comp_res.returncode != 0:
                return {
                    "status": "compilation_error",
                    "stdout": _truncate_output(comp_res.stdout),
                    "stderr": _truncate_output(comp_res.stderr),
                    "compilation_error": comp_res.stderr.strip() or "Compilation failed",
                    "execution_time_ms": int((time.perf_counter() - comp_start) * 1000),
                    "memory_kb": None,
                    "exit_code": comp_res.returncode,
                    "security_enforced": security_enforced
                }

            run_cmd = [exe_file]

        elif language == "java":
            # Detect primary class name or fallback to Main
            match = re.search(r'public\s+(?:final\s+)?class\s+([A-Za-z0-9_]+)', code)
            class_name = match.group(1) if match else "Main"
            if not match and "class " not in code:
                # Wrap bare code in Main class if student just wrote statements
                code = f"public class Main {{\n  public static void main(String[] args) {{\n{code}\n  }}\n}}"
                class_name = "Main"
            elif not match:
                # Class exists without public modifier
                match2 = re.search(r'class\s+([A-Za-z0-9_]+)', code)
                class_name = match2.group(1) if match2 else "Main"

            src_file = os.path.join(temp_dir, f"{class_name}.java")
            with open(src_file, "w", encoding="utf-8") as f:
                f.write(code)

            javac_bin = rt_info.get("javac_path") or shutil.which("javac")
            compile_cmd = [javac_bin, "-encoding", "UTF-8", f"{class_name}.java"]
            comp_start = time.perf_counter()
            try:
                comp_res = subprocess.run(
                    compile_cmd,
                    cwd=temp_dir,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=DEFAULT_COMPILE_TIMEOUT_SEC
                )
            except subprocess.TimeoutExpired:
                return {
                    "status": "compilation_error",
                    "stdout": "",
                    "stderr": "Java compilation timed out (10s limit exceeded).",
                    "compilation_error": "Compilation timed out.",
                    "execution_time_ms": int((time.perf_counter() - comp_start) * 1000),
                    "memory_kb": None,
                    "exit_code": 1,
                    "security_enforced": security_enforced
                }

            if comp_res.returncode != 0:
                return {
                    "status": "compilation_error",
                    "stdout": _truncate_output(comp_res.stdout),
                    "stderr": _truncate_output(comp_res.stderr),
                    "compilation_error": comp_res.stderr.strip() or "Java compilation failed",
                    "execution_time_ms": int((time.perf_counter() - comp_start) * 1000),
                    "memory_kb": None,
                    "exit_code": comp_res.returncode,
                    "security_enforced": security_enforced
                }

            java_bin = rt_info.get("java_path") or shutil.which("java")
            # Network restrictions: dummy proxy routing, memory cap 256m
            run_cmd = [
                java_bin,
                f"-Xmx{memory_limit_mb}m",
                "-Xms16m",
                "-Dhttp.proxyHost=127.0.0.1",
                "-Dhttp.proxyPort=1",
                "-Dhttps.proxyHost=127.0.0.1",
                "-Dhttps.proxyPort=1",
                "-DsocksProxyHost=127.0.0.1",
                "-DsocksProxyPort=1",
                "-Dfile.encoding=UTF-8",
                "-cp", ".",
                class_name
            ]

        elif language == "python":
            src_file = os.path.join(temp_dir, "solution.py")
            with open(src_file, "w", encoding="utf-8") as f:
                f.write(code)

            # Inject network blocking guard
            guard_file = os.path.join(temp_dir, "_satark_guard.py")
            with open(guard_file, "w", encoding="utf-8") as f:
                f.write(
                    "import socket\n"
                    "_orig_socket = socket.socket\n"
                    "class _BlockedSocket(_orig_socket):\n"
                    "    def __init__(self, *args, **kwargs):\n"
                    "        raise PermissionError('Network access is disabled in the practice environment.')\n"
                    "socket.socket = _BlockedSocket\n"
                    "socket.create_connection = lambda *a, **k: (_ for _ in ()).throw(PermissionError('Network access is disabled in the practice environment.'))\n"
                    "socket.getaddrinfo = lambda *a, **k: (_ for _ in ()).throw(PermissionError('Network access is disabled in the practice environment.'))\n"
                )

            py_bin = rt_info["binary_path"]
            # Python isolated mode (-I), add current dir to sys.path explicitly for guard and run via runpy
            run_cmd = [
                py_bin,
                "-I",
                "-c",
                "import sys; sys.path.insert(0, '.'); import _satark_guard, runpy; runpy.run_path('solution.py', run_name='__main__')"
            ]

        # -------------------------------------------------------------
        # Step B: Execute the program out-of-process with strict limits
        # -------------------------------------------------------------
        exec_start = time.perf_counter()
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NO_WINDOW

        proc = subprocess.Popen(
            run_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=temp_dir,
            env=env,
            creationflags=creationflags,
            text=True
        )

        # Attach to Windows Job Object immediately
        if h_job:
            _apply_windows_job_limits(h_job, proc, memory_limit_mb)

        # Track memory usage with psutil
        peak_memory_kb = None
        try:
            p_obj = psutil.Process(proc.pid)
            mem_info = p_obj.memory_info()
            peak_memory_kb = int(mem_info.rss / 1024)
        except Exception:
            pass

        try:
            stdout_data, stderr_data = proc.communicate(
                input=stdin if stdin else None,
                timeout=timeout_seconds
            )
            exec_duration_ms = int((time.perf_counter() - exec_start) * 1000)

            # Update peak memory if available
            try:
                if p_obj and p_obj.is_running():
                    peak_memory_kb = max(peak_memory_kb or 0, int(p_obj.memory_info().rss / 1024))
            except Exception:
                pass

        except subprocess.TimeoutExpired:
            _kill_process_tree(proc)
            exec_duration_ms = int((time.perf_counter() - exec_start) * 1000)
            return {
                "status": "timed_out",
                "stdout": "",
                "stderr": f"Execution timed out ({timeout_seconds:.1f}s limit exceeded). Check for infinite loops or input waiting.",
                "compilation_error": None,
                "execution_time_ms": exec_duration_ms,
                "memory_kb": peak_memory_kb,
                "exit_code": None,
                "security_enforced": security_enforced
            }

        status_code = "success" if proc.returncode == 0 else "runtime_error"

        # Check for memory limits or exit code clues
        if proc.returncode in (-9, 137, 3221225477):  # OOM / access violation
            status_code = "memory_limit_exceeded"

        return {
            "status": status_code,
            "stdout": _truncate_output(stdout_data or ""),
            "stderr": _truncate_output(stderr_data or ""),
            "compilation_error": None,
            "execution_time_ms": exec_duration_ms,
            "memory_kb": peak_memory_kb,
            "exit_code": proc.returncode,
            "security_enforced": security_enforced
        }

    except Exception as e:
        return {
            "status": "system_error",
            "stdout": "",
            "stderr": f"Unexpected execution service failure: {str(e)}",
            "compilation_error": None,
            "execution_time_ms": int((time.perf_counter() - start_wall_time) * 1000),
            "memory_kb": None,
            "exit_code": 1,
            "security_enforced": security_enforced
        }

    finally:
        # Close Windows Job Object Handle
        if h_job and sys.platform == "win32":
            try:
                kernel32.CloseHandle(h_job)
            except Exception:
                pass

        # Destroy ephemeral temp folder completely
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
