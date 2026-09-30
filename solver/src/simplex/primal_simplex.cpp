#include "simplex/primal_simplex.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <random>

#include "linalg/basis_factor.hpp"

namespace sovopt {

const char* to_string(LpStatus s) {
    switch (s) {
        case LpStatus::NotSolved: return "NOT_SOLVED";
        case LpStatus::Optimal: return "OPTIMAL";
        case LpStatus::Infeasible: return "INFEASIBLE";
        case LpStatus::Unbounded: return "UNBOUNDED";
        case LpStatus::TimeLimit: return "TIME_LIMIT";
        case LpStatus::IterationLimit: return "ITERATION_LIMIT";
        case LpStatus::NumericalError: return "NUMERICAL_ERROR";
    }
    return "UNKNOWN";
}

namespace {

enum class VStat : char { Basic, AtLower, AtUpper, Free };

constexpr double kPivotTol = 1e-7;
constexpr int kMaxRecoveries = 8;

double range_log10(const std::vector<double>& v) {
    double lo = kInf, hi = 0.0;
    for (double a : v) {
        double x = std::fabs(a);
        if (x == 0.0) continue;
        lo = std::min(lo, x);
        hi = std::max(hi, x);
    }
    return hi > 0.0 ? std::log10(hi / lo) : 0.0;
}

// Geometric-mean scaling of rows and columns, rounded to powers of two so the
// scaling itself introduces no rounding error.
void compute_scaling(const Model& md, std::vector<double>& rs, std::vector<double>& cs) {
    int m = md.num_rows, n = md.num_cols;
    rs.assign(m, 1.0);
    cs.assign(n, 1.0);
    std::vector<double> lo(m), hi(m);
    for (int pass = 0; pass < 6; ++pass) {
        std::fill(lo.begin(), lo.end(), kInf);
        std::fill(hi.begin(), hi.end(), 0.0);
        for (int j = 0; j < n; ++j)
            for (int e = md.col_start[j]; e < md.col_start[j + 1]; ++e) {
                double v = std::fabs(md.value[e]) * cs[j];
                if (v == 0.0) continue;
                int i = md.row_index[e];
                lo[i] = std::min(lo[i], v);
                hi[i] = std::max(hi[i], v);
            }
        for (int i = 0; i < m; ++i)
            if (hi[i] > 0.0) rs[i] = 1.0 / std::sqrt(lo[i] * hi[i]);
        for (int j = 0; j < n; ++j) {
            double clo = kInf, chi = 0.0;
            for (int e = md.col_start[j]; e < md.col_start[j + 1]; ++e) {
                double v = std::fabs(md.value[e]) * rs[md.row_index[e]];
                if (v == 0.0) continue;
                clo = std::min(clo, v);
                chi = std::max(chi, v);
            }
            if (chi > 0.0) cs[j] = 1.0 / std::sqrt(clo * chi);
        }
    }
    auto pow2 = [](double s) { return std::exp2(std::round(std::log2(s))); };
    for (double& r : rs) r = pow2(r);
    for (double& c : cs) c = pow2(c);
}

class Simplex {
public:
    Simplex(const Model& md, const LpOptions& opt) : md_(md), opt_(opt), rng_(opt.seed) {}

    LpSolution run();

private:
    using Clock = std::chrono::steady_clock;

    double elapsed() const { return std::chrono::duration<double>(Clock::now() - start_).count(); }
    void event(const std::string& type, const std::string& msg, double a = 0, double b = 0) {
        if (opt_.on_event) opt_.on_event({type, msg, a, b, elapsed()});
    }

    void setup();
    bool refactor();
    void compute_basic_values();
    double infeasibility() const;
    double min_objective() const;
    void set_nonbasic_at_bound(int j);
    void perturb_costs();
    void extract(LpSolution& sol) const;

    const Model& md_;
    const LpOptions& opt_;
    std::mt19937 rng_;
    Clock::time_point start_;

    int n_ = 0, m_ = 0;
    std::vector<int> cs_start_, cs_row_;
    std::vector<double> cs_val_;
    std::vector<double> rscale_, cscale_;
    std::vector<double> cost_, cost_orig_, lb_, ub_, x_;
    std::vector<VStat> stat_;
    std::vector<int> head_;
    BasisFactor factor_;
    ColumnView view_{};
    int refactorizations_ = 0;
    bool perturbed_ = false;
    bool perturb_used_ = false;  // perturb once per solve so cleanup cannot cycle
    bool bounds_perturbed_ = false;
    bool bounds_perturb_used_ = false;
    std::vector<double> lb_orig_, ub_orig_;
    std::vector<double> devex_;  // Devex reference weights for pricing

