#pragma once

#include <functional>
#include <string>
#include <vector>

#include "core/model.hpp"

namespace sovopt {

enum class LpStatus { NotSolved, Optimal, Infeasible, Unbounded, TimeLimit, IterationLimit, NumericalError };

const char* to_string(LpStatus s);

struct LpProgress {
    int phase;              // 1 = minimizing infeasibility, 2 = optimizing
    long long iteration;
    double objective;       // in the user's sense, including the offset
    double infeasibility;   // sum of primal infeasibilities (scaled problem)
    double elapsed;
};

struct LpEvent {
    std::string type;       // e.g. "SCALING_COMPLETED", "NUMERICAL_EVENT", "PHASE_CHANGE"
    std::string message;
    double a = 0.0, b = 0.0;
    double elapsed = 0.0;
};

struct LpOptions {
    double time_limit = 60.0;
    long long iteration_limit = 50'000'000;
    bool scale = true;
    bool perturb_costs = true;
    double primal_tol = 1e-7;
    double dual_tol = 1e-7;
    int refactor_interval = 100;
    unsigned seed = 42;
    double progress_interval = 0.1;  // seconds between progress callbacks
    std::function<void(const LpProgress&)> on_progress;
    std::function<void(const LpEvent&)> on_event;
};

struct LpSolution {
    LpStatus status = LpStatus::NotSolved;
    double objective = 0.0;
    long long iterations = 0;
    long long phase1_iterations = 0;
    int refactorizations = 0;
    double elapsed = 0.0;
    std::vector<double> x;             // column values
    std::vector<double> row_activity;  // A x
    std::vector<double> row_dual;      // y, sign convention of the user objective
    std::vector<double> reduced_cost;  // c - A^T y
    double max_primal_violation = 0.0; // in original units
    double max_dual_violation = 0.0;
    double scale_range_before = 0.0;   // log10(max|a| / min|a|)
    double scale_range_after = 0.0;
};

// Solves the LP relaxation of `model` (integrality is ignored) with a bounded
// revised primal simplex method.
LpSolution solve_lp(const Model& model, const LpOptions& options);

}  // namespace sovopt
