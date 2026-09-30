from __future__ import annotations

import ctypes
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

_REPO = Path(__file__).resolve().parents[3]
_CANDIDATES = [
    "build/release-zig/solver/libsovopt.dll",
    "build/release/solver/libsovopt.so",
    "build/release/solver/sovopt.dll",
    "build/release/solver/libsovopt.dylib",
]

STATUS = {
    0: "NOT_SOLVED", 1: "OPTIMAL", 2: "INFEASIBLE", 3: "UNBOUNDED", 4: "INFEASIBLE_OR_UNBOUNDED",
    5: "TIME_LIMIT", 6: "ITERATION_LIMIT", 7: "NODE_LIMIT", 8: "NUMERICAL_ERROR", 9: "INTERRUPTED",
}


class SovoptError(RuntimeError):
    pass


class _Params(ctypes.Structure):
    _fields_ = [
        ("time_limit", ctypes.c_double),
        ("iteration_limit", ctypes.c_longlong),
        ("scale", ctypes.c_int),
        ("perturb", ctypes.c_int),
        ("seed", ctypes.c_uint),
    ]


class _Result(ctypes.Structure):
    _fields_ = [
        ("status", ctypes.c_int),
        ("objective", ctypes.c_double),
        ("iterations", ctypes.c_longlong),
        ("phase1_iterations", ctypes.c_longlong),
        ("refactorizations", ctypes.c_int),
        ("elapsed", ctypes.c_double),
        ("max_primal_violation", ctypes.c_double),
        ("max_dual_violation", ctypes.c_double),
    ]


_CALLBACK = ctypes.CFUNCTYPE(None, ctypes.c_char_p, ctypes.c_void_p)


def library_path() -> Path | None:
    env = os.environ.get("SOVOPT_LIB")
    if env and Path(env).exists():
        return Path(env)
    for c in _CANDIDATES:
        p = _REPO / c
        if p.exists():
            return p
    return None


_lib = None


def _load():
    global _lib
    if _lib is not None:
        return _lib
    path = library_path()
    if path is None:
        raise SovoptError("SOV-OPT native library not found. Build it with `cmake --preset release-zig` "
                          "and `cmake --build --preset release-zig`, or set SOVOPT_LIB.")
    lib = ctypes.CDLL(str(path.resolve()))
    lib.sovopt_version.restype = ctypes.c_char_p
    lib.sovopt_read_mps.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p), ctypes.c_char_p, ctypes.c_int]
    lib.sovopt_read_mps.restype = ctypes.c_int
    lib.sovopt_free_model.argtypes = [ctypes.c_void_p]
    for name in ("sovopt_num_rows", "sovopt_num_cols", "sovopt_num_integers"):
        getattr(lib, name).argtypes = [ctypes.c_void_p]
        getattr(lib, name).restype = ctypes.c_int
    lib.sovopt_num_nonzeros.argtypes = [ctypes.c_void_p]
    lib.sovopt_num_nonzeros.restype = ctypes.c_longlong
    lib.sovopt_default_params.argtypes = [ctypes.POINTER(_Params)]
    lib.sovopt_solve.argtypes = [ctypes.c_void_p, ctypes.POINTER(_Params), _CALLBACK, ctypes.c_void_p,
                                 ctypes.POINTER(_Result)]
    lib.sovopt_solve.restype = ctypes.c_int
    lib.sovopt_write_solution.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    lib.sovopt_write_solution.restype = ctypes.c_int
    _lib = lib
    return lib


def version() -> str:
    return _load().sovopt_version().decode()


@dataclass
class Result:
    status: str
    objective: float
    iterations: int
    phase1_iterations: int
    refactorizations: int
    elapsed: float
    max_primal_violation: float
    max_dual_violation: float

    def to_dict(self) -> dict:
        return dict(self.__dict__)


class Model:
    def __init__(self, handle: int) -> None:
        self._h = ctypes.c_void_p(handle)

    @classmethod
    def read_mps(cls, path: str | os.PathLike) -> "Model":
        lib = _load()
        h = ctypes.c_void_p()
        err = ctypes.create_string_buffer(512)
        if lib.sovopt_read_mps(os.fsencode(path), ctypes.byref(h), err, len(err)) != 0:
            raise SovoptError(err.value.decode(errors="replace"))
        return cls(h.value)

    def __del__(self) -> None:
        if getattr(self, "_h", None) and self._h.value and _lib is not None:
            _lib.sovopt_free_model(self._h)
            self._h = ctypes.c_void_p()

    @property
    def num_rows(self) -> int:
        return _load().sovopt_num_rows(self._h)

    @property
    def num_cols(self) -> int:
        return _load().sovopt_num_cols(self._h)

    @property
    def num_nonzeros(self) -> int:
        return _load().sovopt_num_nonzeros(self._h)

    @property
    def num_integers(self) -> int:
        return _load().sovopt_num_integers(self._h)

    def solve(self, time_limit: float = 60.0, seed: int = 42, scale: bool = True, perturb: bool = True,
              on_event: Callable[[dict], None] | None = None) -> Result:
        lib = _load()
        p = _Params()
        lib.sovopt_default_params(ctypes.byref(p))
        p.time_limit = time_limit
        p.seed = seed
        p.scale = int(scale)
        p.perturb = int(perturb)

        def cb(raw, _user):
            if on_event:
                on_event(json.loads(raw.decode()))

        c_cb = _CALLBACK(cb)  # keep a reference for the duration of the call
        r = _Result()
        lib.sovopt_solve(self._h, ctypes.byref(p), c_cb, None, ctypes.byref(r))
        return Result(STATUS.get(r.status, "UNKNOWN"), r.objective, r.iterations, r.phase1_iterations,
                      r.refactorizations, r.elapsed, r.max_primal_violation, r.max_dual_violation)

    def write_solution(self, path: str | os.PathLike) -> None:
        if _load().sovopt_write_solution(self._h, os.fsencode(path)) != 0:
            raise SovoptError(f"could not write solution to {path}")


def solve_file(path: str, time_limit: float = 60.0, solution: str | None = None, events: bool = False,
               seed: int = 42, out=sys.stdout) -> Result:
    """Reads, solves and optionally writes a solution; with events=True prints one JSON object per line."""
    try:
        model = Model.read_mps(path)
    except SovoptError as e:
        if events:
            print(json.dumps({"type": "RUN_FAILED", "message": str(e)}), file=out, flush=True)
        raise
    if events:
        print(json.dumps({"type": "MODEL_READ", "rows": model.num_rows, "cols": model.num_cols,
                          "nnz": model.num_nonzeros, "integers": model.num_integers}), file=out, flush=True)

    def emit(ev: dict) -> None:
        if events:
            print(json.dumps(ev), file=out, flush=True)

    result = model.solve(time_limit=time_limit, seed=seed, on_event=emit)
    if solution:
        model.write_solution(solution)
    if events:
        print(json.dumps({"type": "RESULT", **result.to_dict()}), file=out, flush=True)
    return result
