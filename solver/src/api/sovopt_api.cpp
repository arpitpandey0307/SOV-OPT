#include "sovopt/sovopt.h"

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

}  // extern "C"
