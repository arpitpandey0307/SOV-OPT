"""PuLP adapter: solve an existing PuLP model with SOV-OPT by changing one line.

    import pulp
    from sovopt.pulp_solver import SOVOPT

    prob.solve(SOVOPT(time_limit=60))

The model is exported to MPS, solved by the native core, and the primal values
and duals are written back onto the PuLP variables and constraints. Integer
variables are solved as their LP relaxation until the MILP engine lands; the
solver refuses integer models unless relax_integers=True is passed.
"""

from __future__ import annotations

import os
import tempfile

import pulp
from pulp.apis.core import clocks

from ._native import Model


class SOVOPT(pulp.LpSolver):
    name = "SOVOPT"

    def __init__(self, time_limit: float = 60.0, relax_integers: bool = False, msg: bool = False, **kwargs):
        super().__init__(mip=relax_integers, msg=msg, timeLimit=time_limit, **kwargs)
        self.relax_integers = relax_integers

    def available(self) -> bool:
        try:
            from ._native import library_path
            return library_path() is not None
        except ImportError:
            return False

    def actualSolve(self, lp: pulp.LpProblem, **kwargs):
        start = clocks()
        if lp.isMIP() and not self.relax_integers:
            raise pulp.PulpSolverError("SOV-OPT solves LPs for now; pass relax_integers=True to solve the LP relaxation.")
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "model.mps")
            sol = os.path.join(tmp, "model.sol")
            # Names are normalized in the file (X0000000, C0000000); map them back by position.
            file_vars, file_cons, _, pulp_vars = lp.writeMPS(path, rename=True, with_objsense=True)
            model = Model.read_mps(path)
            result = model.solve(time_limit=self.timeLimit or 60.0)
            model.write_solution(sol)
            values, reduced, duals, activity = _read_solution(sol)

        var_map = dict(zip(file_vars, pulp_vars))
        cons = lp.constraints()
        con_objs = cons if isinstance(cons, dict) else {c.name: c for c in cons}
        con_map = dict(zip(file_cons, list(con_objs)))
        has_solution = result.status in ("OPTIMAL", "TIME_LIMIT", "ITERATION_LIMIT")
        if has_solution:
            lp.assignVarsVals({var_map[n]: v for n, v in values.items() if n in var_map})
            lp.assignVarsDj({var_map[n]: d for n, d in reduced.items() if n in var_map})
            lp.assignConsPi({con_map[n]: y for n, y in duals.items() if n in con_map})
            # PuLP's slack is rhs - activity for its constraint form.
            lp.assignConsSlack({con_map[n]: -con_objs[con_map[n]].constant - a for n, a in activity.items()
                                if n in con_map})

        S = pulp.LpSolveStatus
        status = {
            "OPTIMAL": S.Optimal, "INFEASIBLE": S.Infeasible, "UNBOUNDED": S.Unbounded,
            "TIME_LIMIT": S.TimeLimit, "ITERATION_LIMIT": S.IterationLimit,
        }.get(result.status, S.NotSolved)
        return self.buildStats(lp, status, has_solution, start=start)


def _read_solution(path: str):
    values, reduced, duals, activity = {}, {}, {}, {}
    mode = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            tok = line.split()
            if not tok or tok[0].startswith("#") or tok[0] in ("status", "objective"):
                continue
            if tok[0] in ("columns", "rows"):
                mode = tok[0]
                continue
            if mode == "columns":
                values[tok[0]] = float(tok[1])
                reduced[tok[0]] = float(tok[2])
            elif mode == "rows":
                activity[tok[0]] = float(tok[1])
                duals[tok[0]] = float(tok[2])
    return values, reduced, duals, activity
