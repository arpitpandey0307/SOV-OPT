#include "linalg/basis_factor.hpp"

#include <algorithm>
#include <cmath>

namespace sovopt {

bool BasisFactor::factor(const ColumnView& a, const std::vector<int>& head, Singular* sing) {
    a_ = a;
    m_ = a.m;
    etas_.clear();

    pos_kind_.assign(m_, -1);
    pos_to_kcol_.assign(m_, -1);
    row_slack_pos_.assign(m_, -1);
    kcol_to_var_.clear();
    kcol_to_pos_.clear();
    for (int p = 0; p < m_; ++p) {
        int v = head[p];
        if (v >= a.n) {
            pos_kind_[p] = v - a.n;
            row_slack_pos_[v - a.n] = p;
        } else {
            pos_to_kcol_[p] = static_cast<int>(kcol_to_var_.size());
            kcol_to_var_.push_back(v);
            kcol_to_pos_.push_back(p);
        }
    }
    k_ = static_cast<int>(kcol_to_var_.size());
    krow_to_row_.clear();
    row_to_krow_.assign(m_, -1);
    for (int i = 0; i < m_; ++i) {
        if (row_slack_pos_[i] < 0) {
            row_to_krow_[i] = static_cast<int>(krow_to_row_.size());
            krow_to_row_.push_back(i);
        }
    }

    // Assemble K = A[R, S] densely and factor with partial pivoting.
    lu_.assign(static_cast<size_t>(k_) * k_, 0.0);
    for (int c = 0; c < k_; ++c) {
        int j = kcol_to_var_[c];
        for (int e = a.col_start[j]; e < a.col_start[j + 1]; ++e) {
            int kr = row_to_krow_[a.row_index[e]];
            if (kr >= 0) lu_[static_cast<size_t>(kr) * k_ + c] = a.value[e];
        }
    }
    perm_.resize(k_);
    for (int i = 0; i < k_; ++i) perm_[i] = i;
    std::vector<double> colmax(k_, 0.0);
    for (int r = 0; r < k_; ++r)
        for (int c = 0; c < k_; ++c) colmax[c] = std::max(colmax[c], std::fabs(lu_[static_cast<size_t>(r) * k_ + c]));

    for (int col = 0; col < k_; ++col) {
        int piv = col;
        double best = std::fabs(lu_[static_cast<size_t>(col) * k_ + col]);
        for (int r = col + 1; r < k_; ++r) {
            double v = std::fabs(lu_[static_cast<size_t>(r) * k_ + col]);
            if (v > best) {
                best = v;
                piv = r;
            }
        }
        if (best <= 1e-9 * colmax[col] || best < 1e-13) {
            if (sing) {
                sing->position = kcol_to_pos_[col];
                // Any kernel row not yet used as a pivot can take a slack.
                sing->free_row = krow_to_row_[perm_[col]];
            }
            return false;
        }
        if (piv != col) {
            std::swap_ranges(lu_.begin() + static_cast<long>(piv) * k_, lu_.begin() + static_cast<long>(piv + 1) * k_,
                             lu_.begin() + static_cast<long>(col) * k_);
            std::swap(perm_[piv], perm_[col]);
        }
        const double* prow = &lu_[static_cast<size_t>(col) * k_];
        double inv = 1.0 / prow[col];
        for (int r = col + 1; r < k_; ++r) {
            double* row = &lu_[static_cast<size_t>(r) * k_];
            if (row[col] == 0.0) continue;
            double l = row[col] * inv;
            row[col] = l;
            for (int c = col + 1; c < k_; ++c) row[c] -= l * prow[c];
        }
    }
    return true;
}

void BasisFactor::kernel_solve(std::vector<double>& b) const {
    // P K = L U: solve L y = P b, then U z = y.
    std::vector<double> y(k_);
    for (int i = 0; i < k_; ++i) y[i] = b[perm_[i]];
    for (int i = 0; i < k_; ++i) {
        const double* row = &lu_[static_cast<size_t>(i) * k_];
        double s = y[i];
        for (int j = 0; j < i; ++j) s -= row[j] * y[j];
        y[i] = s;
    }
    for (int i = k_ - 1; i >= 0; --i) {
        const double* row = &lu_[static_cast<size_t>(i) * k_];
        double s = y[i];
        for (int j = i + 1; j < k_; ++j) s -= row[j] * y[j];
        y[i] = s / row[i];
    }
    b.swap(y);
}

void BasisFactor::kernel_solve_trans(std::vector<double>& b) const {
    // K^T = U^T L^T P: solve U^T y = b, L^T x = y, then undo the permutation.
    std::vector<double> y(b);
    for (int j = 0; j < k_; ++j) {
        y[j] /= lu_[static_cast<size_t>(j) * k_ + j];
        double yj = y[j];
        if (yj == 0.0) continue;
        const double* row = &lu_[static_cast<size_t>(j) * k_];
        for (int i = j + 1; i < k_; ++i) y[i] -= row[i] * yj;
    }
    for (int j = k_ - 1; j >= 0; --j) {
        double yj = y[j];
        if (yj == 0.0) continue;
        const double* row = &lu_[static_cast<size_t>(j) * k_];
        for (int i = 0; i < j; ++i) y[i] -= row[i] * yj;
    }
    for (int i = 0; i < k_; ++i) b[perm_[i]] = y[i];
}

void BasisFactor::ftran(std::vector<double>& v) const {
    // B w = b with columns: structural a_j at structural positions, -e_i at slack positions.
    // Rows in R determine the structural part through K; the rest give slack values.
    std::vector<double> kb(k_);
    for (int kr = 0; kr < k_; ++kr) kb[kr] = v[krow_to_row_[kr]];
    if (k_) kernel_solve(kb);

    std::vector<double> w(m_, 0.0);
    std::vector<double> act(m_, 0.0);
    for (int c = 0; c < k_; ++c) {
        double z = kb[c];
        w[kcol_to_pos_[c]] = z;
        if (z == 0.0) continue;
        int j = kcol_to_var_[c];
        for (int e = a_.col_start[j]; e < a_.col_start[j + 1]; ++e) act[a_.row_index[e]] += a_.value[e] * z;
    }
    for (int i = 0; i < m_; ++i) {
        int p = row_slack_pos_[i];
        if (p >= 0) w[p] = act[i] - v[i];
    }
    for (const Eta& e : etas_) {
        double wr = w[e.r];
        if (wr == 0.0) continue;
        w[e.r] = wr * e.pivot_inv;
        for (size_t t = 0; t < e.idx.size(); ++t) w[e.idx[t]] += e.val[t] * wr;
    }
    v.swap(w);
}

void BasisFactor::btran(std::vector<double>& c) const {
    for (auto it = etas_.rbegin(); it != etas_.rend(); ++it) {
        double s = c[it->r] * it->pivot_inv;
        for (size_t t = 0; t < it->idx.size(); ++t) s += it->val[t] * c[it->idx[t]];
        c[it->r] = s;
    }
    // Slack positions fix y on their rows directly: -y_i = c_p.
    std::vector<double> y(m_, 0.0);
    for (int i = 0; i < m_; ++i) {
        int p = row_slack_pos_[i];
        if (p >= 0) y[i] = -c[p];
    }
    // Structural positions: K^T y_R = c_S - A[Rs, S]^T y_Rs.
    std::vector<double> rhs(k_);
    for (int col = 0; col < k_; ++col) {
        int j = kcol_to_var_[col];
        double s = c[kcol_to_pos_[col]];
        for (int e = a_.col_start[j]; e < a_.col_start[j + 1]; ++e) {
            int r = a_.row_index[e];
            if (row_slack_pos_[r] >= 0) s -= a_.value[e] * y[r];
        }
        rhs[col] = s;
    }
    if (k_) kernel_solve_trans(rhs);
    for (int kr = 0; kr < k_; ++kr) y[krow_to_row_[kr]] = rhs[kr];
    c.swap(y);
}

void BasisFactor::update(int r, const std::vector<double>& w) {
    Eta e;
    e.r = r;
    e.pivot_inv = 1.0 / w[r];
    for (int i = 0; i < m_; ++i) {
        if (i == r || w[i] == 0.0) continue;
        e.idx.push_back(i);
        e.val.push_back(-w[i] * e.pivot_inv);
    }
    etas_.push_back(std::move(e));
}

}  // namespace sovopt
