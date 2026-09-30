#pragma once

#include <vector>

namespace sovopt {

// Column access for the working matrix [A | -I] of a problem with m rows and
// n structural columns. Variables j < n are structural; j >= n is the slack of
// row j - n, whose column is -e_(j-n).
struct ColumnView {
    int n = 0;
    int m = 0;
    const int* col_start = nullptr;
    const int* row_index = nullptr;
    const double* value = nullptr;
};

// Factorization of a simplex basis B.
//
// Basic slack columns are unit vectors, so only the structural part needs real
// elimination: with R the rows not covered by basic slacks and S the basic
// structural columns, |R| = |S| and the kernel K = A[R, S] is factored with
// dense LU and partial pivoting. Slack values follow by back substitution.
// Between refactorizations the basis is updated in product form (eta file).
class BasisFactor {
public:
    struct Singular {
        int position;  // basis position whose column is dependent
        int free_row;  // a row whose slack can replace it
    };

    // Factors the basis `head` (head[p] = variable basic at position p).
    // Returns false and fills `sing` if the kernel is singular.
    bool factor(const ColumnView& a, const std::vector<int>& head, Singular* sing);

    // Solves B w = rhs in place; rhs and result are indexed by basis position.
    // Input rhs is indexed by row.
    void ftran(std::vector<double>& rhs_row_to_pos) const;

    // Solves B^T y = c in place; input indexed by basis position, output by row.
    void btran(std::vector<double>& c_pos_to_row) const;

    // Records the replacement of the column at position r, given w = B^{-1} a_q.
    void update(int r, const std::vector<double>& w);

    int updates() const { return static_cast<int>(etas_.size()); }
    int kernel_size() const { return k_; }

private:
    struct Eta {
        int r;
        double pivot_inv;
        std::vector<int> idx;
        std::vector<double> val;
    };

    void kernel_solve(std::vector<double>& b) const;        // K z = b (length k_)
    void kernel_solve_trans(std::vector<double>& b) const;  // K^T z = b

    ColumnView a_{};
    int m_ = 0;
    int k_ = 0;
    std::vector<int> pos_kind_;      // per position: -1 structural, else row of the basic slack
    std::vector<int> pos_to_kcol_;   // per position: kernel column for structural positions
    std::vector<int> kcol_to_var_;   // kernel column -> structural variable
    std::vector<int> kcol_to_pos_;
    std::vector<int> krow_to_row_;   // kernel row -> matrix row
    std::vector<int> row_to_krow_;   // matrix row -> kernel row, or -1
    std::vector<int> row_slack_pos_; // matrix row -> basis position of its slack, or -1
    std::vector<double> lu_;         // k_ x k_, row-major, L unit lower + U
    std::vector<int> perm_;          // kernel row permutation from pivoting
    std::vector<Eta> etas_;
};

}  // namespace sovopt
