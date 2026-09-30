#include "sovopt/sovopt.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>

#include "io/mps_reader.hpp"
#include "simplex/primal_simplex.hpp"

struct sovopt_model {
    sovopt::Model model;
    sovopt::LpSolution solution;
    bool solved = false;
};

namespace {

sovopt_status to_c(sovopt::LpStatus s) {
    using S = sovopt::LpStatus;
    switch (s) {
        case S::Optimal: return SOVOPT_STATUS_OPTIMAL;
        case S::Infeasible: return SOVOPT_STATUS_INFEASIBLE;
        case S::Unbounded: return SOVOPT_STATUS_UNBOUNDED;
        case S::TimeLimit: return SOVOPT_STATUS_TIME_LIMIT;
        case S::IterationLimit: return SOVOPT_STATUS_ITERATION_LIMIT;
        case S::NumericalError: return SOVOPT_STATUS_NUMERICAL_ERROR;
        case S::NotSolved: break;
    }
    return SOVOPT_STATUS_NOT_SOLVED;
}

std::string num(double v) {
    if (!std::isfinite(v)) return "null";
    char buf[32];
    std::snprintf(buf, sizeof buf, "%.17g", v);
    return buf;
}

std::string quoted(const std::string& s) {
    std::string out = "\"";
    for (char c : s) {
        if (c == '"' || c == '\\') out += '\\';
        out += c;
    }
    return out + "\"";
}

}  // namespace

extern "C" {

const char* sovopt_version(void) {
    return SOVOPT_VERSION_STRING;
}

const char* sovopt_status_name(sovopt_status status) {
    switch (status) {
        case SOVOPT_STATUS_NOT_SOLVED:      return "NOT_SOLVED";
        case SOVOPT_STATUS_OPTIMAL:         return "OPTIMAL";
        case SOVOPT_STATUS_INFEASIBLE:      return "INFEASIBLE";
        case SOVOPT_STATUS_UNBOUNDED:       return "UNBOUNDED";
        case SOVOPT_STATUS_INF_OR_UNBD:     return "INFEASIBLE_OR_UNBOUNDED";
        case SOVOPT_STATUS_TIME_LIMIT:      return "TIME_LIMIT";
        case SOVOPT_STATUS_ITERATION_LIMIT: return "ITERATION_LIMIT";
        case SOVOPT_STATUS_NODE_LIMIT:      return "NODE_LIMIT";
        case SOVOPT_STATUS_NUMERICAL_ERROR: return "NUMERICAL_ERROR";
        case SOVOPT_STATUS_INTERRUPTED:     return "INTERRUPTED";
    }
    return "UNKNOWN";
}

int sovopt_read_mps(const char* path, sovopt_model** out, char* err, int err_len) {
    try {
        auto* m = new sovopt_model;
        m->model = sovopt::read_mps_file(path);
        *out = m;
        return 0;
    } catch (const std::exception& e) {
        if (err && err_len > 0) {
            std::strncpy(err, e.what(), static_cast<size_t>(err_len) - 1);
            err[err_len - 1] = '\0';
        }
        *out = nullptr;
        return 1;
    }
}

void sovopt_free_model(sovopt_model* model) {
    delete model;
}

int sovopt_num_rows(const sovopt_model* m) { return m->model.num_rows; }
int sovopt_num_cols(const sovopt_model* m) { return m->model.num_cols; }
long long sovopt_num_nonzeros(const sovopt_model* m) { return m->model.nnz(); }
int sovopt_num_integers(const sovopt_model* m) {
    int k = 0;
    for (char c : m->model.is_integer) k += c ? 1 : 0;
    return k;
}

void sovopt_default_params(sovopt_params* p) {
    p->time_limit = 60.0;
    p->iteration_limit = 50000000;
    p->scale = 1;
    p->perturb = 1;
    p->seed = 42;
}

int sovopt_solve(sovopt_model* m, const sovopt_params* params, sovopt_event_callback cb, void* user,
                 sovopt_result* result) {
    sovopt_params defaults;
    sovopt_default_params(&defaults);
    const sovopt_params& p = params ? *params : defaults;

    sovopt::LpOptions opt;
    opt.time_limit = p.time_limit;
    opt.iteration_limit = p.iteration_limit;
    opt.scale = p.scale != 0;
    opt.perturb_costs = p.perturb != 0;
    opt.seed = p.seed;
    if (cb) {
        opt.on_progress = [cb, user](const sovopt::LpProgress& g) {
            std::string s = "{\"type\":\"ITERATION\",\"t\":" + num(g.elapsed) + ",\"phase\":" + std::to_string(g.phase) +
                            ",\"iteration\":" + std::to_string(g.iteration) + ",\"objective\":" + num(g.objective) +
                            ",\"primal_infeasibility\":" + num(g.infeasibility) + "}";
            cb(s.c_str(), user);
        };
        opt.on_event = [cb, user](const sovopt::LpEvent& e) {
            std::string s = "{\"type\":" + quoted(e.type) + ",\"t\":" + num(e.elapsed) + ",\"message\":" + quoted(e.message) +
                            ",\"a\":" + num(e.a) + ",\"b\":" + num(e.b) + "}";
            cb(s.c_str(), user);
        };
    }
    try {
        m->solution = sovopt::solve_lp(m->model, opt);
    } catch (const std::exception&) {
        m->solution = {};
        m->solution.status = sovopt::LpStatus::NumericalError;
    }
    m->solved = true;
    if (result) {
        const auto& s = m->solution;
        result->status = to_c(s.status);
        result->objective = s.objective;
        result->iterations = s.iterations;
        result->phase1_iterations = s.phase1_iterations;
        result->refactorizations = s.refactorizations;
        result->elapsed = s.elapsed;
        result->max_primal_violation = s.max_primal_violation;
        result->max_dual_violation = s.max_dual_violation;
    }
    return 0;
}

int sovopt_write_solution(const sovopt_model* m, const char* path) {
    if (!m->solved) return 1;
    std::ofstream f(path);
    if (!f) return 2;
    const auto& md = m->model;
    const auto& s = m->solution;
    f << std::setprecision(17);
    f << "# SOV-OPT solution\n";
    f << "status " << sovopt::to_string(s.status) << "\n";
    f << "objective " << s.objective << "\n";
    f << "columns " << md.num_cols << "\n";
    for (int j = 0; j < md.num_cols; ++j)
        f << md.col_names[j] << ' ' << (j < static_cast<int>(s.x.size()) ? s.x[j] : 0.0) << ' '
          << (j < static_cast<int>(s.reduced_cost.size()) ? s.reduced_cost[j] : 0.0) << "\n";
    f << "rows " << md.num_rows << "\n";
    for (int i = 0; i < md.num_rows; ++i)
        f << md.row_names[i] << ' ' << (i < static_cast<int>(s.row_activity.size()) ? s.row_activity[i] : 0.0) << ' '
          << (i < static_cast<int>(s.row_dual.size()) ? s.row_dual[i] : 0.0) << "\n";
    return f ? 0 : 3;
}

}  // extern "C"
