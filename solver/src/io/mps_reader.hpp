#pragma once

#include <istream>
#include <stdexcept>
#include <string>

#include "core/model.hpp"

namespace sovopt {

class MpsError : public std::runtime_error {
public:
    MpsError(const std::string& msg, long line)
        : std::runtime_error("line " + std::to_string(line) + ": " + msg), line_(line) {}
    long line() const { return line_; }

private:
    long line_;
};

// Reads free- or fixed-format MPS (names without embedded spaces), including
// RANGES, all BOUNDS types, integer MARKER blocks, OBJSENSE and a constant
// objective term given as the negated RHS of the objective row.
Model read_mps(std::istream& in);
Model read_mps_file(const std::string& path);

}  // namespace sovopt
