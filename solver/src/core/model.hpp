#pragma once

#include <limits>
#include <string>
#include <vector>

namespace sovopt {

inline constexpr double kInf = std::numeric_limits<double>::infinity();

// A linear program with optional integrality markers, stored column-wise.
//
//   min/max  c^T x + obj_offset
//   s.t.     row_lower <= A x <= row_upper
//            col_lower <=  x  <= col_upper
struct Model {
    std::string name;
    bool maximize = false;
    double obj_offset = 0.0;

    int num_rows = 0;
    int num_cols = 0;

    std::vector<double> obj;

    // Constraint matrix in compressed sparse column form.
    std::vector<int> col_start;  // size num_cols + 1
    std::vector<int> row_index;  // size nnz
    std::vector<double> value;   // size nnz

    std::vector<double> col_lower, col_upper;
    std::vector<double> row_lower, row_upper;
    std::vector<char> is_integer;

    std::vector<std::string> col_names, row_names;

    // Quadratic objective terms are read but not yet solved (QP lands with the IPM in T3).
    long long quadratic_nnz = 0;

    long long nnz() const { return static_cast<long long>(value.size()); }
    bool has_integers() const {
        for (char c : is_integer)
            if (c) return true;
        return false;
    }
};

}  // namespace sovopt
