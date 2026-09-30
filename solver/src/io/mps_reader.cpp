#include "io/mps_reader.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <unordered_map>
#include <vector>

namespace sovopt {
namespace {

enum class Section { None, Name, ObjSense, Rows, Columns, Rhs, Ranges, Bounds, Quadratic, Ignored, End };

struct Entry {
    int col;
    int row;
    double val;
};

std::vector<std::string> split(const std::string& line) {
    std::vector<std::string> out;
    std::istringstream ss(line);
    std::string tok;
    while (ss >> tok) out.push_back(tok);
    return out;
}

std::string upper(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
    return s;
}

double parse_number(const std::string& tok, long line) {
    char* end = nullptr;
    double v = std::strtod(tok.c_str(), &end);
    if (end == tok.c_str() || *end != '\0') throw MpsError("expected a number, found '" + tok + "'", line);
    return v;
}

}  // namespace

Model read_mps(std::istream& in) {
    Model m;
    Section section = Section::None;
    std::string obj_row;
    std::unordered_map<std::string, int> rows, cols;
    std::vector<char> row_type;
    std::vector<double> rhs;
    std::vector<double> range;
    std::vector<char> has_range;
    std::vector<Entry> entries;
    std::vector<char> lower_set, upper_set;
    bool in_integer_block = false;

    std::string raw;
    long line_no = 0;
    while (std::getline(in, raw)) {
        ++line_no;
        if (!raw.empty() && raw.back() == '\r') raw.pop_back();
        if (raw.empty() || raw[0] == '*') continue;
        auto tok = split(raw);
        if (tok.empty()) continue;

        if (raw[0] != ' ' && raw[0] != '\t') {
            std::string head = upper(tok[0]);
            if (head == "NAME") {
                section = Section::Name;
                if (tok.size() > 1) m.name = tok[1];
            } else if (head == "OBJSENSE") {
                section = Section::ObjSense;
                if (tok.size() > 1) m.maximize = upper(tok[1]).rfind("MAX", 0) == 0;
            } else if (head == "ROWS") {
                section = Section::Rows;
            } else if (head == "COLUMNS") {
                section = Section::Columns;
            } else if (head == "RHS") {
                section = Section::Rhs;
            } else if (head == "RANGES") {
                section = Section::Ranges;
            } else if (head == "BOUNDS") {
                section = Section::Bounds;
            } else if (head == "QUADOBJ" || head == "QMATRIX" || head == "QSECTION") {
                section = Section::Quadratic;
            } else if (head == "ENDATA") {
                section = Section::End;
                break;
            } else {
                section = Section::Ignored;
            }
            continue;
        }

        switch (section) {
            case Section::ObjSense:
                m.maximize = upper(tok[0]).rfind("MAX", 0) == 0;
                break;
            case Section::Rows: {
                if (tok.size() < 2) throw MpsError("ROWS entry needs a type and a name", line_no);
                char type = static_cast<char>(std::toupper(static_cast<unsigned char>(tok[0][0])));
                if (type == 'N') {
                    if (obj_row.empty()) obj_row = tok[1];
                    break;
                }
                if (type != 'E' && type != 'L' && type != 'G') throw MpsError("unknown row type '" + tok[0] + "'", line_no);
                int idx = static_cast<int>(row_type.size());
                if (!rows.emplace(tok[1], idx).second) throw MpsError("duplicate row '" + tok[1] + "'", line_no);
                row_type.push_back(type);
                rhs.push_back(0.0);
                range.push_back(0.0);
                has_range.push_back(0);
                m.row_names.push_back(tok[1]);
                break;
            }
            case Section::Columns: {
                if (tok.size() >= 3 && upper(tok[1]).find("MARKER") != std::string::npos) {
                    std::string marker = upper(tok[2]);
                    if (marker.find("INTORG") != std::string::npos) in_integer_block = true;
                    else if (marker.find("INTEND") != std::string::npos) in_integer_block = false;
                    break;
                }
                if (tok.size() < 3 || tok.size() % 2 == 0) throw MpsError("malformed COLUMNS entry", line_no);
                auto [it, inserted] = cols.emplace(tok[0], static_cast<int>(m.col_names.size()));
                int c = it->second;
                if (inserted) {
                    m.col_names.push_back(tok[0]);
                    m.obj.push_back(0.0);
                    m.is_integer.push_back(in_integer_block ? 1 : 0);
                }
                for (size_t k = 1; k + 1 < tok.size(); k += 2) {
                    double v = parse_number(tok[k + 1], line_no);
                    if (tok[k] == obj_row) {
                        m.obj[c] += v;
                        continue;
                    }
                    auto r = rows.find(tok[k]);
                    if (r == rows.end()) throw MpsError("unknown row '" + tok[k] + "'", line_no);
                    if (v != 0.0) entries.push_back({c, r->second, v});
                }
                break;
            }
            case Section::Rhs:
            case Section::Ranges: {
                // The set name is optional: an odd token count means it is present.
                size_t start = tok.size() % 2 == 1 ? 1 : 0;
                for (size_t k = start; k + 1 < tok.size(); k += 2) {
                    double v = parse_number(tok[k + 1], line_no);
                    if (section == Section::Rhs && tok[k] == obj_row) {
                        m.obj_offset = -v;
                        continue;
                    }
                    auto r = rows.find(tok[k]);
                    if (r == rows.end()) throw MpsError("unknown row '" + tok[k] + "'", line_no);
                    if (section == Section::Rhs) {
                        rhs[r->second] = v;
                    } else {
                        range[r->second] = v;
                        has_range[r->second] = 1;
                    }
                }
                break;
            }
            case Section::Bounds: {
                if (lower_set.empty()) {
                    int n = static_cast<int>(m.col_names.size());
                    m.col_lower.assign(n, 0.0);
                    m.col_upper.assign(n, kInf);
                    lower_set.assign(n, 0);
                    upper_set.assign(n, 0);
                }
                std::string type = upper(tok[0]);
                bool needs_value = type == "UP" || type == "LO" || type == "FX" || type == "LI" || type == "UI" || type == "SC";
                std::string cname;
                double v = 0.0;
                if (needs_value) {
                    if (tok.size() < 3) throw MpsError("bound " + type + " needs a value", line_no);
                    cname = tok.size() >= 4 ? tok[2] : tok[1];
                    v = parse_number(tok.back(), line_no);
                } else {
                    cname = tok.size() >= 3 && cols.count(tok[2]) ? tok[2] : tok[1];
                }
                auto c_it = cols.find(cname);
                if (c_it == cols.end()) throw MpsError("unknown column '" + cname + "' in BOUNDS", line_no);
                int c = c_it->second;
                if (type == "UP") {
                    m.col_upper[c] = v;
                    upper_set[c] = 1;
                    // Legacy convention: a negative upper bound with no lower bound makes the lower bound -inf.
                    if (v < 0 && !lower_set[c] && m.col_lower[c] == 0.0) m.col_lower[c] = -kInf;
                } else if (type == "LO") {
                    m.col_lower[c] = v;
                    lower_set[c] = 1;
                } else if (type == "FX") {
                    m.col_lower[c] = m.col_upper[c] = v;
                    lower_set[c] = upper_set[c] = 1;
                } else if (type == "FR") {
                    m.col_lower[c] = -kInf;
                    m.col_upper[c] = kInf;
                } else if (type == "MI") {
                    m.col_lower[c] = -kInf;
                } else if (type == "PL") {
                    m.col_upper[c] = kInf;
                } else if (type == "BV") {
                    m.col_lower[c] = 0.0;
                    m.col_upper[c] = 1.0;
                    m.is_integer[c] = 1;
                } else if (type == "LI") {
                    m.col_lower[c] = v;
                    m.is_integer[c] = 1;
                } else if (type == "UI") {
                    m.col_upper[c] = v;
                    m.is_integer[c] = 1;
                } else if (type == "SC") {
                    m.col_upper[c] = v;  // semi-continuous treated as its continuous relaxation
                } else {
                    throw MpsError("unknown bound type '" + type + "'", line_no);
                }
                break;
            }
            case Section::Quadratic:
                if (tok.size() >= 3 && parse_number(tok[2], line_no) != 0.0) ++m.quadratic_nnz;
                break;
            default:
                break;
        }
    }

    m.num_rows = static_cast<int>(row_type.size());
    m.num_cols = static_cast<int>(m.col_names.size());
    if (m.name.empty()) m.name = "model";
    if (m.col_lower.empty()) {
        m.col_lower.assign(m.num_cols, 0.0);
        m.col_upper.assign(m.num_cols, kInf);
    }

    m.row_lower.resize(m.num_rows);
    m.row_upper.resize(m.num_rows);
    for (int i = 0; i < m.num_rows; ++i) {
        double b = rhs[i], r = std::fabs(range[i]);
        switch (row_type[i]) {
            case 'E':
                if (has_range[i]) {
                    m.row_lower[i] = range[i] >= 0 ? b : b - r;
                    m.row_upper[i] = range[i] >= 0 ? b + r : b;
                } else {
                    m.row_lower[i] = m.row_upper[i] = b;
                }
                break;
            case 'L':
                m.row_lower[i] = has_range[i] ? b - r : -kInf;
                m.row_upper[i] = b;
                break;
            case 'G':
                m.row_lower[i] = b;
                m.row_upper[i] = has_range[i] ? b + r : kInf;
                break;
        }
    }

    // Build CSC, summing duplicate entries.
    std::stable_sort(entries.begin(), entries.end(), [](const Entry& a, const Entry& b) {
        return a.col != b.col ? a.col < b.col : a.row < b.row;
    });
    m.col_start.assign(m.num_cols + 1, 0);
    for (size_t k = 0; k < entries.size(); ++k) {
        if (!m.value.empty() && k > 0 && entries[k].col == entries[k - 1].col && entries[k].row == entries[k - 1].row) {
            m.value.back() += entries[k].val;
            continue;
        }
        m.row_index.push_back(entries[k].row);
        m.value.push_back(entries[k].val);
        m.col_start[entries[k].col + 1]++;
    }
    for (int j = 0; j < m.num_cols; ++j) m.col_start[j + 1] += m.col_start[j];
    return m;
}

Model read_mps_file(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) throw MpsError("cannot open '" + path + "'", 0);
    return read_mps(f);
}

}  // namespace sovopt