    void perturb_bounds();
    void restore_bounds();
};

void Simplex::setup() {
    n_ = md_.num_cols;
    m_ = md_.num_rows;
    if (opt_.scale) {
        compute_scaling(md_, rscale_, cscale_);
    } else {
        rscale_.assign(m_, 1.0);
        cscale_.assign(n_, 1.0);
    }
    cs_start_ = md_.col_start;
    cs_row_ = md_.row_index;
    cs_val_.resize(md_.value.size());
    for (int j = 0; j < n_; ++j)
        for (int e = cs_start_[j]; e < cs_start_[j + 1]; ++e) cs_val_[e] = md_.value[e] * rscale_[cs_row_[e]] * cscale_[j];

    view_ = {n_, m_, cs_start_.data(), cs_row_.data(), cs_val_.data()};

    int nv = n_ + m_;
    cost_.assign(nv, 0.0);
    lb_.resize(nv);
    ub_.resize(nv);
    for (int j = 0; j < n_; ++j) {
        double c = md_.maximize ? -md_.obj[j] : md_.obj[j];
        cost_[j] = c * cscale_[j];
        lb_[j] = md_.col_lower[j] / cscale_[j];
        ub_[j] = md_.col_upper[j] / cscale_[j];
    }
    for (int i = 0; i < m_; ++i) {
        lb_[n_ + i] = md_.row_lower[i] * rscale_[i];
        ub_[n_ + i] = md_.row_upper[i] * rscale_[i];
    }
    cost_orig_ = cost_;

    x_.assign(nv, 0.0);
    stat_.assign(nv, VStat::AtLower);
    head_.resize(m_);
    for (int j = 0; j < n_; ++j) set_nonbasic_at_bound(j);
    for (int i = 0; i < m_; ++i) {
        head_[i] = n_ + i;
        stat_[n_ + i] = VStat::Basic;
    }
}

void Simplex::set_nonbasic_at_bound(int j) {
    if (std::isfinite(lb_[j])) {
        stat_[j] = VStat::AtLower;
        x_[j] = lb_[j];
    } else if (std::isfinite(ub_[j])) {
        stat_[j] = VStat::AtUpper;
        x_[j] = ub_[j];
    } else {
        stat_[j] = VStat::Free;
        x_[j] = 0.0;
    }
}

bool Simplex::refactor() {
    for (int attempt = 0; attempt <= m_; ++attempt) {
        BasisFactor::Singular s{};
        if (factor_.factor(view_, head_, &s)) {
            ++refactorizations_;
            return true;
        }
        int out = head_[s.position];
        set_nonbasic_at_bound(out);
        head_[s.position] = n_ + s.free_row;
        stat_[n_ + s.free_row] = VStat::Basic;
        event("NUMERICAL_EVENT", "Singular basis repaired by swapping in a slack column", s.position, s.free_row);
    }
    return false;
}

void Simplex::compute_basic_values() {
    // x_B = B^{-1} ( -N x_N ), with the working matrix [A | -I].
    std::vector<double> rhs(m_, 0.0);
    for (int j = 0; j < n_; ++j) {
        if (stat_[j] == VStat::Basic || x_[j] == 0.0) continue;
        for (int e = cs_start_[j]; e < cs_start_[j + 1]; ++e) rhs[cs_row_[e]] -= cs_val_[e] * x_[j];
    }
    for (int i = 0; i < m_; ++i)
        if (stat_[n_ + i] != VStat::Basic) rhs[i] += x_[n_ + i];
    factor_.ftran(rhs);
    for (int p = 0; p < m_; ++p) x_[head_[p]] = rhs[p];
}

double Simplex::infeasibility() const {
    double s = 0.0;
    for (int p = 0; p < m_; ++p) {
        int b = head_[p];
        if (x_[b] < lb_[b] - opt_.primal_tol) s += lb_[b] - x_[b];
        else if (x_[b] > ub_[b] + opt_.primal_tol) s += x_[b] - ub_[b];
    }
    return s;
}

double Simplex::min_objective() const {
    double s = 0.0;
    for (int j = 0; j < n_; ++j) s += cost_orig_[j] * x_[j];
    return s;
}

void Simplex::perturb_costs() {
    std::uniform_real_distribution<double> u(0.5, 1.0);
    double cmax = 0.0;
    for (int j = 0; j < n_; ++j) cmax = std::max(cmax, std::fabs(cost_[j]));
    double base = 5e-7 * std::max(1.0, cmax);
    for (int j = 0; j < n_; ++j) {
        double d = base * (1.0 + std::fabs(cost_[j]) / std::max(1.0, cmax)) * u(rng_);
        if (stat_[j] == VStat::AtUpper) d = -d;
        else if (stat_[j] == VStat::Free) d = 0.0;
        else if (stat_[j] == VStat::Basic && (rng_() & 1u)) d = -d;
        cost_[j] += d;
    }
    perturbed_ = true;
    perturb_used_ = true;
}

void Simplex::perturb_bounds() {
    // Widen every finite bound by a tiny random amount; degenerate vertices separate.
    lb_orig_ = lb_;
    ub_orig_ = ub_;
    std::uniform_real_distribution<double> u(0.5, 1.0);
    for (int j = 0; j < n_ + m_; ++j) {
        if (lb_[j] == ub_[j]) continue;
        if (std::isfinite(lb_[j])) lb_[j] -= 1e-6 * (1.0 + std::fabs(lb_[j])) * u(rng_);
        if (std::isfinite(ub_[j])) ub_[j] += 1e-6 * (1.0 + std::fabs(ub_[j])) * u(rng_);
        if (stat_[j] == VStat::AtLower) x_[j] = lb_[j];
        else if (stat_[j] == VStat::AtUpper) x_[j] = ub_[j];
    }
    bounds_perturbed_ = true;
    bounds_perturb_used_ = true;
}

void Simplex::restore_bounds() {
    lb_ = lb_orig_;
    ub_ = ub_orig_;
    for (int j = 0; j < n_ + m_; ++j) {
        if (stat_[j] == VStat::AtLower) x_[j] = lb_[j];
        else if (stat_[j] == VStat::AtUpper) x_[j] = ub_[j];
    }
    bounds_perturbed_ = false;
}

LpSolution Simplex::run() {
    start_ = Clock::now();
    LpSolution sol;
    setup();
    sol.scale_range_before = range_log10(md_.value);
    sol.scale_range_after = range_log10(cs_val_);
    if (opt_.scale)
        event("SCALING_COMPLETED", "geometric scaling to powers of two", sol.scale_range_before, sol.scale_range_after);

    if (!refactor()) {
        sol.status = LpStatus::NumericalError;
        return sol;
    }
    compute_basic_values();
    devex_.assign(n_ + m_, 1.0);

    std::vector<double> cb(m_), y, alpha, rho;
    long long iter = 0, phase1_iters = 0;
    int degenerate_streak = 0;
    int recoveries = 0;
    double dtol = opt_.dual_tol;
    bool force_refactor = false;
    bool bland = false;
    int last_phase = 0;
    double next_report = 0.0;
    LpStatus status = LpStatus::NotSolved;

    for (;;) {
        if (factor_.updates() >= opt_.refactor_interval || (force_refactor && factor_.updates() > 0)) {
            force_refactor = false;
            if (!refactor()) {
                status = LpStatus::NumericalError;
                break;
            }
            compute_basic_values();
        }

        double inf = infeasibility();
        int phase = inf > 0.0 ? 1 : 2;
        if (phase != last_phase) {
            if (phase == 2 && last_phase == 1)
                event("PHASE_CHANGE", "Primal feasible basis found", static_cast<double>(iter));
            if (phase == 2 && opt_.perturb_costs && !perturb_used_) perturb_costs();
            last_phase = phase;
        }

        double now = (iter & 31) == 0 ? elapsed() : 0.0;
        if (now > 0.0 || iter == 0) {
            if (now > opt_.time_limit) {
                status = LpStatus::TimeLimit;
                break;
            }
            if (opt_.on_progress && now >= next_report) {
                double obj = min_objective();
                opt_.on_progress({phase, iter, (md_.maximize ? -obj : obj) + md_.obj_offset, inf, now});
                next_report = now + opt_.progress_interval;
            }
        }
        if (iter >= opt_.iteration_limit) {
            status = LpStatus::IterationLimit;
            break;
        }

        // Basic costs: sum of infeasibilities in phase 1, the (perturbed) objective in phase 2.
        for (int p = 0; p < m_; ++p) {
            int b = head_[p];
            if (phase == 1) {
                cb[p] = x_[b] < lb_[b] - opt_.primal_tol ? -1.0 : x_[b] > ub_[b] + opt_.primal_tol ? 1.0 : 0.0;
            } else {
                cb[p] = cost_[b];
            }
        }
        y = cb;
        factor_.btran(y);

        // Pricing (Dantzig, or Bland's rule while the method is stalling).
        int q = -1;
        double best = 0.0, dq = 0.0;
        for (int j = 0; j < n_ + m_; ++j) {
            VStat s = stat_[j];
            if (s == VStat::Basic || lb_[j] == ub_[j]) continue;
            double d;
            if (j < n_) {
                d = phase == 2 ? cost_[j] : 0.0;
                for (int e = cs_start_[j]; e < cs_start_[j + 1]; ++e) d -= y[cs_row_[e]] * cs_val_[e];
            } else {
                d = y[j - n_];
            }
            bool ok = (s == VStat::AtLower && d < -dtol) || (s == VStat::AtUpper && d > dtol) ||
                      (s == VStat::Free && std::fabs(d) > dtol);
            if (!ok) continue;
            if (bland) {
                q = j;
                dq = d;
                break;
            }
            double score = d * d / devex_[j];
            if (score > best) {
                best = score;
                q = j;
                dq = d;
            }
        }

        if (q < 0) {
            if (bounds_perturbed_) {
                restore_bounds();
                event("NUMERICAL_EVENT", "Bound perturbation removed; restoring exact bounds", static_cast<double>(iter));
                if (!refactor()) {
                    status = LpStatus::NumericalError;
                    break;
                }
                compute_basic_values();
                continue;
            }
            if (phase == 1) {
                status = LpStatus::Infeasible;
                break;
            }
            if (perturbed_) {
                cost_ = cost_orig_;
                perturbed_ = false;
                event("NUMERICAL_EVENT", "Cost perturbation removed; cleaning up with the original objective");
                continue;
            }
            if (dtol > opt_.dual_tol * 1e-2) {
                // Final pass with a tight dual tolerance removes the last small reduced costs.
                dtol = opt_.dual_tol * 1e-2;
                continue;
            }
            if (factor_.updates() > 0) {
                // Confirm optimality on a fresh factorization so eta-file drift cannot fake it.
                if (!refactor()) {
                    status = LpStatus::NumericalError;
                    break;
                }
                compute_basic_values();
                continue;
            }
            status = LpStatus::Optimal;
            break;
        }

        double dir = dq < 0 ? 1.0 : -1.0;
        alpha.assign(m_, 0.0);
        if (q < n_) {
            for (int e = cs_start_[q]; e < cs_start_[q + 1]; ++e) alpha[cs_row_[e]] = cs_val_[e];
        } else {
            alpha[q - n_] = -1.0;
        }
        factor_.ftran(alpha);

        // Harris two-pass ratio test. If nothing blocks with the normal pivot
        // tolerance, retry with a tiny one before concluding the ray is unbounded.
        const double tol = opt_.primal_tol;
        double piv_tol = kPivotTol;
        double tmax = kInf;
    ratio_test:
        tmax = kInf;
        for (int p = 0; p < m_; ++p) {
            if (std::fabs(alpha[p]) < piv_tol) continue;
            int b = head_[p];
            double rate = -dir * alpha[p];
            double xb = x_[b];
            if (phase == 1 && xb < lb_[b] - tol) {
                if (rate > 0) tmax = std::min(tmax, (lb_[b] - xb) / rate);
            } else if (phase == 1 && xb > ub_[b] + tol) {
                if (rate < 0) tmax = std::min(tmax, (xb - ub_[b]) / -rate);
            } else if (rate < 0 && std::isfinite(lb_[b])) {
                tmax = std::min(tmax, (xb - lb_[b] + tol) / -rate);
            } else if (rate > 0 && std::isfinite(ub_[b])) {
                tmax = std::min(tmax, (ub_[b] + tol - xb) / rate);
            }
        }
        double flip = (std::isfinite(lb_[q]) && std::isfinite(ub_[q])) ? ub_[q] - lb_[q] : kInf;

        if (flip <= tmax && std::isfinite(flip)) {
            for (int p = 0; p < m_; ++p) x_[head_[p]] -= dir * flip * alpha[p];
            if (stat_[q] == VStat::AtLower) {
                stat_[q] = VStat::AtUpper;
                x_[q] = ub_[q];
            } else {
                stat_[q] = VStat::AtLower;
                x_[q] = lb_[q];
            }
            ++iter;
            if (phase == 1) ++phase1_iters;
            degenerate_streak = 0;
            bland = false;
            continue;
        }
        if (!std::isfinite(tmax) && piv_tol > 1e-11) {
            piv_tol = 1e-11;
            goto ratio_test;
        }
        if (!std::isfinite(tmax)) {
            if (phase == 2 && factor_.updates() == 0 && recoveries > 0) {
                status = LpStatus::Unbounded;
                break;
            }
            if (phase == 2) {
                // Confirm the ray on a fresh factorization before trusting it.
                ++recoveries;
                if (!refactor()) {
                    status = LpStatus::NumericalError;
                    break;
                }
                compute_basic_values();
                continue;
            }
            // Should not happen in phase 1; rebuild the factorization and retry.
            if (++recoveries > kMaxRecoveries || !refactor()) {
                status = LpStatus::NumericalError;
                break;
            }
            compute_basic_values();
            continue;
        }

        int r = -1;
        double rbest = -1.0, t_exact = 0.0, r_bound = 0.0;
        double amax = 0.0;
        for (int pass = 0; pass < 2; ++pass)
        for (int p = 0; p < m_; ++p) {
            if (std::fabs(alpha[p]) < piv_tol) continue;
            int b = head_[p];
            double rate = -dir * alpha[p];
            double xb = x_[b], t, bound;
            if (phase == 1 && xb < lb_[b] - tol) {
                if (rate <= 0) continue;
                t = (lb_[b] - xb) / rate;
                bound = lb_[b];
            } else if (phase == 1 && xb > ub_[b] + tol) {
                if (rate >= 0) continue;
                t = (xb - ub_[b]) / -rate;
                bound = ub_[b];
            } else if (rate < 0 && std::isfinite(lb_[b])) {
                t = (xb - lb_[b]) / -rate;
                bound = lb_[b];
            } else if (rate > 0 && std::isfinite(ub_[b])) {
                t = (ub_[b] - xb) / rate;
                bound = ub_[b];
            } else {
                continue;
            }
            if (t > tmax) continue;
            if (pass == 0) {
                amax = std::max(amax, std::fabs(alpha[p]));
                continue;
            }
            if (bland && std::fabs(alpha[p]) < 0.1 * amax) continue;
            double score = bland ? -static_cast<double>(b) : std::fabs(alpha[p]);
            if (score > rbest) {
                rbest = score;
                r = p;
                t_exact = t;
                r_bound = bound;
            }
        }
        if (r < 0) {
            if (++recoveries > kMaxRecoveries || !refactor()) {
                status = LpStatus::NumericalError;
                break;
            }
            event("NUMERICAL_EVENT", "No stable pivot in ratio test; refactorized and retrying", static_cast<double>(iter));
            compute_basic_values();
            continue;
        }

        // Devex weight update from the pivot row rho = e_r^T B^{-1} [A | -I].
        {
            rho.assign(m_, 0.0);
            rho[r] = 1.0;
            factor_.btran(rho);
            double arq = alpha[r];
            double wq = devex_[q];
            double wmax = 0.0;
            for (int j = 0; j < n_ + m_; ++j) {
                if (stat_[j] == VStat::Basic || j == q) continue;
                double arj;
                if (j < n_) {
                    arj = 0.0;
                    for (int e = cs_start_[j]; e < cs_start_[j + 1]; ++e) arj += rho[cs_row_[e]] * cs_val_[e];
                } else {
                    arj = -rho[j - n_];
                }
                if (arj == 0.0) continue;
                double ratio = arj / arq;
                devex_[j] = std::max(devex_[j], ratio * ratio * wq);
                wmax = std::max(wmax, devex_[j]);
            }
            devex_[head_[r]] = std::max(wq / (arq * arq), 1.0);
            if (wmax > 1e7) std::fill(devex_.begin(), devex_.end(), 1.0);  // new reference framework
        }

        double t = std::max(t_exact, 0.0);
        for (int p = 0; p < m_; ++p) x_[head_[p]] -= dir * t * alpha[p];
        x_[q] += dir * t;
        int leaving = head_[r];
        x_[leaving] = r_bound;
        stat_[leaving] = (r_bound == lb_[leaving]) ? VStat::AtLower : VStat::AtUpper;
        head_[r] = q;
        stat_[q] = VStat::Basic;
        factor_.update(r, alpha);
        recoveries = 0;
        // A small pivot degrades the eta file quickly; refactor at the next iteration.
        if (std::fabs(alpha[r]) < 1e-5) force_refactor = true;

        ++iter;
        if (phase == 1) ++phase1_iters;
        if (t < 1e-12) {
            ++degenerate_streak;
            if (degenerate_streak > 50 && !bounds_perturb_used_) {
                perturb_bounds();
                event("NUMERICAL_EVENT", "Degenerate stall detected; bounds perturbed to separate the vertex",
                      static_cast<double>(iter));
                if (!refactor()) {
                    status = LpStatus::NumericalError;
                    break;
                }
                compute_basic_values();
                degenerate_streak = 0;
            } else if (degenerate_streak > 5000 && !bland) {
                bland = true;
                event("NUMERICAL_EVENT", "Persistent stall; switching to Bland's rule", static_cast<double>(iter));
            }
        } else {
            degenerate_streak = 0;
            bland = false;
        }
    }

    sol.status = status;
    sol.iterations = iter;
    sol.phase1_iterations = phase1_iters;
    sol.refactorizations = refactorizations_;
    extract(sol);
    sol.elapsed = elapsed();
    if (opt_.on_progress) {
        double obj = min_objective();
        opt_.on_progress({last_phase, iter, (md_.maximize ? -obj : obj) + md_.obj_offset, infeasibility(), sol.elapsed});
    }
    return sol;
}

void Simplex::extract(LpSolution& sol) const {
    const Model& md = md_;
    sol.x.resize(n_);
    for (int j = 0; j < n_; ++j) sol.x[j] = x_[j] * cscale_[j];

    sol.row_activity.assign(m_, 0.0);
    for (int j = 0; j < n_; ++j)
        for (int e = md.col_start[j]; e < md.col_start[j + 1]; ++e) sol.row_activity[md.row_index[e]] += md.value[e] * sol.x[j];

    // Duals from the final basis and the unperturbed costs: y = R y'.
    std::vector<double> y(m_);
    for (int p = 0; p < m_; ++p) y[p] = cost_orig_[head_[p]];
    BasisFactor f = factor_;
    f.btran(y);
    double sgn = md.maximize ? -1.0 : 1.0;
    sol.row_dual.resize(m_);
    for (int i = 0; i < m_; ++i) sol.row_dual[i] = sgn * y[i] * rscale_[i];

    sol.reduced_cost.resize(n_);
    for (int j = 0; j < n_; ++j) {
        double d = md.obj[j];
        for (int e = md.col_start[j]; e < md.col_start[j + 1]; ++e) d -= md.value[e] * sol.row_dual[md.row_index[e]];
        sol.reduced_cost[j] = d;
    }

    double obj = md.obj_offset;
    for (int j = 0; j < n_; ++j) obj += md.obj[j] * sol.x[j];
    sol.objective = obj;

    double pv = 0.0;
    for (int j = 0; j < n_; ++j) {
        pv = std::max(pv, md.col_lower[j] - sol.x[j]);
        pv = std::max(pv, sol.x[j] - md.col_upper[j]);
    }
    for (int i = 0; i < m_; ++i) {
        pv = std::max(pv, md.row_lower[i] - sol.row_activity[i]);
        pv = std::max(pv, sol.row_activity[i] - md.row_upper[i]);
    }
    sol.max_primal_violation = pv;

    // Dual sign conditions in minimization form.
    double dv = 0.0;
    for (int j = 0; j < n_; ++j) {
        double d = sgn * sol.reduced_cost[j];
        double scale = 1e-7 * (1.0 + std::fabs(sol.x[j]));
        bool at_lo = std::isfinite(md.col_lower[j]) && sol.x[j] <= md.col_lower[j] + scale;
        bool at_up = std::isfinite(md.col_upper[j]) && sol.x[j] >= md.col_upper[j] - scale;
        if (at_lo && at_up) continue;
        if (at_lo) dv = std::max(dv, -d);
        else if (at_up) dv = std::max(dv, d);
        else dv = std::max(dv, std::fabs(d));
    }
    sol.max_dual_violation = dv;
}

}  // namespace

LpSolution solve_lp(const Model& model, const LpOptions& options) {
    Simplex s(model, options);
    return s.run();
}

}  // namespace sovopt
