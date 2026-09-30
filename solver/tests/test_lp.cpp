#include <gtest/gtest.h>

#include <cmath>
#include <sstream>

#include "io/mps_reader.hpp"
#include "simplex/primal_simplex.hpp"

using namespace sovopt;

namespace {

Model parse(const std::string& text) {
    std::istringstream in(text);
    return read_mps(in);
}

LpSolution solve(const Model& m) {
    LpOptions opt;
    opt.time_limit = 10;
    return solve_lp(m, opt);
}

// min -x - y  s.t.  x + y <= 4,  x + 3y <= 6,  x <= 3
const char* kSmall = R"(NAME          SMALL
ROWS
 N  COST
 L  C1
 L  C2
COLUMNS
    X         COST        -1.0   C1           1.0
    X         C2           1.0
    Y         COST        -1.0   C1           1.0
    Y         C2           3.0
RHS
    RHS       C1           4.0   C2           6.0
BOUNDS
 UP BND       X            3.0
ENDATA
)";

}  // namespace

TEST(MpsReader, ReadsDimensionsAndBounds) {
    Model m = parse(kSmall);
    EXPECT_EQ(m.name, "SMALL");
    EXPECT_EQ(m.num_rows, 2);
    EXPECT_EQ(m.num_cols, 2);
    EXPECT_EQ(m.nnz(), 4);
    EXPECT_DOUBLE_EQ(m.col_upper[0], 3.0);
    EXPECT_TRUE(std::isinf(m.col_upper[1]));
    EXPECT_TRUE(std::isinf(m.row_lower[0]));
    EXPECT_DOUBLE_EQ(m.row_upper[1], 6.0);
}

TEST(MpsReader, RangesFollowMpsSemantics) {
    Model m = parse(R"(NAME R
ROWS
 N  OBJ
 E  E1
 E  E2
 L  L1
 G  G1
COLUMNS
    X  OBJ 1  E1 1
    X  E2 1  L1 1
    X  G1 1
RHS
    RHS  E1 5  E2 5
    RHS  L1 5  G1 5
RANGES
    RNG  E1 2  E2 -2
    RNG  L1 3  G1 3
ENDATA
)");
    EXPECT_DOUBLE_EQ(m.row_lower[0], 5);
    EXPECT_DOUBLE_EQ(m.row_upper[0], 7);
    EXPECT_DOUBLE_EQ(m.row_lower[1], 3);
    EXPECT_DOUBLE_EQ(m.row_upper[1], 5);
    EXPECT_DOUBLE_EQ(m.row_lower[2], 2);
    EXPECT_DOUBLE_EQ(m.row_upper[2], 5);
    EXPECT_DOUBLE_EQ(m.row_lower[3], 5);
    EXPECT_DOUBLE_EQ(m.row_upper[3], 8);
}

TEST(MpsReader, IntegerMarkersAndObjectiveConstant) {
    Model m = parse(R"(NAME I
ROWS
 N  OBJ
 L  C
COLUMNS
    M1  'MARKER'  'INTORG'
    X   OBJ 1  C 1
    M2  'MARKER'  'INTEND'
    Y   OBJ 1  C 1
RHS
    RHS  OBJ -7  C 1
BOUNDS
 BV BND Y
ENDATA
)");
    EXPECT_TRUE(m.is_integer[0]);
    EXPECT_TRUE(m.is_integer[1]);
    EXPECT_DOUBLE_EQ(m.obj_offset, 7.0);
    EXPECT_DOUBLE_EQ(m.col_upper[1], 1.0);
}

TEST(MpsReader, RejectsUnknownRow) {
    EXPECT_THROW(parse("NAME X\nROWS\n N OBJ\nCOLUMNS\n    X  NOPE 1\nENDATA\n"), MpsError);
}

TEST(PrimalSimplex, SolvesSmallLp) {
    LpSolution s = solve(parse(kSmall));
    ASSERT_EQ(s.status, LpStatus::Optimal);
    // Optimum at x = 3, y = 1.
    EXPECT_NEAR(s.objective, -4.0, 1e-9);
    EXPECT_NEAR(s.x[0], 3.0, 1e-9);
    EXPECT_NEAR(s.x[1], 1.0, 1e-9);
    EXPECT_LT(s.max_primal_violation, 1e-9);
    EXPECT_LT(s.max_dual_violation, 1e-9);
}

TEST(PrimalSimplex, MaximizationSense) {
    std::string text = kSmall;
    text.insert(text.find("ROWS"), "OBJSENSE\n    MAX\n");
    // max -x - y is attained at the origin.
    LpSolution s = solve(parse(text));
    ASSERT_EQ(s.status, LpStatus::Optimal);
    EXPECT_NEAR(s.objective, 0.0, 1e-9);
}

TEST(PrimalSimplex, DetectsInfeasibility) {
    LpSolution s = solve(parse(R"(NAME INF
ROWS
 N  OBJ
 G  C1
 L  C2
COLUMNS
    X  OBJ 1  C1 1
    X  C2 1
RHS
    RHS  C1 5  C2 3
ENDATA
)"));
    EXPECT_EQ(s.status, LpStatus::Infeasible);
}

TEST(PrimalSimplex, DetectsUnboundedness) {
    LpSolution s = solve(parse(R"(NAME UNB
ROWS
 N  OBJ
 G  C1
COLUMNS
    X  OBJ -1  C1 1
RHS
    RHS  C1 1
ENDATA
)"));
    EXPECT_EQ(s.status, LpStatus::Unbounded);
}

TEST(PrimalSimplex, FreeVariablesAndEqualities) {
    // min x + 2y  s.t.  x - y = 1,  x + y >= 3,  x, y free  ->  x = 2, y = 1, objective 4
    LpSolution s = solve(parse(R"(NAME FREE
ROWS
 N  OBJ
 E  C1
 G  C2
COLUMNS
    X  OBJ 1  C1 1
    X  C2 1
    Y  OBJ 2  C1 -1
    Y  C2 1
RHS
    RHS  C1 1  C2 3
BOUNDS
 FR BND X
 FR BND Y
ENDATA
)"));
    ASSERT_EQ(s.status, LpStatus::Optimal);
    EXPECT_NEAR(s.objective, 4.0, 1e-9);
    EXPECT_NEAR(s.x[0], 2.0, 1e-9);
    EXPECT_NEAR(s.x[1], 1.0, 1e-9);
}

TEST(PrimalSimplex, DualsSatisfyComplementarity) {
    Model m = parse(kSmall);
    LpSolution s = solve(m);
    ASSERT_EQ(s.status, LpStatus::Optimal);
    // Strong duality: c^T x = b^T y for this problem (bounds contribute via the reduced cost of x).
    double dual_obj = 4.0 * s.row_dual[0] + 6.0 * s.row_dual[1] + 3.0 * s.reduced_cost[0];
    EXPECT_NEAR(dual_obj, s.objective, 1e-9);
}
